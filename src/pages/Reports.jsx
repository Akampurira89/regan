import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Card, Select, Input, Button, StatCard, EmptyState } from '../components/ui/ui'
import { formatMoney, exportToCSV } from '../utils/helpers'
import { useSettings } from '../context/SettingsContext'
import { DollarSign, TrendingUp, TrendingDown, Package, ArrowUpCircle, ArrowDownCircle, Scale } from 'lucide-react'

function rangeFor(preset) {
  const now = new Date()
  let start = new Date()
  if (preset === 'today') start.setHours(0, 0, 0, 0)
  if (preset === 'week') start.setDate(now.getDate() - 7)
  if (preset === 'month') start.setDate(1)
  if (preset === 'year') { start.setMonth(0); start.setDate(1) }
  return { start, end: now }
}

// Returns the immediately preceding period of equal length, for comparison
function previousRange(start, end) {
  const lengthMs = end - start
  const prevEnd = new Date(start.getTime())
  const prevStart = new Date(start.getTime() - lengthMs)
  return { start: prevStart, end: prevEnd }
}

async function loadPeriodFinancials(start, end) {
  const salesSnap = await getDocs(query(collection(db, 'sales'), where('created_at', '>=', Timestamp.fromDate(start)), where('created_at', '<=', Timestamp.fromDate(end))))
  const salesData = salesSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.status !== 'void')
  const revenue = salesData.reduce((sum, s) => sum + Number(s.total), 0)

  let cogs = 0
  let saleItems = []
  if (salesData.length > 0) {
    const itemsArrays = await Promise.all(salesData.map((s) => getDocs(collection(db, 'sales', s.id, 'items'))))
    saleItems = itemsArrays.flatMap((snap) => snap.docs.map((d) => d.data()))
    cogs = saleItems.reduce((sum, i) => sum + Number(i.cost_price) * Number(i.qty), 0)
  }
  return { revenue, cogs, grossProfit: revenue - cogs, saleItems, sales: salesData }
}

