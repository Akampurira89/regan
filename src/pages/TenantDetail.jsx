import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { collection, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { ArrowLeft } from 'lucide-react'

export default function TenantDetail() {
  const { tenantId } = useParams()
  const [tenant, setTenant] = useState(null)
  const [stats, setStats] = useState(null)
  const [recentSales, setRecentSales] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      const tSnap = await getDoc(doc(db, 'tenants', tenantId))
      setTenant(tSnap.exists() ? tSnap.data() : null)

      const [productsSnap, salesSnap, profilesSnap, customersSnap] = await Promise.all([
        getDocs(collection(db, 'tenants', tenantId, 'products')),
        getDocs(collection(db, 'tenants', tenantId, 'sales')),
        getDocs(collection(db, 'tenants', tenantId, 'profiles')),
        getDocs(collection(db, 'tenants', tenantId, 'customers')),
      ])

      const sales = salesSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      const totalRevenue = sales.reduce((sum, s) => sum + (Number(s.total) || 0), 0)

      setStats({
        productCount: productsSnap.size,
        salesCount: sales.length,
        staffCount: profilesSnap.size,
        customerCount: customersSnap.size,
        totalRevenue,
      })

      setRecentSales(
        sales
          .sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0))
          .slice(0, 10)
      )

      setLoading(false)
    }
    load()
  }, [tenantId])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mb-4">
          <ArrowLeft size={15} /> Back to all shops
        </Link>

        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">{tenant?.shopName || tenantId}</h1>
          <p className="text-sm text-gray-400">Owner: {tenant?.ownerName || '-'} &middot; Plan: {tenant?.plan || 'standard'} &middot; Status: {tenant?.subscriptionStatus || 'unknown'}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <StatCard label="Revenue" value={stats.totalRevenue.toLocaleString()} />
          <StatCard label="Sales" value={stats.salesCount} />
          <StatCard label="Products" value={stats.productCount} />
          <StatCard label="Customers" value={stats.customerCount} />
          <StatCard label="Staff" value={stats.staffCount} />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Recent Sales</h2>
          {recentSales.length === 0 ? (
            <p className="text-sm text-gray-400">No sales recorded yet.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {recentSales.map((s) => (
                <div key={s.id} className="flex justify-between items-center py-2 text-sm">
                  <div>
                    <p className="font-medium">{s.receipt_number || s.id}</p>
                    <p className="text-xs text-gray-400">
                      {s.created_at?.seconds ? new Date(s.created_at.seconds * 1000).toLocaleString() : ''}
                    </p>
                  </div>
                  <span className="font-semibold">{Number(s.total || 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-3 text-center">
      <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  )
}
