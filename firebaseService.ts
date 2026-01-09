
// We use the compat library as per the original project requirement for rapid cloning
import firebase from 'firebase/compat/app';
import 'firebase/compat/database';

const firebaseConfig = {
  apiKey: "AIzaSyDVj2Mda_x16XiegcR0Mqk5fWI4m7BlrMk",
  authDomain: "beecfaucet.firebaseapp.com",
  databaseURL: "https://beecfaucet-default-rtdb.firebaseio.com",
  projectId: "beecfaucet",
  storageBucket: "beecfaucet.firebasestorage.app",
  messagingSenderId: "867086977888",
  appId: "1:867086977888:web:415084058e5b0ad369ec05"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const db = firebase.database();
export default firebase;
