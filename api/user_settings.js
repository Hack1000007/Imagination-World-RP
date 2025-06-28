// api/user_settings.js
import { db, adminAuth } from './firebase'; // Importe les instances Firestore et Auth Admin

export default async function handler(req, res) {
    const usersCollectionRef = db.collection('users');

    const { userId } = req.body;
    const { userId: queryUserId } = req.query;

    const targetUserId = userId || queryUserId;

    if (!targetUserId) {
        return res.status(400).json({ message: 'L\'ID utilisateur est requis pour cette opération.' });
    }

    try {
        const snapshot = await usersCollectionRef.where('userId', '==', targetUserId).get();

        if (snapshot.empty) {
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        }

        const userDocRef = snapshot.docs[0].ref;
        const userData = snapshot.docs[0].data();

        if (req.method === 'PUT') {
            const { action, ...dataToUpdate } = req.body;

            if (action === 'updateProfile') {
                const { firstName, lastName, username, email, phone } = dataToUpdate;

                const uniquenessChecks = [
                    { field: 'username', value: username, message: 'Ce nom d\'utilisateur est déjà pris.', check: username && username !== userData.username },
                    { field: 'email', value: email, message: 'Cette adresse e-mail est déjà utilisée.', check: email && email !== userData.email },
                    { field: 'phone', value: phone, message: 'Ce numéro de téléphone est déjà utilisé.', check: phone && phone !== userData.phone }
                ];

                for (const check of uniquenessChecks) {
                    if (check.check) {
                        const qCheck = usersCollectionRef.where(check.field, '==', check.value);
                        const snapshotCheck = await qCheck.get();
                        if (!snapshotCheck.empty) {
                            return res.status(409).json({ message: check.message });
                        }
                    }
                }
                
                await userDocRef.update({
                    firstName: firstName || userData.firstName,
                    lastName: lastName || userData.lastName,
                    username: username || userData.username,
                    email: email || null,
                    phone: phone || null,
                    updatedAt: new Date().toISOString()
                });
                return res.status(200).json({ message: 'Informations de profil mises à jour avec succès.' });

            } else if (action === 'changePassword') {
                const { oldPassword, newPassword } = dataToUpdate;

                if (userData.password !== oldPassword) {
                    return res.status(401).json({ message: 'Ancien mot de passe incorrect.' });
                }
                if (newPassword.length < 6) {
                    return res.status(400).json({ message: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' });
                }
                
                await userDocRef.update({ password: newPassword, updatedAt: new Date().toISOString() });
                return res.status(200).json({ message: 'Mot de passe mis à jour avec succès.' });

            } else {
                return res.status(400).json({ message: 'Action de mise à jour non reconnue.' });
            }

        } else if (req.method === 'DELETE') {
            await userDocRef.delete();

            const submissionsCollectionRef = db.collection('characterSubmissions');
            const userSubmissionsSnapshot = await submissionsCollectionRef.where('userId', '==', targetUserId).get();
            const deleteSubmissionsPromises = userSubmissionsSnapshot.docs.map(doc => doc.ref.delete());
            await Promise.all(deleteSubmissionsPromises);

            const adminAlertsCollectionRef = db.collection('adminAlerts');
            const userAlertsSnapshot = await adminAlertsCollectionRef.where('userId', '==', targetUserId).get();
            const deleteAlertsPromises = userAlertsSnapshot.docs.map(doc => doc.ref.delete());
            await Promise.all(deleteAlertsPromises);

            await adminAuth.deleteUser(targetUserId);

            return res.status(200).json({ message: 'Compte utilisateur et données associées supprimés avec succès.' });

        } else {
            res.status(405).json({ message: 'Méthode non autorisée.' });
        }
    } catch (error) {
        console.error('Erreur API /api/user_settings:', error);
        res.status(500).json({ message: 'Erreur interne du serveur.', error: error.message });
    }
}

