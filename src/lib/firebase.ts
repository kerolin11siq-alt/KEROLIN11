import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import localConfig from '../../firebase-applet-config.json';

const getConfigValue = (key: string, localValue: any) => {
  const envValue = import.meta.env[key];
  return envValue && envValue.trim() !== '' ? envValue : localValue;
};

const firebaseConfig = {
  apiKey: getConfigValue('VITE_FIREBASE_API_KEY', localConfig.apiKey),
  authDomain: getConfigValue('VITE_FIREBASE_AUTH_DOMAIN', localConfig.authDomain),
  projectId: getConfigValue('VITE_FIREBASE_PROJECT_ID', localConfig.projectId),
  storageBucket: getConfigValue('VITE_FIREBASE_STORAGE_BUCKET', localConfig.storageBucket),
  messagingSenderId: getConfigValue('VITE_FIREBASE_MESSAGING_SENDER_ID', localConfig.messagingSenderId),
  appId: getConfigValue('VITE_FIREBASE_APP_ID', localConfig.appId),
  measurementId: getConfigValue('VITE_FIREBASE_MEASUREMENT_ID', localConfig.measurementId)
};

const databaseId = getConfigValue('VITE_FIREBASE_DATABASE_ID', localConfig.firestoreDatabaseId);

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, databaseId);
export const auth = getAuth(app);

// Helper for Admin to create users without losing their own session
export const createSecondaryAuth = () => {
  const secondaryAppName = 'secondary-auth';
  const secondaryApp = getApps().find(app => app.name === secondaryAppName) 
    || initializeApp(firebaseConfig, secondaryAppName);
  return getAuth(secondaryApp);
};

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
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: any) {
    if (error.code === 'unavailable') {
      console.warn("Firestore appears offline.");
    }
  }
}

testConnection();
