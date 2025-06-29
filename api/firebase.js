// api/firebase.js
import admin from 'firebase-admin';
// <-- CORRECTION ICI: Ajout de 'assert { type: 'json' }'
import serviceAccount from '../serviceAccountKey.json' assert { type: 'json' }; 

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

