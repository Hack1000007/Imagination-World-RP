// api/firebase.js
import admin from 'firebase-admin';
import serviceAccount from '../serviceAccountKey.json'; // <-- CORRECTION ICI: Utilisation de 'import'

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("DEBUG [api/firebase.js]: Firebase Admin SDK initialisé.");
} else {
    console.log("DEBUG [api/firebase.js]: Firebase Admin SDK déjà initialisé.");
}

const db = admin.firestore();
const adminAuth = admin.auth();

export { db, adminAuth };

