import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { auth, db, tPath, setTenantId, TENANT_ID } from '../lib/firebase'

const AuthContext = createContext(null)

export const ROLE_PERMISSIONS = {
  admin: ['*'],
  manager: [
    'dashboard', 'products', 'sales', 'purchases', 'customers', 'suppliers',
    'debts', 'reports', 'settings', 'audit', 'backup', 'consignment', 'cashbank',
  ],
  cashier: ['dashboard', 'sales', 'customers', 'debts', 'consignment'],
  technician: ['dashboard'],
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Every user (super admin or shop staff) has one small lookup document at the
  // ROOT level: userTenants/{uid}. This tells us which tenant they belong to
  // (or that they're a super admin) BEFORE we know which tenant's profile to load.
  const loadProfile = useCallback(async (uid) => {
    if (!uid) {
      setProfile(null)
      setTenantId(null)
      return
    }

    const linkSnap = await getDoc(doc(db, 'userTenants', uid))
    if (!linkSnap.exists()) {
      // No link record = not provisioned yet. Treat as logged out.
      setProfile(null)
      setTenantId(null)
      return
    }
    const link = linkSnap.data()

    if (link.role === 'super_admin') {
      setTenantId(null)
      setProfile({ id: uid, role: 'super_admin', tenantId: null })
      return
    }

    setTenantId(link.tenantId)
    const snap = await getDoc(doc(db, ...tPath('profiles', uid)))
    setProfile(snap.exists() ? { id: snap.id, tenantId: link.tenantId, ...snap.data() } : null)
  }, [])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      await loadProfile(u?.uid)
      setLoading(false)
    })
    return unsub
  }, [loadProfile])

  const login = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    await loadProfile(cred.user.uid)
    // Only log shop-level logins (super admin has no tenant to log against)
    if (TENANT_ID) {
      await addDoc(collection(db, ...tPath('loginHistory')), {
        user_id: cred.user.uid,
        device_info: navigator.userAgent,
        logged_in_at: serverTimestamp(),
      })
    }
    return cred
  }

  const logout = async () => {
    await signOut(auth)
    setTenantId(null)
  }

  const can = (pageKey) => {
    if (!profile) return false
    if (profile.role === 'super_admin') return false // super admin uses its own screen, not shop pages
    const perms = ROLE_PERMISSIONS[profile.role] || []
    return perms.includes('*') || perms.includes(pageKey)
  }

  const value = { session: user, profile, loading, login, logout, can }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
