import { initializeApp, getApps } from 'firebase/app'
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

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

export const auth = getAuth(app)

// A second, independent Firebase Auth instance. Used only when the Super Admin
// creates a new shop's first login — creating a user normally signs the app in
// as that new user, which would kick the Super Admin out. Using a separate
// instance avoids that entirely.
const secondaryApp = getApps().find((a) => a.name === 'Secondary') || initializeApp(firebaseConfig, 'Secondary')
export const secondaryAuth = getAuth(secondaryApp)

// ---- Multi-tenant support ----
export let TENANT_ID = null

export function setTenantId(id) {
  TENANT_ID = id
}

// tPath('products') -> ['tenants', TENANT_ID, 'products']
export const tPath = (...segments) => {
  if (!TENANT_ID) {
    throw new Error('tPath() called before a tenant was set — check AuthContext login flow.')
  }
  return ['tenants', TENANT_ID, ...segments]
}
