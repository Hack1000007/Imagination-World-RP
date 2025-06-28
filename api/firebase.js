// api/firebase.js
// Ce fichier initialise votre connexion Firebase/Firestore pour le BACKEND (API Routes).

// Importe les modules du SDK Firebase Admin
const admin = require('firebase-admin');

// CHEMIN VERS VOTRE FICHIER serviceAccountKey.json
// Le fichier .json doit être à la racine du projet, et cette fonction est dans api/
const serviceAccount = require('../../serviceAccountKey.json'); 

let adminApp;

// Initialise Firebase Admin SDK si ce n'est pas déjà fait
if (!admin.apps.length) {
  adminApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // databaseURL est optionnel si vous n'utilisez pas Realtime Database
    // databaseURL: "https://your-project-id.firebaseio.com" 
  });
} else {
  adminApp = admin.app(); // Si déjà initialisé, récupère l'instance existante
}

// Exporte les instances de Firestore et Firebase Auth pour une utilisation dans vos API Routes
export const db = admin.firestore(adminApp); // Instance Firestore Admin
export const adminAuth = admin.auth(adminApp); // Instance Firebase Auth Admin

