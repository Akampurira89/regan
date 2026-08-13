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
  const [blockedReason, setBlockedReason] = useState(null)
  const watchersRef = useRef([])

  // Super admin "view as this shop" mode. Not persisted — always starts fresh
  // from Manage Clients each session, so nobody's left inside a shop by accident.
  const [viewingAs, setViewingAs] = useState(null) // { tenantId, shopName } | null

  const clearWatchers = () => {
    watchersRef.current.forEach((unsub) => unsub())
    watchersRef.current = []
  }

  const loadProfile = useCallback(async (uid) => {
    clearWatchers()

    if (!uid) {
      setProfile(null)
      setTenantId(null)
      setViewingAs(null)
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
      setProfile({ id: uid, role: 'super_admin', full_name: 'Super Admin', tenantId: null })
      return
    }

    setTenantId(link.tenantId)

    const tenantSnap = await getDoc(doc(db, 'tenants', link.tenantId))
    if (!tenantSnap.exists() || tenantSnap.data().subscriptionStatus !== 'active') {
      setProfile(null)
      setBlockedReason('suspended')
      await signOut(auth)
      return
    }

    const profSnap = await getDoc(doc(db, ...tPath('profiles', uid)))
    if (!profSnap.exists() || profSnap.data().is_active === false) {
      setProfile(null)
      setBlockedReason('disabled')
      await signOut(auth)
      return
    }

    setBlockedReason(null)
    setProfile({ id: profSnap.id, tenantId: link.tenantId, ...profSnap.data() })

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
    setViewingAs(null)
    await signOut(auth)
    setTenantId(null)
  }

  // Lets a super admin step into a specific shop and see/use it exactly like
  // that shop's own admin would — same pages, same data, same permissions.
  const viewAsShop = (tenantId, shopName) => {
    if (profile?.role !== 'super_admin') return
    setTenantId(tenantId)
    setViewingAs({ tenantId, shopName })
  }

  const exitViewAs = () => {
    setTenantId(null)
    setViewingAs(null)
  }

  // The tenant currently "in effect" for data access: the shop staff's own
  // tenant, OR whichever shop a super admin is currently viewing, OR none.
  const activeTenantId = profile?.role === 'super_admin' ? (viewingAs?.tenantId || null) : (profile?.tenantId || null)

  const can = (pageKey) => {
    if (profile?.role === 'super_admin') {
      // Full access to every shop page while viewing a shop, same as that
      // shop's own admin would have. No access to shop pages otherwise.
      return !!viewingAs
    }
    if (!profile) return false
    const perms = ROLE_PERMISSIONS[profile.role] || []
    return perms.includes('*') || perms.includes(pageKey)
  }

  const value = {
    session: user, profile, loading, blockedReason, login, logout, can,
    viewingAs, viewAsShop, exitViewAs, activeTenantId,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