export default function Reports() {
  const { company } = useSettings()
  const [preset, setPreset] = useState('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [current, setCurrent] = useState(null)
  const [previous, setPrevious] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [products, setProducts] = useState([])
  const [cashIn, setCashIn] = useState(0)
  const [cashOutSuppliers, setCashOutSuppliers] = useState(0)
  const [receivables, setReceivables] = useState(0)
  const [payables, setPayables] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const { start, end } = preset === 'custom' && customStart && customEnd
      ? { start: new Date(customStart), end: new Date(customEnd) }
      : rangeFor(preset)
    const prev = previousRange(start, end)

    const [curr, prevData, expSnap, expCatSnap, prodSnap, paymentsSnap, debtsSnap, suppliersSnap] = await Promise.all([
      loadPeriodFinancials(start, end),
      loadPeriodFinancials(prev.start, prev.end),
      getDocs(collection(db, 'expenses')),
      getDocs(collection(db, 'expenseCategories')),
      getDocs(collection(db, 'products')),
      getDocs(collection(db, 'payments')),
      getDocs(query(collection(db, 'debts'), where('status', '!=', 'paid'))),
      getDocs(collection(db, 'suppliers')),
    ])
    setCurrent(curr)
    setPrevious(prevData)

    const expCatMap = Object.fromEntries(expCatSnap.docs.map((d) => [d.id, d.data().name]))
    const startStr = start.toISOString().slice(0, 10)
    const endStr = end.toISOString().slice(0, 10)
    setExpenses(expSnap.docs.map((d) => ({ id: d.id, ...d.data(), categoryName: expCatMap[d.data().category_id] })).filter((e) => e.expense_date >= startStr && e.expense_date <= endStr))
    setProducts(prodSnap.docs.map((d) => ({ id: d.id, ...d.data() })))

    // Cash flow: money actually received (sale + debt payments) vs paid out to suppliers, within period
    const periodPayments = paymentsSnap.docs.map((d) => d.data()).filter((p) => {
      const ts = p.created_at?.toDate ? p.created_at.toDate() : null
      return ts && ts >= start && ts <= end
    })
    setCashIn(periodPayments.filter((p) => p.reference_type === 'sale' || p.reference_type === 'debt').reduce((s, p) => s + Number(p.amount), 0))
    setCashOutSuppliers(periodPayments.filter((p) => p.reference_type === 'supplier').reduce((s, p) => s + Number(p.amount), 0))

    // Balance sheet snapshot (as of now, not period-bound)
    setReceivables(debtsSnap.docs.reduce((s, d) => s + Number(d.data().balance), 0))
    setPayables(suppliersSnap.docs.reduce((s, d) => s + Number(d.data().balance_owed || 0), 0))

    setLoading(false)
  }
  useEffect(() => { load() }, [preset])

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const netProfit = (current?.grossProfit || 0) - totalExpenses
  const stockValuation = products.reduce((sum, p) => sum + Number(p.buying_price) * Number(p.stock_qty), 0)
  const netCashFlow = cashIn - totalExpenses - cashOutSuppliers

  const productTotals = {}
  ;(current?.saleItems || []).forEach((i) => { productTotals[i.product_name] = (productTotals[i.product_name] || 0) + Number(i.qty) })
  const bestSellers = Object.entries(productTotals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, qty]) => ({ name, qty }))

  const soldProductNames = new Set((current?.saleItems || []).map((i) => i.product_name))
  const slowMovers = products.filter((p) => !soldProductNames.has(p.name) && p.is_active).slice(0, 8)

  const pctChange = (curr, prev) => {
    if (!prev) return null
    return ((curr - prev) / Math.abs(prev)) * 100
  }
  const revenueChange = pctChange(current?.revenue || 0, previous?.revenue || 0)
  const profitChange = pctChange(netProfit, (previous?.grossProfit || 0) - totalExpenses)

  const doExportSales = () => exportToCSV('sales_report.csv', (current?.sales || []).map((s) => ({ receipt_number: s.receipt_number, date: s.created_at, total: s.total, payment_method: s.payment_method })))

  const ChangeBadge = ({ value }) => {
    if (value === null || !isFinite(value)) return null
    const up = value >= 0
    return <span className={`text-xs font-medium ${up ? 'text-emerald-600' : 'text-red-600'}`}>{up ? '▲' : '▼'} {Math.abs(value).toFixed(0)}% vs prior period</span>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Reports / Analytics</h1>
          <p className="text-sm text-gray-400">P&L, cash flow, balance sheet, and period comparison</p>
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
        <StatCard label="Revenue" value={formatMoney(current?.revenue || 0, company.currency)} sub={<ChangeBadge value={revenueChange} />} icon={DollarSign} color="blue" />
        <StatCard label="Gross Profit" value={formatMoney(current?.grossProfit || 0, company.currency)} icon={TrendingUp} color="green" />
        <StatCard label="Net Profit" value={formatMoney(netProfit, company.currency)} sub={<ChangeBadge value={profitChange} />} icon={netProfit >= 0 ? TrendingUp : TrendingDown} color={netProfit >= 0 ? 'green' : 'red'} />
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

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Profit & Loss Summary">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-2">Total Revenue</td><td className="py-2 text-right font-medium">{formatMoney(current?.revenue || 0, company.currency)}</td></tr>
              <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-2">Cost of Goods Sold</td><td className="py-2 text-right font-medium text-red-500">-{formatMoney(current?.cogs || 0, company.currency)}</td></tr>
              <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-2 font-semibold">Gross Profit</td><td className="py-2 text-right font-semibold">{formatMoney(current?.grossProfit || 0, company.currency)}</td></tr>
              <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-2">Operating Expenses</td><td className="py-2 text-right font-medium text-red-500">-{formatMoney(totalExpenses, company.currency)}</td></tr>
              <tr><td className="py-2 font-bold">Net Profit</td><td className={`py-2 text-right font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatMoney(netProfit, company.currency)}</td></tr>
            </tbody>
          </table>
        </Card>

        <Card title="Cash Flow (this period)" actions={netCashFlow >= 0 ? <ArrowUpCircle size={16} className="text-emerald-500" /> : <ArrowDownCircle size={16} className="text-red-500" />}>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-2">Cash In (sale + debt payments received)</td><td className="py-2 text-right font-medium text-emerald-600">+{formatMoney(cashIn, company.currency)}</td></tr>
              <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-2">Cash Out — Expenses</td><td className="py-2 text-right font-medium text-red-500">-{formatMoney(totalExpenses, company.currency)}</td></tr>
              <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-2">Cash Out — Supplier Payments</td><td className="py-2 text-right font-medium text-red-500">-{formatMoney(cashOutSuppliers, company.currency)}</td></tr>
              <tr><td className="py-2 font-bold">Net Cash Flow</td><td className={`py-2 text-right font-bold ${netCashFlow >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatMoney(netCashFlow, company.currency)}</td></tr>
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-2">Cash-basis only — tracks money actually received/paid via the Payments log, not accrued sales.</p>
        </Card>
      </div>

      <Card title="Balance Sheet (snapshot as of today)" actions={<Scale size={16} className="text-gray-400" />}>
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">Assets</p>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-1.5">Inventory (at cost)</td><td className="py-1.5 text-right">{formatMoney(stockValuation, company.currency)}</td></tr>
                <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-1.5">Accounts Receivable (customer debts)</td><td className="py-1.5 text-right">{formatMoney(receivables, company.currency)}</td></tr>
                <tr><td className="py-1.5 font-semibold">Total Assets</td><td className="py-1.5 text-right font-semibold">{formatMoney(stockValuation + receivables, company.currency)}</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">Liabilities & Position</p>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-1.5">Accounts Payable (owed to suppliers)</td><td className="py-1.5 text-right text-red-500">{formatMoney(payables, company.currency)}</td></tr>
                <tr><td className="py-1.5 font-bold">Net Position (Assets − Liabilities)</td><td className="py-1.5 text-right font-bold">{formatMoney(stockValuation + receivables - payables, company.currency)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">Simplified for a single-shop operation — doesn't track cash-on-hand/bank balances separately since those aren't recorded elsewhere in the app yet.</p>
      </Card>
    </div>
  )
}
