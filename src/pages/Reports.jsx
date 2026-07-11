import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Card, Select, Input, Button, StatCard, EmptyState } from '../components/ui/ui'
import { formatMoney, exportToCSV } from '../utils/helpers'
import { useSettings } from '../context/SettingsContext'
import { DollarSign, TrendingUp, TrendingDown, Package } from 'lucide-react'

function rangeFor(preset) {
  const now = new Date()
  let start = new Date()
  if (preset === 'today') start.setHours(0, 0, 0, 0)
  if (preset === 'week') start.setDate(now.getDate() - 7)
  if (preset === 'month') start.setDate(1)
  if (preset === 'year') { start.setMonth(0); start.setDate(1) }
  return { start, end: now }
}

export default function Reports() {
  const { company } = useSettings()
  const [preset, setPreset] = useState('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [sales, setSales] = useState([])
  const [saleItems, setSaleItems] = useState([])
  const [expenses, setExpenses] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const { start, end } = preset === 'custom' && customStart && customEnd
      ? { start: new Date(customStart), end: new Date(customEnd) }
      : rangeFor(preset)

    const [salesSnap, expSnap, prodSnap] = await Promise.all([
      getDocs(query(collection(db, 'sales'), where('created_at', '>=', Timestamp.fromDate(start)), where('created_at', '<=', Timestamp.fromDate(end)))),
      getDocs(collection(db, 'expenses')),
      getDocs(collection(db, 'products')),
    ])
    const salesData = salesSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.status !== 'void')
    setSales(salesData)

    const expCatSnap = await getDocs(collection(db, 'expenseCategories'))
    const expCatMap = Object.fromEntries(expCatSnap.docs.map((d) => [d.id, d.data().name]))
    const startStr = start.toISOString().slice(0, 10)
    const endStr = end.toISOString().slice(0, 10)
    setExpenses(expSnap.docs.map((d) => ({ id: d.id, ...d.data(), categoryName: expCatMap[d.data().category_id] })).filter((e) => e.expense_date >= startStr && e.expense_date <= endStr))
    setProducts(prodSnap.docs.map((d) => ({ id: d.id, ...d.data() })))

    if (salesData.length > 0) {
      const itemsArrays = await Promise.all(salesData.map((s) => getDocs(collection(db, 'sales', s.id, 'items'))))
      setSaleItems(itemsArrays.flatMap((snap) => snap.docs.map((d) => d.data())))
    } else {
      setSaleItems([])
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [preset])

  const revenue = sales.reduce((sum, s) => sum + Number(s.total), 0)
  const cogs = saleItems.reduce((sum, i) => sum + Number(i.cost_price) * Number(i.qty), 0)
  const grossProfit = revenue - cogs
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const netProfit = grossProfit - totalExpenses
  const stockValuation = products.reduce((sum, p) => sum + Number(p.buying_price) * Number(p.stock_qty), 0)

  const productTotals = {}
  saleItems.forEach((i) => { productTotals[i.product_name] = (productTotals[i.product_name] || 0) + Number(i.qty) })
  const bestSellers = Object.entries(productTotals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, qty]) => ({ name, qty }))

  const soldProductNames = new Set(saleItems.map((i) => i.product_name))
  const slowMovers = products.filter((p) => !soldProductNames.has(p.name) && p.is_active).slice(0, 8)

  const doExportSales = () => exportToCSV('sales_report.csv', sales.map((s) => ({ receipt_number: s.receipt_number, date: s.created_at, total: s.total, payment_method: s.payment_method })))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Reports / Analytics</h1>
          <p className="text-sm text-gray-400">P&L, best sellers, and stock valuation</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={preset} onChange={(e) => setPreset(e.target.value)} className="!mb-0">
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
            <option value="custom">Custom Range</option>
          </Select>
          {preset === 'custom' && (
            <>
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="!mb-0" />
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="!mb-0" />
              <Button onClick={load}>Apply</Button>
            </>
          )}
          <Button variant="secondary" onClick={doExportSales}>Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Revenue" value={formatMoney(revenue, company.currency)} icon={DollarSign} color="blue" />
        <StatCard label="Gross Profit" value={formatMoney(grossProfit, company.currency)} icon={TrendingUp} color="green" />
        <StatCard label="Net Profit" value={formatMoney(netProfit, company.currency)} sub={`After ${formatMoney(totalExpenses, company.currency)} expenses`} icon={netProfit >= 0 ? TrendingUp : TrendingDown} color={netProfit >= 0 ? 'green' : 'red'} />
        <StatCard label="Stock Valuation" value={formatMoney(stockValuation, company.currency)} icon={Package} color="purple" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Best-Selling Products">
          {loading ? <p className="text-sm text-gray-400">Loading...</p> : bestSellers.length === 0 ? <EmptyState message="No sales in this period." /> : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={bestSellers} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="qty" fill="#2563eb" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Slow-Moving Products (no sales this period)">
          {slowMovers.length === 0 ? <EmptyState message="Everything is moving!" /> : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {slowMovers.map((p) => (
                <div key={p.id} className="flex justify-between py-2 text-sm">
                  <span>{p.name}</span>
                  <span className="text-gray-400">{p.stock_qty} in stock</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Profit & Loss Summary">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-2">Total Revenue</td><td className="py-2 text-right font-medium">{formatMoney(revenue, company.currency)}</td></tr>
            <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-2">Cost of Goods Sold</td><td className="py-2 text-right font-medium text-red-500">-{formatMoney(cogs, company.currency)}</td></tr>
            <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-2 font-semibold">Gross Profit</td><td className="py-2 text-right font-semibold">{formatMoney(grossProfit, company.currency)}</td></tr>
            <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-2">Operating Expenses</td><td className="py-2 text-right font-medium text-red-500">-{formatMoney(totalExpenses, company.currency)}</td></tr>
            <tr><td className="py-2 font-bold">Net Profit</td><td className={`py-2 text-right font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatMoney(netProfit, company.currency)}</td></tr>
          </tbody>
        </table>
      </Card>
    </div>
  )
}
