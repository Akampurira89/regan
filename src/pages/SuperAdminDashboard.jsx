import { useEffect, useState } from 'react'
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'

const STATUS_COLORS = {
  active: 'bg-green-100 text-green-700',
  expired: 'bg-red-100 text-red-700',
  trial: 'bg-yellow-100 text-yellow-700',
}

export default function SuperAdminDashboard() {
  const { logout } = useAuth()
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Manage Clients</h1>
            <p className="text-sm text-gray-400">All shops using this system.</p>
          </div>
          <button onClick={logout} className="text-sm text-red-600 hover:underline">Log out</button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <p className="p-6 text-sm text-gray-400">Loading...</p>
          ) : tenants.length === 0 ? (
            <p className="p-6 text-sm text-gray-400">No shops yet.</p>
          ) : (
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
                    <td className="py-3 px-4 font-medium">{t.shopName || '-'}</td>
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
          )}
        </div>
      </div>
    </div>
  )
}
