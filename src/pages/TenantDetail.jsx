import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { collection, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { ArrowLeft, DollarSign, ShoppingCart, Package, Users2, UserCog, LayoutDashboard } from 'lucide-react'

const STATUS_STYLES = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  expired: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  trial: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
}

export default function TenantDetail() {
  const { tenantId } = useParams()
  const { viewAsShop } = useAuth()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState(null)
  const [stats, setStats] = useState(null)
  const [recentSales, setRecentSales] = useState([])
  const [staff, setStaff] = useState([])
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

      setStaff(profilesSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
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
        sales.sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0)).slice(0, 10)
      )
      setLoading(false)
    }
    load()
  }, [tenantId])

  // Gives an existing shop's main account the Owner role (needed for the "start fresh" reset)
  const makeOwner = async (u) => {
    if (!confirm(`Make ${u.full_name || 'this person'} the Owner of this shop?`)) return
    await updateDoc(doc(db, 'tenants', tenantId, 'profiles', u.id), { role: 'owner' })
    setStaff((list) => list.map((x) => (x.id === u.id ? { ...x, role: 'owner' } : x)))
  }

  const openFullDashboard = () => {
    viewAsShop(tenantId, tenant?.shopName || tenantId)
    navigate('/')
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-600 px-4 sm:px-6 pt-6 pb-16">
        <div className="max-w-3xl mx-auto">
          <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-white/80 hover:text-white mb-3">
            <ArrowLeft size={15} /> Back to all shops
          </Link>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">{tenant?.shopName || tenantId}</h1>
              <p className="text-sm text-white/70 mt-0.5">
                {tenant?.ownerName || '-'} &middot; {tenant?.plan || 'standard'} plan
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[tenant?.subscriptionStatus] || 'bg-white/20 text-white'}`}>
                {tenant?.subscriptionStatus || 'unknown'}
              </span>
              <button
                onClick={openFullDashboard}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-blue-700 text-xs font-semibold hover:bg-white/90 shadow-sm"
              >
                <LayoutDashboard size={14} /> Open Full Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 -mt-10 pb-10">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <StatCard icon={DollarSign} label="Revenue" value={stats.totalRevenue.toLocaleString()} color="text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30" />
          <StatCard icon={ShoppingCart} label="Sales" value={stats.salesCount} color="text-blue-600 bg-blue-50 dark:bg-blue-900/30" />
          <StatCard icon={Package} label="Products" value={stats.productCount} color="text-purple-600 bg-purple-50 dark:bg-purple-900/30" />
          <StatCard icon={Users2} label="Customers" value={stats.customerCount} color="text-amber-600 bg-amber-50 dark:bg-amber-900/30" />
          <StatCard icon={UserCog} label="Staff" value={stats.staffCount} color="text-pink-600 bg-pink-50 dark:bg-pink-900/30" />
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Staff accounts</h2>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {staff.map((u) => (
              <div key={u.id} className="flex justify-between items-center py-2 text-sm">
                <span className="text-gray-800 dark:text-gray-100">{u.full_name || u.id} <span className="text-xs text-gray-400 capitalize">· {u.role}</span></span>
                {u.role === 'admin' && !staff.some((x) => x.role === 'owner') && (
                  <button onClick={() => makeOwner(u)} className="text-xs font-medium text-amber-600 hover:underline">Make owner</button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Recent Sales</h2>
          {recentSales.length === 0 ? (
            <p className="text-sm text-gray-400">No sales recorded yet.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {recentSales.map((s) => (
                <div key={s.id} className="flex justify-between items-center py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-gray-800 dark:text-gray-100">{s.receipt_number || s.id}</p>
                    <p className="text-xs text-gray-400">
                      {s.created_at?.seconds ? new Date(s.created_at.seconds * 1000).toLocaleString() : ''}
                    </p>
                  </div>
                  <span className="font-semibold text-gray-800 dark:text-gray-100">{Number(s.total || 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-3 text-center">
      <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center mx-auto mb-1.5`}>
        <Icon size={15} />
      </div>
      <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  )
}
