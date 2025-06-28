// api/alerts.js
// Gère les alertes administrateur stockées dans Firestore.

import { db } from './firebase'; // Importe l'instance de la base de données Firestore Admin
import { verifyAdmin } from './middlewares/authMiddleware'; // Importe le middleware

export default async function handler(req, res) {
    const adminAlertsCollectionRef = db.collection('adminAlerts');

    if (req.method === 'POST') {
        // Créer une nouvelle alerte (utilisée par les fonctions backend internes)
        const newAlert = req.body;
        if (!newAlert.type || !newAlert.message || !newAlert.timestamp) {
            return res.status(400).json({ message: 'Type, message et timestamp de l\'alerte sont requis.' });
        }
        
        try {
            const docRef = await adminAlertsCollectionRef.add(newAlert);
            res.status(201).json({ message: 'Alerte créée', id: docRef.id });
        } catch (error) {
            console.error('Erreur API /api/alerts (POST):', error);
            res.status(500).json({ message: 'Erreur interne du serveur lors de la création de l\'alerte.', error: error.message });
        }

    } else if (req.method === 'GET') {
        // Récupérer toutes les alertes (REQUIERT RÔLE ADMIN)
        await verifyAdmin(req, res, async () => {
            try {
                const snapshot = await adminAlertsCollectionRef.get();
                const alerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                res.status(200).json(alerts);
            } catch (error) {
                console.error('Erreur API /api/alerts (GET):', error);
                res.status(500).json({ message: 'Erreur interne du serveur lors de la récupération des alertes.', error: error.message });
            }
        });

    } else if (req.method === 'DELETE') {
        // Supprimer une alerte (marquer comme lue/traitée) (REQUIERT RÔLE ADMIN)
        await verifyAdmin(req, res, async () => {
            const { id } = req.query;

            if (!id) {
                return res.status(400).json({ message: 'ID de l\'alerte est requis pour la suppression.' });
            }

            try {
                await adminAlertsCollectionRef.doc(id).delete();
                res.status(200).json({ message: 'Alerte supprimée avec succès.' });
            } catch (error) {
                console.error('Erreur API /api/alerts (DELETE):', error);
                res.status(500).json({ message: 'Erreur interne du serveur lors de la suppression de l\'alerte.', error: error.message });
            }
        });
    } else {
        res.status(405).json({ message: 'Méthode non autorisée.' });
    }
}

