import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore'
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { db, secondaryAuth } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'

const STATUS_COLORS = {
  active: 'bg-green-100 text-green-700',
  expired: 'bg-red-100 text-red-700',
  trial: 'bg-yellow-100 text-yellow-700',
}

const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const emptyForm = { shopName: '', ownerName: '', plan: 'standard', adminEmail: '', adminPassword: '' }

export default function SuperAdminDashboard() {
  const { logout } = useAuth()
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    const snap = await getDocs(collection(db, 'tenants'))
    setTenants(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const toggleStatus = async (t) => {
    const newStatus = t.subscriptionStatus === 'active' ? 'expired' : 'active'
    await updateDoc(doc(db, 'tenants', t.id), { subscriptionStatus: newStatus })
    load()
  }

  const openAdd = () => { setForm(emptyForm); setError(''); setModalOpen(true) }

  const addShop = async (e) => {
    e.preventDefault()
    setError('')

    if (!form.shopName || !form.ownerName || !form.adminEmail || !form.adminPassword) {
      setError('Please fill in every field.')
      return
    }
    if (form.adminPassword.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    let tenantId = slugify(form.shopName)
    if (!tenantId) { setError('Please enter a valid shop name.'); return }

    setSaving(true)
    try {
      const existing = tenants.find((t) => t.id === tenantId)
      if (existing) tenantId = `${tenantId}-${Date.now().toString().slice(-4)}`

      const cred = await createUserWithEmailAndPassword(secondaryAuth, form.adminEmail, form.adminPassword)
      const newUid = cred.user.uid
      await signOut(secondaryAuth)

      await setDoc(doc(db, 'tenants', tenantId), {
        shopName: form.shopName,
        ownerName: form.ownerName,
        subscriptionStatus: 'active',
        plan: form.plan,
        createdAt: new Date(),
      })

      await setDoc(doc(db, 'userTenants', newUid), { tenantId, role: 'admin' })

      await setDoc(doc(db, 'tenants', tenantId, 'profiles', newUid), {
        full_name: form.ownerName,
        role: 'admin',
        is_active: true,
      })

      setModalOpen(false)
      load()
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Manage Clients</h1>
            <p className="text-sm text-gray-400">All shops using this system. Tap a shop to view its live data.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={openAdd}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              + Add Shop
            </button>
            <button onClick={logout} className="text-sm text-red-600 hover:underline">Log out</button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <p className="p-6 text-sm text-gray-400">Loading...</p>
          ) : tenants.length === 0 ? (
            <p className="p-6 text-sm text-gray-400">No shops yet. Tap "+ Add Shop" to create the first one.</p>
          ) : (
            <>
              {/* Mobile: stacked cards */}
              <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-700">
                {tenants.map((t) => (
                  <div key={t.id} className="p-4">
                    <Link to={`/admin/shop/${t.id}`} className="block">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-blue-600">{t.shopName || '-'}</p>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[t.subscriptionStatus] || 'bg-gray-100 text-gray-600'}`}>
                          {t.subscriptionStatus || 'unknown'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{t.ownerName || '-'} &middot; {t.plan || 'standard'}</p>
                      <p className="text-xs text-gray-400 mt-1">{t.id}</p>
                    </Link>
                    <button onClick={() => toggleStatus(t)} className="mt-2 text-xs text-blue-600 hover:underline">
                      {t.subscriptionStatus === 'active' ? 'Suspend' : 'Activate'}
                    </button>
                  </div>
                ))}
              </div>

              {/* Desktop/tablet: table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
                      <th className="py-3 px-4">Shop</th>
                      <th className="py-3 px-4">Owner</th>
                      <th className="py-3 px-4">Plan</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Tenant ID</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((t) => (
                      <tr key={t.id} className="border-b border-gray-50 dark:border-gray-700/50">
                        <td className="py-3 px-4 font-medium">
                          <Link to={`/admin/shop/${t.id}`} className="text-blue-600 hover:underline">
                            {t.shopName || '-'}
                          </Link>
                        </td>
                        <td className="py-3 px-4 text-gray-500">{t.ownerName || '-'}</td>
                        <td className="py-3 px-4 text-gray-500">{t.plan || 'standard'}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[t.subscriptionStatus] || 'bg-gray-100 text-gray-600'}`}>
                            {t.subscriptionStatus || 'unknown'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-xs">{t.id}</td>
                        <td className="py-3 px-4 text-right">
                          <button onClick={() => toggleStatus(t)} className="text-blue-600 hover:underline text-xs">
                            {t.subscriptionStatus === 'active' ? 'Suspend' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-sm p-5">
            <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-100">Add New Shop</h2>
            <form onSubmit={addShop} className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">Shop Name</label>
                <input
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-sm"
                  value={form.shopName}
                  onChange={(e) => setForm({ ...form, shopName: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Owner's Name</label>
                <input
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-sm"
                  value={form.ownerName}
                  onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Owner's Login Email</label>
                <input
                  type="email"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-sm"
                  value={form.adminEmail}
                  onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Temporary Password</label>
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-sm"
                  value={form.adminPassword}
                  onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                  placeholder="At least 6 characters"
                />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Creating...' : 'Create Shop'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
