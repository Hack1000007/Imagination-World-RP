// api/middlewares/authMiddleware.js
import { adminAuth, db } from '../firebase'; 

export const verifyAdmin = async (req, res, next) => {
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
        console.warn('Accès refusé: Aucun jeton d\'authentification fourni ou format incorrect.');
        return res.status(401).json({ message: 'Non authentifié. Jeton manquant ou mal formaté.' });
    }

    const idToken = req.headers.authorization.split('Bearer ')[1];

    try {
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        req.user = decodedToken; 

        const usersCollectionRef = db.collection('users');
        const snapshot = await usersCollectionRef.where('userId', '==', decodedToken.uid).get();

        if (snapshot.empty) {
            console.warn(`Accès refusé: Utilisateur ${decodedToken.uid} non trouvé dans la collection 'users' de Firestore.`);
            return res.status(403).json({ message: 'Accès refusé. Informations utilisateur introuvables en base de données.' });
        }

        const userData = snapshot.docs[0].data(); 
        
        if (userData.role === 'admin') {
            next();
            return;
        } else {
            console.warn(`Accès refusé: L'utilisateur ${decodedToken.uid} a le rôle '${userData.role || 'non défini'}' au lieu de 'admin'.`);
            return res.status(403).json({ message: 'Accès refusé. Requiert un rôle administrateur.' });
        }

    } catch (error) {
        console.error('Erreur lors de la vérification du jeton ID Firebase ou de la lecture Firestore:', error);
        return res.status(401).json({ message: 'Non authentifié. Jeton invalide ou expiré.', error: error.message });
    }
};

