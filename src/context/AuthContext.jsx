import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, addDoc, collection, serverTimestamp, onSnapshot } from 'firebase/firestore'
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
  const [blockedReason, setBlockedReason] = useState(null) // 'disabled' | 'suspended' | null
  const watchersRef = useRef([])

  const clearWatchers = () => {
    watchersRef.current.forEach((unsub) => unsub())
    watchersRef.current = []
  }

  const loadProfile = useCallback(async (uid) => {
    clearWatchers()

    if (!uid) {
      setProfile(null)
      setTenantId(null)
      return
    }

    const linkSnap = await getDoc(doc(db, 'userTenants', uid))
    if (!linkSnap.exists()) {
      setProfile(null)
      setTenantId(null)
      return
    }
    const link = linkSnap.data()

    if (link.role === 'super_admin') {
      setTenantId(null)
      setBlockedReason(null)
      setProfile({ id: uid, role: 'super_admin', tenantId: null })
      return
    }

    setTenantId(link.tenantId)

    // Check the shop itself hasn't been suspended by the super admin
    const tenantSnap = await getDoc(doc(db, 'tenants', link.tenantId))
    if (!tenantSnap.exists() || tenantSnap.data().subscriptionStatus !== 'active') {
      setProfile(null)
      setBlockedReason('suspended')
      await signOut(auth)
      return
    }

    // Check this specific staff member hasn't been disabled by their shop admin
    const profSnap = await getDoc(doc(db, ...tPath('profiles', uid)))
    if (!profSnap.exists() || profSnap.data().is_active === false) {
      setProfile(null)
      setBlockedReason('disabled')
      await signOut(auth)
      return
    }

    setBlockedReason(null)
    setProfile({ id: profSnap.id, tenantId: link.tenantId, ...profSnap.data() })

    // Live watchers: if an admin disables this person, or the shop gets suspended,
    // WHILE they're actively using the app, log them out immediately (not just on next login).
    const unsubProfile = onSnapshot(doc(db, ...tPath('profiles', uid)), (s) => {
      if (!s.exists() || s.data().is_active === false) {
        setBlockedReason('disabled')
        signOut(auth)
      }
    })
    const unsubTenant = onSnapshot(doc(db, 'tenants', link.tenantId), (s) => {
      if (!s.exists() || s.data().subscriptionStatus !== 'active') {
        setBlockedReason('suspended')
        signOut(auth)
      }
    })
    watchersRef.current = [unsubProfile, unsubTenant]
  }, [])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      await loadProfile(u?.uid)
      setLoading(false)
    })
    return () => { unsub(); clearWatchers() }
  }, [loadProfile])

  const login = async (email, password) => {
    setBlockedReason(null)
    const cred = await signInWithEmailAndPassword(auth, email, password)
    await loadProfile(cred.user.uid)
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
    clearWatchers()
    await signOut(auth)
    setTenantId(null)
  }

  const can = (pageKey) => {
    if (!profile) return false
    if (profile.role === 'super_admin') return false
    const perms = ROLE_PERMISSIONS[profile.role] || []
    return perms.includes('*') || perms.includes(pageKey)
  }

  const value = { session: user, profile, loading, blockedReason, login, logout, can }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
