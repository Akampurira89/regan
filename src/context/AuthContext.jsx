import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

const AuthContext = createContext(null)

export const ROLE_PERMISSIONS = {
  admin: ['*'],
  manager: [
    'dashboard', 'products', 'sales', 'purchases', 'customers', 'suppliers',
    'repairs', 'warranties', 'debts', 'reports', 'settings', 'audit', 'backup', 'consignment',
  ],
  cashier: ['dashboard', 'sales', 'customers', 'debts', 'consignment'],
  technician: ['dashboard', 'repairs', 'warranties'],
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (uid) => {
    if (!uid) { setProfile(null); return }
    const snap = await getDoc(doc(db, 'profiles', uid))
    setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null)
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
    await addDoc(collection(db, 'loginHistory'), {
      user_id: cred.user.uid,
      device_info: navigator.userAgent,
      logged_in_at: serverTimestamp(),
    })
    return cred
  }

  const logout = async () => signOut(auth)

  const can = (pageKey) => {
    if (!profile) return false
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
