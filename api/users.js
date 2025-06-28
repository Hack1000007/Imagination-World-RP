// api/users.js
import { db, adminAuth } from './firebase'; // Importe les instances Firestore et Auth Admin
import { verifyAdmin } from './middlewares/authMiddleware'; // Importe le middleware

export default async function handler(req, res) {
    const usersCollectionRef = db.collection('users');

    if (req.method === 'GET') {
        const { userId } = req.query;

        try {
            if (userId) {
                // Récupérer un utilisateur spécifique par son userId interne (non admin)
                const snapshot = await usersCollectionRef.where('userId', '==', userId).get();
                if (snapshot.empty) {
                    return res.status(404).json({ message: 'Utilisateur non trouvé.' });
                }
                const userData = snapshot.docs[0].data();
                delete userData.password; 
                return res.status(200).json(userData);
            } else {
                // Récupérer tous les utilisateurs (REQUIERT RÔLE ADMIN)
                await verifyAdmin(req, res, async () => { 
                    try {
                        const snapshot = await usersCollectionRef.get();
                        const users = snapshot.docs.map(doc => {
                            const data = doc.data();
                            delete data.password;
                            return { id: doc.id, ...data };
                        });
                        res.status(200).json(users);
                    } catch (error) {
                        console.error('Erreur API /api/users (GET ALL):', error);
                        res.status(500).json({ message: 'Erreur interne du serveur lors de la récupération des utilisateurs.', error: error.message });
                    }
                });
            }
        } catch (error) {
            console.error('Erreur API /api/users (GET - global):', error);
            if (!res.headersSent) { 
                res.status(500).json({ message: 'Erreur inattendue.', error: error.message });
            }
        }

    } else if (req.method === 'POST') {
        // Envoyer un message à un utilisateur spécifique (REQUIERT RÔLE ADMIN)
        await verifyAdmin(req, res, async () => {
            const { targetUserId, messageContent } = req.body;

            if (!targetUserId || !messageContent) {
                return res.status(400).json({ message: 'ID utilisateur cible et contenu du message sont requis.' });
            }

            try {
                const snapshot = await usersCollectionRef.where('userId', '==', targetUserId).get();

                if (snapshot.empty) {
                    return res.status(404).json({ message: 'Utilisateur cible non trouvé.' });
                }

                const userDocRef = snapshot.docs[0].ref;
                const userData = snapshot.docs[0].data();

                const newAdminMessage = {
                    id: '_' + Math.random().toString(36).substr(2, 9),
                    timestamp: new Date().toISOString(),
                    content: messageContent,
                    read: false
                };

                const updatedMessages = [...(userData.messages || []), newAdminMessage];

                await userDocRef.update({ messages: updatedMessages });

                res.status(200).json({ message: 'Message envoyé avec succès.' });

            } catch (error) {
                console.error('Erreur API /api/users (POST - Send Message):', error);
                res.status(500).json({ message: 'Erreur interne du serveur lors de l\'envoi du message.', error: error.message });
            }
        });

    } else if (req.method === 'PUT') {
        // Marquer un message admin comme lu (accessible par l'utilisateur du message)
        const { userId, messageId } = req.body;

        if (!userId || !messageId) {
            return res.status(400).json({ message: 'ID utilisateur et ID message sont requis.' });
        }

        try {
            // Dans un environnement réel, vous vérifieriez ici que l'utilisateur qui fait la requête (via token)
            // est bien l'utilisateur dont les messages sont mis à jour (req.user.uid == userId).
            
            const snapshot = await usersCollectionRef.where('userId', '==', userId).get();

            if (snapshot.empty) {
                return res.status(404).json({ message: 'Utilisateur non trouvé.' });
            }

            const userDocRef = snapshot.docs[0].ref;
            const userData = snapshot.docs[0].data();

            const updatedMessages = (userData.messages || []).map(msg =>
                msg.id === messageId ? { ...msg, read: true } : msg
            );

            await userDocRef.update({ messages: updatedMessages });
            res.status(200).json({ message: 'Message marqué comme lu.' });

        } catch (error) {
            console.error('Erreur API /api/users (PUT - Mark Message Read):', error);
            res.status(500).json({ message: 'Erreur interne du serveur lors de la mise à jour du message.', error: error.message });
        }
    } else if (req.method === 'DELETE') {
        // Supprimer un compte utilisateur (REQUIERT RÔLE ADMIN)
        await verifyAdmin(req, res, async () => {
            const { userId } = req.body;

            if (!userId) {
                return res.status(400).json({ message: 'ID utilisateur à supprimer est requis.' });
            }

            try {
                const userSnapshot = await usersCollectionRef.where('userId', '==', userId).get();

                if (userSnapshot.empty) {
                    return res.status(404).json({ message: 'Utilisateur non trouvé pour la suppression.' });
                }

                const userDocRef = userSnapshot.docs[0].ref;
                await userDocRef.delete(); // Supprime le document utilisateur de Firestore

                // Supprime l'utilisateur de Firebase Authentication
                await adminAuth.deleteUser(userId);

                // Gérer la suppression ou l'archivage des soumissions de personnages liées
                const submissionsCollectionRef = db.collection('characterSubmissions');
                const userSubmissionsSnapshot = await submissionsCollectionRef.where('userId', '==', userId).get();
                const deletePromises = userSubmissionsSnapshot.docs.map(doc => doc.ref.delete());
                await Promise.all(deletePromises);

                // Supprimer les alertes admin liées à cet utilisateur
                const adminAlertsCollectionRef = db.collection('adminAlerts');
                const userAlertsSnapshot = await adminAlertsCollectionRef.where('userId', '==', userId).get();
                const deleteAlertPromises = userAlertsSnapshot.docs.map(doc => doc.ref.delete());
                await Promise.all(deleteAlertPromises);

                res.status(200).json({ message: 'Compte utilisateur et ses données principales supprimés avec succès.' });

            } catch (error) {
                console.error('Erreur API /api/users (DELETE):', error);
                res.status(500).json({ message: 'Erreur interne du serveur lors de la suppression de l\'utilisateur.', error: error.message });
            }
        });
    } else {
        res.status(405).json({ message: 'Méthode non autorisée' });
    }
}

