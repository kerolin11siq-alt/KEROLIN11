import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Utility to clean objects for Firestore (removes undefined)
export function cleanData(data: any): any {
  if (data === null || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(cleanData);
  
  const clean: any = {};
  Object.keys(data).forEach(key => {
    if (data[key] !== undefined) {
      clean[key] = cleanData(data[key]);
    }
  });
  return clean;
}

// Test Connection
async function testConnection() {
  try {
    // We attempt a fetch from server to verify connectivity
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firebase connection established.");
  } catch (error: any) {
    if (error.code === 'unavailable' || (error.message && error.message.includes('the client is offline'))) {
      console.warn("Firestore backend is not reachable. Operating in offline mode.");
    } else if (error.code === 'permission-denied') {
      console.warn("Firestore access denied. Check your rules.");
    } else {
      console.error("Firebase connection error:", error);
    }
  }
}

testConnection();
