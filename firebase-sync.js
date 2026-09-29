import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDYBsTF5B5KZWHRUk_ipgPVjd_TvIzGtyQ',
  authDomain: 'chiang-garage.firebaseapp.com',
  projectId: 'chiang-garage',
  storageBucket: 'chiang-garage.firebasestorage.app',
  messagingSenderId: '593588251794',
  appId: '1:593588251794:web:718beba30bf5fde2968a4b'
};

export const AUTHORIZED_UIDS = new Set([
  'n1f0iYiWV0WWGHH7oa1VV4RpK9D3',
  'x315KbnccwNB80MDTc4Jukw5FkP2'
]);

export const isAuthorizedUser = user => Boolean(user && AUTHORIZED_UIDS.has(user.uid));

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const garageRef = doc(db, 'garages', 'chiang');

setPersistence(auth, browserLocalPersistence).catch(() => {
  // The browser default still allows the user to sign in for this session.
});

export const watchAuth = callback => onAuthStateChanged(auth, callback);
export const signIn = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const signOutUser = () => signOut(auth);

export const watchGarage = (onData, onMissing, onError) => onSnapshot(
  garageRef,
  snapshot => snapshot.exists() ? onData(snapshot.data()) : onMissing(),
  onError
);

export const writeGarage = state => setDoc(garageRef, {
  ...state,
  schemaVersion: 1,
  updatedAt: serverTimestamp()
});
