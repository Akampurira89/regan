import { initializeApp } from 'firebase/app'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('Missing Firebase env vars. Copy .env.example to .env and fill in your project config.')
}

export const app = initializeApp(firebaseConfig)

// Firestore with offline persistence + multi-tab support. This is what gives the app
// real offline-ready behavior: reads/writes queue locally when there's no connection
// (common with shop wifi/data) and sync automatically once back online.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

export const auth = getAuth(app)

// ---- Multi-tenant support ----
// TENANT_ID identifies which shop's data this deployment reads/writes.
// Eddy K Electronics (your own shop) uses 'eddyk-main'. Future clients you
// onboard will each get their own tenant id here (or loaded dynamically later).
export const TENANT_ID = 'eddyk-main'

// tPath('products') -> ['tenants', 'eddyk-main', 'products']
// tPath('sales', saleId, 'items') -> ['tenants', 'eddyk-main', 'sales', saleId, 'items']
// Use it like: collection(db, ...tPath('products'))  or  doc(db, ...tPath('products', id))
export const tPath = (...segments) => ['tenants', TENANT_ID, ...segments]
