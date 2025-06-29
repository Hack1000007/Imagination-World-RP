// api/users.js
import { db, adminAuth } from './firebase'; // Importe les instances Firestore et Auth Admin
import { verifyAdmin } from './middlewares/authMiddleware'; // Importe le middleware

export default async function handler(req, res) {
    const usersCollectionRef = db.collection('users');
    console.log(`DEBUG [api/users]: Requête reçue: ${req.method} ${req.url}`);

    if (req.method === 'GET') {
        const { userId } = req.query;
        console.log(`DEBUG [api/users]: Requête GET. userId=${userId}`);

        try {
            if (userId) {
                // Récupérer un utilisateur spécifique par son userId interne (pour les pages client comme index.html)
                console.log(`DEBUG [api/users]: Recherche de l'utilisateur avec userId: ${userId}`);
                const snapshot = await usersCollectionRef.where('userId', '==', userId).get();
                
                if (snapshot.empty) {
                    console.warn(`AVERTISSEMENT [api/users]: Utilisateur ${userId} non trouvé.`);
                    return res.status(404).json({ message: 'Utilisateur non trouvé.' });
                }
                const userData = snapshot.docs[0].data();
                // Ne jamais envoyer le mot de passe côté client, même s'il était stocké
                delete userData.password; 
                console.log(`DEBUG [api/users]: Utilisateur ${userId} trouvé. Données envoyées:`, userData);
                return res.status(200).json(userData);
            } else {
                // Récupérer tous les utilisateurs (REQUIERT RÔLE ADMIN)
                console.log("DEBUG [api/users]: Requête GET pour TOUS les utilisateurs. Vérification admin...");
                await verifyAdmin(req, res, async () => { 
                    try {
                        const snapshot = await usersCollectionRef.get();
                        const users = snapshot.docs.map(doc => {
                            const data = doc.data();
                            delete data.password; // Assurez-vous de ne pas envoyer les mots de passe
                            return { id: doc.id, ...data };
                        });
                        console.log(`DEBUG [api/users]: ${users.length} utilisateurs récupérés (Admin).`);
                        res.status(200).json(users);
                    } catch (error) {
                        console.error('ERREUR [api/users] (GET ALL):', error);
                        res.status(500).json({ message: 'Erreur interne du serveur lors de la récupération des utilisateurs.', error: error.message });
                    }
                });
            }
        } catch (error) {
            console.error('ERREUR [api/users] (GET - global):', error);
            if (!res.headersSent) { 
                res.status(500).json({ message: 'Erreur inattendue lors de la récupération des utilisateurs.', error: error.message });
            }
        }

    } else if (req.method === 'POST') {
        // Envoyer un message à un utilisateur spécifique (REQUIERT RÔLE ADMIN)
        console.log("DEBUG [api/users]: Requête POST (Envoyer message). Vérification admin...");
        await verifyAdmin(req, res, async () => {
            const { targetUserId, messageContent } = req.body;
            console.log(`DEBUG [api/users]: Tentative d'envoi de message à ${targetUserId} avec contenu: "${messageContent.substring(0, 30)}..."`);

            if (!targetUserId || !messageContent) {
                console.warn("AVERTISSEMENT [api/users]: ID utilisateur cible ou contenu du message manquant.");
                return res.status(400).json({ message: 'ID utilisateur cible et contenu du message sont requis.' });
            }

            try {
                const snapshot = await usersCollectionRef.where('userId', '==', targetUserId).get();

                if (snapshot.empty) {
                    console.warn(`AVERTISSEMENT [api/users]: Utilisateur cible ${targetUserId} non trouvé pour envoi de message.`);
                    return res.status(404).json({ message: 'Utilisateur cible non trouvé.' });
                }

                const userDocRef = snapshot.docs[0].ref;
                const userData = snapshot.docs[0].data();

                const newAdminMessage = {
                    id: '_' + Math.random().toString(36).substr(2, 9), // Génère un ID unique pour le message
                    timestamp: new Date().toISOString(),
                    content: messageContent,
                    read: false
                };

                const updatedMessages = [...(userData.messages || []), newAdminMessage];

                await userDocRef.update({ messages: updatedMessages });
                console.log(`DEBUG [api/users]: Message envoyé à ${targetUserId} et ajouté au champ 'messages'.`);
                res.status(200).json({ message: 'Message envoyé avec succès.' });

            } catch (error) {
                console.error('ERREUR [api/users] (POST - Send Message):', error);
                res.status(500).json({ message: 'Erreur interne du serveur lors de l\'envoi du message.', error: error.message });
            }
        });

    } else if (req.method === 'PUT') {
        // Marquer un message admin comme lu (accessible par l'utilisateur du message)
        const { userId, messageId } = req.body;
        console.log(`DEBUG [api/users]: Requête PUT (Marquer message lu) pour userId=${userId}, messageId=${messageId}`);

        if (!userId || !messageId) {
            console.warn("AVERTISSEMENT [api/users]: ID utilisateur ou ID message manquant pour marquer comme lu.");
            return res.status(400).json({ message: 'ID utilisateur et ID message sont requis.' });
        }

        try {
            // Dans un environnement réel, vous vérifieriez ici que l'utilisateur qui fait la requête (via token)
            // est bien l'utilisateur dont les messages sont mis à jour (req.user.uid == userId).
            // Pour ce projet, on se base sur le userId fourni dans le body pour simplifier.
            
            const snapshot = await usersCollectionRef.where('userId', '==', userId).get();

            if (snapshot.empty) {
                console.warn(`AVERTISSEMENT [api/users]: Utilisateur ${userId} non trouvé pour marquer message comme lu.`);
                return res.status(404).json({ message: 'Utilisateur non trouvé.' });
            }

            const userDocRef = snapshot.docs[0].ref;
            const userData = snapshot.docs[0].data();

            const updatedMessages = (userData.messages || []).map(msg =>
                msg.id === messageId ? { ...msg, read: true } : msg
            );

            await userDocRef.update({ messages: updatedMessages });
            console.log(`DEBUG [api/users]: Message ${messageId} de l'utilisateur ${userId} marqué comme lu.`);
            res.status(200).json({ message: 'Message marqué comme lu.' });

        } catch (error) {
            console.error('ERREUR [api/users] (PUT - Mark Message Read):', error);
            res.status(500).json({ message: 'Erreur interne du serveur lors de la mise à jour du message.', error: error.message });
        }
    } else if (req.method === 'DELETE') {
        // Supprimer un compte utilisateur (REQUIERT RÔLE ADMIN)
        console.log("DEBUG [api/users]: Requête DELETE (Supprimer utilisateur). Vérification admin...");
        await verifyAdmin(req, res, async () => {
            const { userId } = req.body;
            console.log(`DEBUG [api/users]: Tentative de suppression de l'utilisateur: ${userId}`);

            if (!userId) {
                console.warn("AVERTISSEMENT [api/users]: ID utilisateur à supprimer manquant.");
                return res.status(400).json({ message: 'ID utilisateur à supprimer est requis.' });
            }

            try {
                const userSnapshot = await usersCollectionRef.where('userId', '==', userId).get();

                if (userSnapshot.empty) {
                    console.warn(`AVERTISSEMENT [api/users]: Utilisateur ${userId} non trouvé pour la suppression.`);
                    return res.status(404).json({ message: 'Utilisateur non trouvé pour la suppression.' });
                }

                const userDocRef = userSnapshot.docs[0].ref;
                await userDocRef.delete(); // Supprime le document utilisateur de Firestore
                console.log(`DEBUG [api/users]: Document Firestore pour ${userId} supprimé.`);

                // Supprime l'utilisateur de Firebase Authentication
                await adminAuth.deleteUser(userId);
                console.log(`DEBUG [api/users]: Utilisateur Firebase Auth ${userId} supprimé.`);

                // Gérer la suppression ou l'archivage des soumissions de personnages liées
                const submissionsCollectionRef = db.collection('characterSubmissions');
                const userSubmissionsSnapshot = await submissionsCollectionRef.where('userId', '==', userId).get();
                const deletePromises = userSubmissionsSnapshot.docs.map(doc => doc.ref.delete());
                await Promise.all(deletePromises);
                console.log(`DEBUG [api/users]: ${deletePromises.length} soumissions de personnages pour ${userId} supprimées.`);

                // Supprimer les alertes admin liées à cet utilisateur
                const adminAlertsCollectionRef = db.collection('adminAlerts');
                const userAlertsSnapshot = await adminAlertsCollectionRef.where('userId', '==', userId).get();
                const deleteAlertPromises = userAlertsSnapshot.docs.map(doc => doc.ref.delete());
                await Promise.all(deleteAlertPromises);
                console.log(`DEBUG [api/users]: ${deleteAlertPromises.length} alertes admin pour ${userId} supprimées.`);


                res.status(200).json({ message: 'Compte utilisateur et ses données principales supprimés avec succès.' });

            } catch (error) {
                console.error('ERREUR [api/users] (DELETE):', error);
                res.status(500).json({ message: 'Erreur interne du serveur lors de la suppression de l\'utilisateur.', error: error.message });
            }
        });
    } else {
        console.warn(`AVERTISSEMENT [api/users]: Méthode non autorisée: ${req.method}`);
        res.status(405).json({ message: 'Méthode non autorisée' });
    }
}

                                             
