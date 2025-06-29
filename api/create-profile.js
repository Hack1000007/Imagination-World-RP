// api/create-profile.js
// Ce nouveau point d'API est responsable de la création du document utilisateur
// dans Firestore en utilisant Firebase Admin SDK.
// Cela contourne les règles de sécurité Firestore côté client, garantissant que le profil est toujours créé.

import { db, adminAuth } from './firebase'; // Importe les instances Firestore et Auth Admin

export default async function handler(req, res) {
    console.log(`DEBUG [api/create-profile]: Requête reçue: ${req.method} ${req.url}`);

    if (req.method === 'POST') {
        const { userId, firstName, lastName, username, email, phone, role, createdAt } = req.body;
        console.log(`DEBUG [api/create-profile]: Données reçues pour création de profil: userId=${userId}, username=${username}`);

        // Optionnel mais recommandé: Vérifier le token d'authentification de l'utilisateur
        // pour s'assurer que la requête provient d'un utilisateur authentifié.
        // Cela peut être fait en vérifiant le header 'Authorization'.
        // Pour ce cas, on se fie à ce que userId est bien l'UID de l'utilisateur qui s'est juste inscrit.
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.warn("AVERTISSEMENT [api/create-profile]: Tentative de création de profil sans token d'authentification.");
            // Dans une application plus stricte, vous pourriez renvoyer une erreur 401 ici.
            // Pour le moment, nous allons laisser passer pour le débogage initial.
        } else {
            const idToken = authHeader.split('Bearer ')[1];
            try {
                const decodedToken = await adminAuth.verifyIdToken(idToken);
                if (decodedToken.uid !== userId) {
                    console.error("ERREUR [api/create-profile]: Tentative de créer un profil pour un UID différent du token fourni.");
                    return res.status(403).json({ message: 'Accès non autorisé: UID du token ne correspond pas.' });
                }
                console.log(`DEBUG [api/create-profile]: Token d'ID vérifié pour UID: ${decodedToken.uid}`);
            } catch (error) {
                console.error("ERREUR [api/create-profile]: Erreur de vérification du token d'ID:", error);
                return res.status(401).json({ message: 'Non autorisé: Token invalide ou expiré.' });
            }
        }


        if (!userId || !username || !email) {
            console.warn("AVERTISSEMENT [api/create-profile]: Données de profil utilisateur manquantes.");
            return res.status(400).json({ message: 'UserId, nom d\'utilisateur et email sont requis.' });
        }

        try {
            // Utilise l'Admin SDK pour créer ou mettre à jour le document utilisateur dans Firestore
            // Cette opération contourne les règles de sécurité Firestore côté client.
            await db.collection('users').doc(userId).set({
                userId: userId,
                firstName: firstName || null,
                lastName: lastName || null,
                username: username,
                email: email,
                phone: phone || null,
                role: role || 'user', // Assure un rôle par défaut si non fourni
                createdAt: createdAt || new Date().toISOString(),
                messages: [] // Initialise le tableau de messages pour les admins
            }, { merge: true }); // 'merge: true' est utile si le document existe déjà (non applicable à la création ici)

            console.log(`DEBUG [api/create-profile]: Document utilisateur ${userId} créé/mis à jour dans Firestore via Admin SDK.`);
            res.status(200).json({ message: 'Profil utilisateur créé/mis à jour avec succès.' });

        } catch (error) {
            console.error('ERREUR [api/create-profile]: Erreur lors de la création/mise à jour du profil utilisateur dans Firestore:', error);
            res.status(500).json({ message: 'Erreur interne du serveur lors de la création du profil.', error: error.message });
        }

    } else {
        console.warn(`AVERTISSEMENT [api/create-profile]: Méthode non autorisée: ${req.method}`);
        res.status(405).json({ message: 'Méthode non autorisée' });
    }
}

