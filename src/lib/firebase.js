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

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

export const auth = getAuth(app)

// ---- Multi-tenant support ----
// TENANT_ID is no longer fixed. It's set right after login, based on which shop
// the logged-in user belongs to (see AuthContext.jsx). Super admins have no
// tenant at all (they see the "Manage Clients" screen instead of shop data).
export let TENANT_ID = null

export function setTenantId(id) {
  TENANT_ID = id
}

// tPath('products') -> ['tenants', TENANT_ID, 'products']
// Throws clearly if called before a tenant is known, instead of silently
// reading/writing the wrong shop's data.
export const tPath = (...segments) => {
  if (!TENANT_ID) {
    throw new Error('tPath() called before a tenant was set — check AuthContext login flow.')
  }
  return ['tenants', TENANT_ID, ...segments]
}
