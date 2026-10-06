import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts'
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore'
import { db, tPath } from '../lib/firebase'
import { Card, Select, Input, Button, StatCard, EmptyState } from '../components/ui/ui'
import { formatMoney, exportToCSV } from '../utils/helpers'
import { useSettings } from '../context/SettingsContext'
import { DollarSign, TrendingUp, TrendingDown, Package, Scale, Calendar, Trophy } from 'lucide-react'

// Local (shop) calendar date as YYYY-MM-DD. toISOString() gives the UTC date, which
// is a day behind for the first hours of each day in Uganda (UTC+3).
const pad2 = (n) => String(n).padStart(2, '0')
const localDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

function rangeFor(preset) {
  const now = new Date()
  const start = new Date()
  start.setHours(0, 0, 0, 0) // every period starts at 00:00 so the first day is fully included
  if (preset === 'week') start.setDate(now.getDate() - 6) // today + previous 6 days
  if (preset === 'month') start.setDate(1)
  if (preset === 'year') { start.setMonth(0); start.setDate(1) }
  return { start, end: now }
}

function previousRange(start, end) {
  const lengthMs = end - start
  const prevEnd = new Date(start.getTime())
  const prevStart = new Date(start.getTime() - lengthMs)
  return { start: prevStart, end: prevEnd }
}

const dayKey = (d) => localDateStr(d?.toDate ? d.toDate() : new Date(d))
const weekKey = (d) => {
  const date = d?.toDate ? d.toDate() : new Date(d)
  const monday = new Date(date)
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return localDateStr(monday)
}
const monthKey = (d) => localDateStr(d?.toDate ? d.toDate() : new Date(d)).slice(0, 7)

