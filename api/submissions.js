// api/submissions.js
import { db } from './firebase'; // Importe l'instance de la base de données Firestore Admin
import { verifyAdmin } from './middlewares/authMiddleware'; // Importe le middleware

export default async function handler(req, res) {
    const submissionsCollectionRef = db.collection('characterSubmissions');
    const adminAlertsCollectionRef = db.collection('adminAlerts');
    console.log(`DEBUG [api/submissions]: Requête reçue: ${req.method} ${req.url}`);

    if (req.method === 'POST') {
        // Création d'une nouvelle soumission par un joueur (ne nécessite PAS un rôle admin pour cette action)
        const newSubmission = req.body;
        console.log("DEBUG [api/submissions]: Requête POST (création de soumission). Données reçues:", newSubmission);

        if (!newSubmission.userId || !newSubmission.characterData || !newSubmission.status) {
            console.warn("AVERTISSEMENT [api/submissions]: Données de soumission invalides (POST).");
            return res.status(400).json({ message: 'Données de soumission invalides.' });
        }
        
        try {
            if (newSubmission.type === 'overwrite') {
                console.log(`DEBUG [api/submissions]: Détection d'une soumission de type 'overwrite' pour userId: ${newSubmission.userId}`);
                const q = submissionsCollectionRef.where('userId', '==', newSubmission.userId)
                                                    .where('status', 'in', ['pending', 'accepted', 'completed'])
                                                    .get();
                const snapshot = await q;

                if (!snapshot.empty) {
                    const oldSubmissionDoc = snapshot.docs[0];
                    console.log(`DEBUG [api/submissions]: Ancienne soumission trouvée (${oldSubmissionDoc.id}). Changement de statut à 'overwritten'.`);
                    await oldSubmissionDoc.ref.update({ status: 'overwritten' });
                    
                    await adminAlertsCollectionRef.add({
                        type: 'character_overwritten',
                        userId: newSubmission.userId,
                        oldCharacterName: oldSubmissionDoc.data().characterData.nomAvatar,
                        newCharacterName: newSubmission.characterData.nomAvatar,
                        timestamp: new Date().toISOString(),
                        message: `Le joueur ${newSubmission.username} (ID: ${newSubmission.userId}) a écrasé son personnage : "${oldSubmissionDoc.data().characterData.nomAvatar}" avec "${newSubmission.characterData.nomAvatar}".`
                    });
                    console.log("DEBUG [api/submissions]: Alerte admin créée pour l'écrasement du personnage.");
                }
                // Supprimer ces champs temporaires avant d'ajouter la nouvelle soumission
                delete newSubmission.type; 
                delete newSubmission.username;
            }

            const docRef = await submissionsCollectionRef.add(newSubmission);
            console.log(`DEBUG [api/submissions]: Nouvelle soumission créée dans Firestore avec ID: ${docRef.id}`);
            res.status(201).json({ message: 'Soumission créée', id: docRef.id });

        } catch (error) {
            console.error('ERREUR [api/submissions] (POST - création):', error);
            res.status(500).json({ message: 'Erreur interne du serveur lors de la création de la soumission.', error: error.message });
        }

    } else if (req.method === 'GET') {
        const { userId } = req.query;
        console.log(`DEBUG [api/submissions]: Requête GET. userId=${userId}`);

        try {
            if (userId) {
                // Si un userId est fourni, permettre à l'utilisateur de récupérer SES soumissions
                // Cela est vital pour la page index.html et player_notifications.html côté client
                console.log(`DEBUG [api/submissions]: Recherche des soumissions pour userId: ${userId}`);
                const q = submissionsCollectionRef.where('userId', '==', userId).get();
                const snapshot = await q;
                const userSubmissions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                console.log(`DEBUG [api/submissions]: ${userSubmissions.length} soumissions trouvées pour userId: ${userId}`);
                return res.status(200).json(userSubmissions);
            } else {
                // Récupérer toutes les soumissions (REQUIERT RÔLE ADMIN)
                console.log("DEBUG [api/submissions]: Requête GET pour TOUTES les soumissions. Vérification admin...");
                await verifyAdmin(req, res, async () => {
                    try {
                        const snapshot = await submissionsCollectionRef.get();
                        const submissions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        console.log(`DEBUG [api/submissions]: ${submissions.length} soumissions récupérées (Admin).`);
                        res.status(200).json(submissions);
                    } catch (error) {
                        console.error('ERREUR [api/submissions] (GET ALL):', error);
                        res.status(500).json({ message: 'Erreur interne du serveur lors de la récupération des soumissions.', error: error.message });
                    }
                });
            }
        } catch (error) {
            console.error('ERREUR [api/submissions] (GET - global):', error);
            if (!res.headersSent) { // Vérifie si les headers n'ont pas déjà été envoyés par verifyAdmin
                res.status(500).json({ message: 'Erreur inattendue lors de la récupération des soumissions.', error: error.message });
            }
        }

    } else if (req.method === 'PUT') {
        // Mettre à jour le statut d'une soumission (Accept/Refuse/Complete) (REQUIERT RÔLE ADMIN)
        console.log("DEBUG [api/submissions]: Requête PUT (mise à jour de soumission). Vérification admin...");
        await verifyAdmin(req, res, async () => {
            const { submissionId, status, refusalDetails, playerCardImage } = req.body;
            console.log(`DEBUG [api/submissions]: Mise à jour de la soumission ${submissionId} au statut: ${status}`);

            if (!submissionId || !status) {
                console.warn("AVERTISSEMENT [api/submissions]: ID de soumission ou statut manquant (PUT).");
                return res.status(400).json({ message: 'ID de soumission et statut sont requis.' });
            }

            try {
                const submissionDocRef = submissionsCollectionRef.doc(submissionId);
                const updateData = { status: status };

                if (status === 'refused' && refusalDetails) {
                    updateData.refusalDetails = refusalDetails;
                    console.log("DEBUG [api/submissions]: Ajout des détails de refus.");
                } else if (status === 'completed' && playerCardImage) {
                    updateData.playerCardImage = playerCardImage;
                    console.log("DEBUG [api/submissions]: Ajout de l'image de la carte joueur.");
                }

                await submissionDocRef.update(updateData);
                console.log(`DEBUG [api/submissions]: Soumission ${submissionId} mise à jour avec succès.`);
                res.status(200).json({ message: `Statut de la soumission ${submissionId} mis à jour à ${status}.` });

            } catch (error) {
                console.error('ERREUR [api/submissions] (PUT):', error);
                res.status(500).json({ message: 'Erreur interne du serveur lors de la mise à jour du statut.', error: error.message });
            }
        });

    } else {
        console.warn(`AVERTISSEMENT [api/submissions]: Méthode non autorisée: ${req.method}`);
        res.status(405).json({ message: 'Méthode non autorisée' });
    }
}

                    
