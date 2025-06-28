// api/index.js
// Ce fichier agit comme le routeur principal pour toutes vos API Serverless sur Vercel.

// Importation dynamique des gestionnaires d'API.
// Cela permet de n'importer que le handler nécessaire par requête, optimisant les cold starts.
const apiHandlers = {
    '/api/users': async () => (await import('./users')).default,
    '/api/submissions': async () => (await import('./submissions')).default,
    '/api/alerts': async () => (await import('./alerts')).default,
    '/api/user_settings': async () => (await import('./user_settings')).default,
    // Si vous avez d'autres fichiers API comme api/test.js, ajoutez-les ici:
    // '/api/test': async () => (await import('./test')).default,
};

export default async function handler(req, res) {
    // Vercel réécrit souvent les chemins pour les fonctions Serverless.
    // Pour des routes comme `/api/users`, le pathname peut être `/api/users`.
    // Pour des routes imbriquées comme `/api/middlewares/authMiddleware`, cela pourrait être `/api/middlewares/authMiddleware`.
    // Assurez-vous que la clé dans `apiHandlers` correspond à la façon dont Vercel route.
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    
    // Déterminer la route basée sur le début du chemin, car Vercel peut envoyer /api/users/<id>
    const matchedPath = Object.keys(apiHandlers).find(path => pathname.startsWith(path));

    const routeHandlerLoader = apiHandlers[matchedPath];

    if (routeHandlerLoader) {
        try {
            const routeHandler = await routeHandlerLoader(); // Charge dynamiquement le handler
            await routeHandler(req, res); // Appelle le handler correspondant à la route
        } catch (error) {
            console.error(`Erreur lors du chargement ou de l'exécution du handler pour ${pathname}:`, error);
            res.status(500).json({ message: 'Erreur interne du serveur lors du traitement de la requête.', error: error.message });
        }
    } else {
        // Fallback si aucune route spécifique n'est trouvée, mais la requête est sous /api/
        if (pathname.startsWith('/api/')) {
            res.status(404).json({ message: `Route API non trouvée pour ${pathname}.` });
        } else {
            // Ceci ne devrait pas arriver si le routeur est correctement configuré
            res.status(404).json({ message: `Ressource non trouvée pour ${pathname}.` });
        }
    }
}