async function loadPeriodFinancials(start, end) {
  const salesSnap = await getDocs(query(collection(db, ...tPath('sales')), where('created_at', '>=', Timestamp.fromDate(start)), where('created_at', '<=', Timestamp.fromDate(end))))
  const salesData = salesSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.status !== 'void')
  const revenue = salesData.reduce((sum, s) => sum + Number(s.total), 0)

  let cogs = 0
  let saleItems = []
  let salesWithItems = salesData
  if (salesData.length > 0) {
    const itemsArrays = await Promise.all(salesData.map((s) => getDocs(collection(db, ...tPath('sales', s.id, 'items')))))
    salesWithItems = salesData.map((s, idx) => ({ ...s, items: itemsArrays[idx].docs.map((d) => d.data()) }))
    saleItems = salesWithItems.flatMap((s) => s.items)
    cogs = saleItems.reduce((sum, i) => sum + Number(i.cost_price) * Number(i.qty), 0)
  }
  return { revenue, cogs, grossProfit: revenue - cogs, saleItems, sales: salesData, salesWithItems }
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
  const [consignProfit, setConsignProfit] = useState(0)
  const [cashOutPersonal, setCashOutPersonal] = useState(0)
  const [receivables, setReceivables] = useState(0)
  const [payables, setPayables] = useState(0)
  const [loading, setLoading] = useState(true)
  const [trend, setTrend] = useState({ bestDay: null, bestWeek: null, bestMonth: null, daily: [] })
  const [customerMap, setCustomerMap] = useState({})
  const [staffMap, setStaffMap] = useState({})

  const load = async () => {
    setLoading(true)
    const { start, end } = preset === 'custom' && customStart && customEnd
      ? { start: new Date(customStart + 'T00:00:00'), end: new Date(customEnd + 'T23:59:59.999') }
      : rangeFor(preset)
    const prev = previousRange(start, end)

    const [curr, prevData, expSnap, expCatSnap, prodSnap, paymentsSnap, debtsSnap, suppliersSnap, customersSnap, profilesSnap] = await Promise.all([
      loadPeriodFinancials(start, end),
      loadPeriodFinancials(prev.start, prev.end),
      getDocs(collection(db, ...tPath('expenses'))),
      getDocs(collection(db, ...tPath('expenseCategories'))),
      getDocs(collection(db, ...tPath('products'))),
      getDocs(collection(db, ...tPath('payments'))),
      getDocs(query(collection(db, ...tPath('debts')), where('status', '!=', 'paid'))),
      getDocs(collection(db, ...tPath('suppliers'))),
      getDocs(collection(db, ...tPath('customers'))),
      getDocs(collection(db, ...tPath('profiles'))),
    ])
    setCurrent(curr)
    setPrevious(prevData)
    setCustomerMap(Object.fromEntries(customersSnap.docs.map((d) => [d.id, d.data().name])))
    setStaffMap(Object.fromEntries(profilesSnap.docs.map((d) => [d.id, d.data().full_name])))

    const expCatMap = Object.fromEntries(expCatSnap.docs.map((d) => [d.id, d.data().name]))
    const startStr = localDateStr(start)
    const endStr = localDateStr(end)
    setExpenses(expSnap.docs.map((d) => ({ id: d.id, ...d.data(), categoryName: expCatMap[d.data().category_id] })).filter((e) => e.expense_date >= startStr && e.expense_date <= endStr))
    setProducts(prodSnap.docs.map((d) => ({ id: d.id, ...d.data() })))

    const periodPayments = paymentsSnap.docs.map((d) => d.data()).filter((p) => {
      const ts = p.created_at?.toDate ? p.created_at.toDate() : null
      return ts && ts >= start && ts <= end
    })
    // Reversed sales: their payments should not count as money in
    // Consignment sales: cash in is the full sale amount, profit is what is left after the owner's share
    // Purchases: what was paid when the order was recorded is also money out to suppliers
    const [consignSnap, purchasesSnap, voidSnap] = await Promise.all([
      getDocs(collection(db, ...tPath('consignmentItems'))),
      getDocs(query(collection(db, ...tPath('purchases')), where('created_at', '>=', Timestamp.fromDate(start)), where('created_at', '<=', Timestamp.fromDate(end)))),
      getDocs(query(collection(db, ...tPath('sales')), where('status', '==', 'void'))),
    ])
    const voidIds = new Set(voidSnap.docs.map((d) => d.id))
    const consignSold = consignSnap.docs.map((d) => d.data()).filter((c) => {
      const t = c.sold_at?.toDate ? c.sold_at.toDate() : null
      return (c.status === 'sold' || c.status === 'paid') && t && t >= start && t <= end
    })
    const consignCash = consignSold.reduce((sum, c) => sum + Number(c.sale_amount || 0), 0)
    setConsignProfit(consignSold.reduce((sum, c) => sum + Number(c.sale_amount || 0) - Number(c.owner_amount || 0), 0))
    const purchasePaid = purchasesSnap.docs.reduce((sum, d) => sum + Number(d.data().amount_paid || 0), 0)
    setCashIn(
      periodPayments.filter((p) => (p.reference_type === 'sale' && !voidIds.has(p.reference_id)) || p.reference_type === 'debt').reduce((s, p) => s + Number(p.amount), 0) + consignCash
    )
    setCashOutSuppliers(periodPayments.filter((p) => p.reference_type === 'supplier').reduce((s, p) => s + Number(p.amount), 0) + purchasePaid)
    setCashOutPersonal(periodPayments.filter((p) => p.reference_type === 'personal_payable' || p.reference_type === 'consignment_owner').reduce((s, p) => s + Number(p.amount), 0))

    setReceivables(debtsSnap.docs.reduce((s, d) => s + Number(d.data().balance), 0))
    setPayables(suppliersSnap.docs.reduce((s, d) => s + Number(d.data().balance_owed || 0), 0))

    // Separate 180-day lookback (independent of the preset above) to find record days/weeks/months
    const lookbackStart = new Date(); lookbackStart.setDate(lookbackStart.getDate() - 180)
    const lookbackSnap = await getDocs(query(collection(db, ...tPath('sales')), where('created_at', '>=', Timestamp.fromDate(lookbackStart))))
    const lookbackSales = lookbackSnap.docs.map((d) => d.data()).filter((s) => s.status !== 'void')

    const byDay = {}, byWeek = {}, byMonth = {}
    lookbackSales.forEach((s) => {
      const dk = dayKey(s.created_at), wk = weekKey(s.created_at), mk = monthKey(s.created_at)
      byDay[dk] = (byDay[dk] || 0) + Number(s.total)
      byWeek[wk] = (byWeek[wk] || 0) + Number(s.total)
      byMonth[mk] = (byMonth[mk] || 0) + Number(s.total)
    })
    const maxEntry = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1])[0] || null
    const daily = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0])).slice(-30).map(([date, total]) => ({ date: date.slice(5), total }))

    setTrend({ bestDay: maxEntry(byDay), bestWeek: maxEntry(byWeek), bestMonth: maxEntry(byMonth), daily })

    setLoading(false)
  }
  useEffect(() => { load() }, [preset])

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const netProfit = (current?.grossProfit || 0) + consignProfit - totalExpenses
  const stockValuation = products.reduce((sum, p) => sum + Number(p.buying_price) * Number(p.stock_qty), 0)
  const netCashFlow = cashIn - totalExpenses - cashOutSuppliers - cashOutPersonal

  const productTotals = {}
  ;(current?.saleItems || []).forEach((i) => { productTotals[i.product_name] = (productTotals[i.product_name] || 0) + Number(i.qty) })
  const bestSellers = Object.entries(productTotals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, qty]) => ({ name, qty }))

  const soldProductNames = new Set((current?.saleItems || []).map((i) => i.product_name))
  const slowMovers = products.filter((p) => !soldProductNames.has(p.name) && p.is_active).slice(0, 8)

  const customerTotals = {}
  ;(current?.sales || []).forEach((s) => {
    if (!s.customer_id) return
    customerTotals[s.customer_id] = (customerTotals[s.customer_id] || 0) + Number(s.total)
  })
  const topCustomers = Object.entries(customerTotals)
    .sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([id, total]) => ({ name: customerMap[id] || 'Unknown', total }))

  const staffTotals = {}
  ;(current?.sales || []).forEach((s) => {
    if (!s.cashier_id) return
    if (!staffTotals[s.cashier_id]) staffTotals[s.cashier_id] = { total: 0, count: 0 }
    staffTotals[s.cashier_id].total += Number(s.total)
    staffTotals[s.cashier_id].count += 1
  })
  const staffLeaderboard = Object.entries(staffTotals)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([id, data]) => ({ name: staffMap[id] || 'Unknown Staff', ...data }))

  // Daily breakdown table for the currently selected period: date, total, transactions, items sold
  const dailyBreakdown = (() => {
    const map = {}
    ;(current?.salesWithItems || []).forEach((s) => {
      const dk = dayKey(s.created_at)
      if (!map[dk]) map[dk] = { date: dk, total: 0, transactions: 0, items: 0 }
      map[dk].total += Number(s.total)
      map[dk].transactions += 1
      map[dk].items += (s.items || []).reduce((sum, i) => sum + Number(i.qty), 0)
    })
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date))
  })()

  const pctChange = (curr, prev) => (prev ? ((curr - prev) / Math.abs(prev)) * 100 : null)
  const revenueChange = pctChange(current?.revenue || 0, previous?.revenue || 0)
  const profitChange = pctChange(netProfit, (previous?.grossProfit || 0) - totalExpenses)

  const doExportSales = () => exportToCSV('sales_report.csv', dailyBreakdown.map((d) => ({ date: d.date, total: d.total, transactions: d.transactions, items_sold: d.items })))

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
          <p className="text-sm text-gray-400">Daily sales, trends, P&L, cash flow, and balance sheet</p>
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

      <Card title="Record Performance (last 180 days)" actions={<Trophy size={16} className="text-amber-500" />}>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Best Single Day</p>
            <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{trend.bestDay ? formatMoney(trend.bestDay[1], company.currency) : '-'}</p>
            <p className="text-xs text-gray-400">{trend.bestDay ? trend.bestDay[0] : 'No data yet'}</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Best Week (starting)</p>
            <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{trend.bestWeek ? formatMoney(trend.bestWeek[1], company.currency) : '-'}</p>
            <p className="text-xs text-gray-400">{trend.bestWeek ? trend.bestWeek[0] : 'No data yet'}</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Best Month</p>
            <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{trend.bestMonth ? formatMoney(trend.bestMonth[1], company.currency) : '-'}</p>
            <p className="text-xs text-gray-400">{trend.bestMonth ? trend.bestMonth[0] : 'No data yet'}</p>
          </div>
        </div>
      </Card>

      <Card title="Staff Sales Leaderboard (this period)" actions={<Trophy size={16} className="text-amber-500" />}>
        {staffLeaderboard.length === 0 ? <EmptyState message="No sales recorded by staff in this period." /> : (
          <div className="space-y-2">
            {staffLeaderboard.map((s, idx) => {
              const maxTotal = staffLeaderboard[0].total || 1
              return (
                <div key={s.name + idx}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="flex items-center gap-2 font-medium">
                      {idx === 0 && <span>🏆</span>}
                      {s.name}
                    </span>
                    <span className="text-gray-500">{formatMoney(s.total, company.currency)} · {s.count} sales</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                    <div className="bg-brand h-2 rounded-full" style={{ width: `${(s.total / maxTotal) * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card title="Sales Trend (last 30 days)" actions={<Calendar size={16} className="text-gray-400" />}>
        {trend.daily.length === 0 ? <EmptyState message="No sales in the last 30 days." /> : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend.daily}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => formatMoney(v, company.currency)} />
              <Line type="monotone" dataKey="total" stroke="#c2410c" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="Daily Sales Breakdown (selected period)">
        {dailyBreakdown.length === 0 ? <EmptyState message="No sales in this period." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="py-2">Date</th><th className="py-2">Total Sales</th><th className="py-2">Transactions</th><th className="py-2">Items Sold</th>
              </tr></thead>
              <tbody>
                {dailyBreakdown.map((d) => (
                  <tr key={d.date} className="border-b border-gray-50 dark:border-gray-800/50">
                    <td className="py-2 font-medium">{d.date}</td>
                    <td className="py-2 font-semibold">{formatMoney(d.total, company.currency)}</td>
                    <td className="py-2 text-gray-500">{d.transactions}</td>
                    <td className="py-2 text-gray-500">{d.items}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Best-Selling Products">
          {loading ? <p className="text-sm text-gray-400">Loading...</p> : bestSellers.length === 0 ? <EmptyState message="No sales in this period." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={bestSellers} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="qty" fill="#c2410c" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Top Customers (this period)" actions={<Trophy size={16} className="text-amber-500" />}>
          {topCustomers.length === 0 ? <EmptyState message="No customer sales yet." /> : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {topCustomers.map((c, idx) => (
                <div key={c.name + idx} className="flex justify-between items-center py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-brand/10 text-brand text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                    {c.name}
                  </span>
                  <span className="font-semibold">{formatMoney(c.total, company.currency)}</span>
                </div>
              ))}
            </div>
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
              <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-2">Consignment Profit</td><td className="py-2 text-right font-medium text-emerald-600">+{formatMoney(consignProfit, company.currency)}</td></tr>
              <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-2">Operating Expenses</td><td className="py-2 text-right font-medium text-red-500">-{formatMoney(totalExpenses, company.currency)}</td></tr>
              <tr><td className="py-2 font-bold">Net Profit</td><td className={`py-2 text-right font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatMoney(netProfit, company.currency)}</td></tr>
            </tbody>
          </table>
        </Card>

        <Card title="Cash Flow (this period)">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-2">Cash In (sales, debt payments &amp; consignment sales)</td><td className="py-2 text-right font-medium text-emerald-600">+{formatMoney(cashIn, company.currency)}</td></tr>
              <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-2">Cash Out — Expenses</td><td className="py-2 text-right font-medium text-red-500">-{formatMoney(totalExpenses, company.currency)}</td></tr>
              <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-2">Cash Out — Supplier Payments (incl. paid when ordering)</td><td className="py-2 text-right font-medium text-red-500">-{formatMoney(cashOutSuppliers, company.currency)}</td></tr>
              <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-2">Cash Out — Personal Debts &amp; Consignment Owners</td><td className="py-2 text-right font-medium text-red-500">-{formatMoney(cashOutPersonal, company.currency)}</td></tr>
              <tr><td className="py-2 font-bold">Net Cash Flow</td><td className={`py-2 text-right font-bold ${netCashFlow >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatMoney(netCashFlow, company.currency)}</td></tr>
            </tbody>
          </table>
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
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">Liabilities &amp; Position</p>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-gray-100 dark:border-gray-800"><td className="py-1.5">Accounts Payable (owed to suppliers)</td><td className="py-1.5 text-right text-red-500">{formatMoney(payables, company.currency)}</td></tr>
                <tr><td className="py-1.5 font-bold">Net Position (Assets − Liabilities)</td><td className="py-1.5 text-right font-bold">{formatMoney(stockValuation + receivables - payables, company.currency)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">Simplified for a single-shop operation — doesn't track cash-on-hand/bank balances separately (see the Cash &amp; Bank page for that).</p>
      </Card>
    </div>
  )
}
