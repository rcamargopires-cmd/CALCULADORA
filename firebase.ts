import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from './firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
// Use the storage bucket declared in firebaseConfig. Passing the bare bucket name
// as the optional bucketUrl can create an invalid Storage reference in some SDK flows.
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
