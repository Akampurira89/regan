import { useEffect, useState } from 'react'
import { DollarSign, Package, AlertTriangle, Wrench, Wallet, TrendingUp } from 'lucide-react'
import { collection, getDocs, query, where, orderBy, limit, Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { StatCard, Card, Badge, EmptyState } from '../components/ui/ui'
import { formatMoney, formatDate } from '../utils/helpers'
import { useSettings } from '../context/SettingsContext'
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { company, template } = useSettings()
  const { profile } = useAuth()
  const [stats, setStats] = useState({ todaySales: 0, todayCount: 0, lowStock: 0, openRepairs: 0, openDebts: 0 })
  const [recentSales, setRecentSales] = useState([])
  const [lowStockItems, setLowStockItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)

      const [salesSnap, productsSnap, repairsSnap, debtsSnap, recentSnap, customersSnap] = await Promise.all([
        getDocs(query(collection(db, 'sales'), where('created_at', '>=', Timestamp.fromDate(startOfDay)))),
        getDocs(collection(db, 'products')),
        getDocs(query(collection(db, 'repairs'), where('status', 'not-in', ['delivered', 'cancelled']))),
        getDocs(query(collection(db, 'debts'), where('status', '!=', 'paid'))),
        getDocs(query(collection(db, 'sales'), orderBy('created_at', 'desc'), limit(6))),
        getDocs(collection(db, 'customers')),
      ])

      const todaySalesDocs = salesSnap.docs.map((d) => d.data())
      const todaySales = todaySalesDocs.reduce((s, r) => s + Number(r.total), 0)
      const allProducts = productsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      const lowStock = allProducts.filter((p) => p.stock_qty <= (p.low_stock_threshold ?? 3))
      const openDebts = debtsSnap.docs.reduce((s, d) => s + Number(d.data().balance), 0)
      const customersMap = Object.fromEntries(customersSnap.docs.map((d) => [d.id, d.data()]))

      setStats({
        todaySales, todayCount: todaySalesDocs.length,
        lowStock: lowStock.length, openRepairs: repairsSnap.size, openDebts,
      })
      setLowStockItems(lowStock.slice(0, 6))
      setRecentSales(recentSnap.docs.map((d) => {
        const data = d.data()
        return { id: d.id, ...data, customerName: data.customer_id ? customersMap[data.customer_id]?.name : null }
      }))
      setLoading(false)
    })()
  }, [])

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-gradient-to-r from-brand to-brand-dark text-white p-5">
        <p className="text-sm opacity-80">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <h1 className="text-2xl font-bold mt-1">Welcome back{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}!</h1>
        <p className="text-sm opacity-90 mt-1">{template.shop_name} · here's how today looks.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Today's Sales" value={formatMoney(stats.todaySales, company.currency)} sub={`${stats.todayCount} transactions`} icon={DollarSign} color="green" />
        <StatCard label="Low Stock Items" value={stats.lowStock} icon={AlertTriangle} color="amber" />
        <StatCard label="Open Repairs" value={stats.openRepairs} icon={Wrench} color="purple" />
        <StatCard label="Outstanding Debts" value={formatMoney(stats.openDebts, company.currency)} icon={Wallet} color="red" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Recent Sales" actions={<TrendingUp size={16} className="text-gray-400" />}>
          {loading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : recentSales.length === 0 ? (
            <EmptyState message="No sales recorded yet." />
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {recentSales.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium text-gray-700 dark:text-gray-200">{s.receipt_number}</p>
                    <p className="text-xs text-gray-400">{s.customerName || 'Walk-in'} · {formatDate(s.created_at)}</p>
                  </div>
                  <span className="font-semibold text-gray-800 dark:text-gray-100">{formatMoney(s.total, company.currency)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Low Stock Alerts" actions={<Package size={16} className="text-gray-400" />}>
          {loading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : lowStockItems.length === 0 ? (
            <EmptyState message="Stock levels look healthy." />
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {lowStockItems.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <p className="font-medium text-gray-700 dark:text-gray-200">{p.name}</p>
                  <Badge color={p.stock_qty === 0 ? 'red' : 'yellow'}>
                    {p.stock_qty === 0 ? 'Out of stock' : `${p.stock_qty} left`}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
