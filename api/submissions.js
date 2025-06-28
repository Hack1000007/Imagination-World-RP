// api/submissions.js
import { db } from './firebase'; // Importe l'instance de la base de données Firestore Admin
import { verifyAdmin } from './middlewares/authMiddleware'; // Importe le middleware

export default async function handler(req, res) {
    const submissionsCollectionRef = db.collection('characterSubmissions');
    const adminAlertsCollectionRef = db.collection('adminAlerts');

    if (req.method === 'POST') {
        // Création d'une nouvelle soumission par un joueur (ne nécessite PAS un rôle admin pour cette action)
        const newSubmission = req.body;
        if (!newSubmission.userId || !newSubmission.characterData || !newSubmission.status) {
            return res.status(400).json({ message: 'Données de soumission invalides.' });
        }
        
        try {
            if (newSubmission.type === 'overwrite') {
                const q = submissionsCollectionRef.where('userId', '==', newSubmission.userId)
                                                    .where('status', 'in', ['pending', 'accepted', 'completed'])
                                                    .get();
                const snapshot = await q;

                if (!snapshot.empty) {
                    const oldSubmissionDoc = snapshot.docs[0];
                    await oldSubmissionDoc.ref.update({ status: 'overwritten' });
                    
                    await adminAlertsCollectionRef.add({
                        type: 'character_overwritten',
                        userId: newSubmission.userId,
                        oldCharacterName: oldSubmissionDoc.data().characterData.nomAvatar,
                        newCharacterName: newSubmission.characterData.nomAvatar,
                        timestamp: new Date().toISOString(),
                        message: `Le joueur ${newSubmission.username} (ID: ${newSubmission.userId}) a écrasé son personnage : "${oldSubmissionDoc.data().characterData.nomAvatar}" avec "${newSubmission.characterData.nomAvatar}".`
                    });
                }
                delete newSubmission.type; 
                delete newSubmission.username;
            }

            const docRef = await submissionsCollectionRef.add(newSubmission);
            res.status(201).json({ message: 'Soumission créée', id: docRef.id });

        } catch (error) {
            console.error('Erreur API /api/submissions (POST):', error);
            res.status(500).json({ message: 'Erreur interne du serveur lors de la création de la soumission.', error: error.message });
        }

    } else if (req.method === 'GET') {
        // Récupérer toutes les soumissions (REQUIERT RÔLE ADMIN)
        await verifyAdmin(req, res, async () => {
            try {
                const snapshot = await submissionsCollectionRef.get();
                const submissions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                res.status(200).json(submissions);
            } catch (error) {
                console.error('Erreur API /api/submissions (GET):', error);
                res.status(500).json({ message: 'Erreur interne du serveur lors de la récupération des soumissions.', error: error.message });
            }
        });

    } else if (req.method === 'PUT') {
        // Mettre à jour le statut d'une soumission (Accept/Refuse/Complete) (REQUIERT RÔLE ADMIN)
        await verifyAdmin(req, res, async () => {
            const { submissionId, status, refusalDetails, playerCardImage } = req.body;

            if (!submissionId || !status) {
                return res.status(400).json({ message: 'ID de soumission et statut sont requis.' });
            }

            try {
                const submissionDocRef = submissionsCollectionRef.doc(submissionId);
                const updateData = { status: status };

                if (status === 'refused' && refusalDetails) {
                    updateData.refusalDetails = refusalDetails;
                } else if (status === 'completed' && playerCardImage) {
                    updateData.playerCardImage = playerCardImage;
                }

                await submissionDocRef.update(updateData);

                res.status(200).json({ message: `Statut de la soumission ${submissionId} mis à jour à ${status}.` });

            } catch (error) {
                console.error('Erreur API /api/submissions (PUT):', error);
                res.status(500).json({ message: 'Erreur interne du serveur lors de la mise à jour du statut.', error: error.message });
            }
        });

    } else {
        res.status(405).json({ message: 'Méthode non autorisée' });
    }
}

