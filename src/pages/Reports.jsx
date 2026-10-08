import { useEffect, useRef, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area } from 'recharts'
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore'
import { db, tPath } from '../lib/firebase'
import { formatMoney, exportToCSV } from '../utils/helpers'
import { useSettings } from '../context/SettingsContext'
import { DollarSign, TrendingUp, TrendingDown, Package, Scale, Trophy, Download, Crown, Wallet, ArrowDownRight, ArrowUpRight, Sparkles } from 'lucide-react'

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


const PRESETS = [['today', 'Today'], ['week', '7 Days'], ['month', 'Month'], ['year', 'Year'], ['custom', 'Custom']]
const MEDALS = ['🥇', '🥈', '🥉']

// Number that smoothly counts up/down to its new value
function AnimatedMoney({ value, currency }) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const start = performance.now()
    const begin = from.current
    const target = Number(value || 0)
    let raf
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 700)
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(begin + (target - begin) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{formatMoney(Math.round(shown), currency)}</>
}

function Panel({ title, icon: Icon, tone = 'text-orange-500', right, children, className = '' }) {
  return (
    <section className={`rounded-2xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-100 dark:ring-gray-800 p-4 sm:p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          {Icon && <Icon size={16} className={tone} />}{title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function Kpi({ label, children, sub, icon: Icon, gradient }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-gray-900 shadow-lg shadow-black/5 ring-1 ring-gray-100 dark:ring-gray-800 p-4">
      <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full bg-gradient-to-br ${gradient} opacity-10`} />
      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center shadow-md mb-3`}><Icon size={18} /></div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-gray-50 tracking-tight">{children}</p>
      <div className="min-h-[1rem]">{sub}</div>
    </div>
  )
}

function FlowBar({ label, value, max, color, sign, currency }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500 dark:text-gray-400">{label}</span>
        <span className="font-semibold text-gray-800 dark:text-gray-100">{sign}{formatMoney(value, currency)}</span>
      </div>
      <div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`} style={{ width: `${max ? Math.max(2, Math.min(100, (value / max) * 100)) : 0}%` }} />
      </div>
    </div>
  )
}

function Line2({ label, value, tone = '', bold }) {
  return (
    <div className={`flex justify-between py-2 text-sm border-b border-gray-100 dark:border-gray-800 last:border-0 ${bold ? 'font-bold' : ''}`}>
      <span className="text-gray-600 dark:text-gray-300">{label}</span>
      <span className={tone}>{value}</span>
    </div>
  )
}

const Empty = ({ text }) => <p className="text-center py-8 text-sm text-gray-400">{text}</p>

const ChartTip = ({ active, payload, label, currency }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-gray-900 text-white text-xs px-3 py-2 shadow-xl">
      <p className="text-gray-400">{label}</p>
      <p className="font-bold">{formatMoney(payload[0].value, currency)}</p>
    </div>
  )
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

  const cur = company.currency
  const ChangeBadge = ({ value, light }) => {
    if (value === null || !isFinite(value)) return null
    const up = value >= 0
    const Icon = up ? ArrowUpRight : ArrowDownRight
    const cls = light
      ? 'bg-white/20 text-white'
      : up ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
    return <span className={`inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}><Icon size={12} />{Math.abs(value).toFixed(0)}% vs prior</span>
  }

  const totalOut = totalExpenses + cashOutSuppliers + cashOutPersonal
  const flowMax = Math.max(cashIn, totalOut, 1)
  const dayMax = Math.max(...dailyBreakdown.map((d) => d.total), 1)
  const margin = current?.revenue ? (netProfit / current.revenue) * 100 : null

  return (
    <div className="-m-4 lg:-m-6 pb-10">
      {/* HERO */}
      <div className="relative overflow-hidden bg-gradient-to-br from-orange-500 via-orange-600 to-rose-700 text-white px-4 lg:px-6 pt-6 pb-20">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -left-10 bottom-0 w-48 h-48 rounded-full bg-yellow-300/10 blur-2xl" />
        <div className="relative max-w-6xl mx-auto">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-medium text-white/80"><Sparkles size={14} /> Reports &amp; Analytics</p>
              <h1 className="text-2xl font-extrabold tracking-tight">Business Overview</h1>
            </div>
            <button onClick={doExportSales} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur text-sm font-medium transition-colors">
              <Download size={15} /> Export CSV
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="inline-flex p-1 rounded-xl bg-black/20 backdrop-blur">
              {PRESETS.map(([key, text]) => (
                <button key={key} onClick={() => setPreset(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${preset === key ? 'bg-white text-orange-700 shadow' : 'text-white/80 hover:text-white'}`}>
                  {text}
                </button>
              ))}
            </div>
            {preset === 'custom' && (
              <div className="flex items-center gap-2 flex-wrap">
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="px-2.5 py-1.5 rounded-lg bg-white/90 text-gray-800 text-xs" />
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="px-2.5 py-1.5 rounded-lg bg-white/90 text-gray-800 text-xs" />
                <button onClick={load} className="px-3 py-1.5 rounded-lg bg-white text-orange-700 text-xs font-bold">Apply</button>
              </div>
            )}
          </div>

          <div className="mt-6">
            <p className="text-sm text-white/80">Net Profit</p>
            {loading ? <div className="h-10 w-56 rounded-lg bg-white/20 animate-pulse mt-1" /> : (
              <p className="text-3xl sm:text-5xl font-black tracking-tight"><AnimatedMoney value={netProfit} currency={cur} /></p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <ChangeBadge value={profitChange} light />
              {margin !== null && isFinite(margin) && <span className="inline-flex mt-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-white/20">{margin.toFixed(0)}% margin</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:px-6 -mt-12 space-y-4">
        {/* KPI CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Revenue" icon={DollarSign} gradient="from-blue-500 to-indigo-600" sub={<ChangeBadge value={revenueChange} />}>{formatMoney(current?.revenue || 0, cur)}</Kpi>
          <Kpi label="Gross Profit" icon={TrendingUp} gradient="from-emerald-500 to-teal-600">{formatMoney(current?.grossProfit || 0, cur)}</Kpi>
          <Kpi label="Net Cash Flow" icon={Wallet} gradient={netCashFlow >= 0 ? 'from-cyan-500 to-blue-600' : 'from-rose-500 to-red-600'}>{formatMoney(netCashFlow, cur)}</Kpi>
          <Kpi label="Stock Valuation" icon={Package} gradient="from-purple-500 to-fuchsia-600">{formatMoney(stockValuation, cur)}</Kpi>
        </div>

        {/* RECORDS */}
        <div className="grid sm:grid-cols-3 gap-3">
          {[['Best Single Day', trend.bestDay], ['Best Week (starting)', trend.bestWeek], ['Best Month', trend.bestMonth]].map(([label, v], i) => (
            <div key={label} className={`relative overflow-hidden rounded-2xl p-4 text-white shadow-md bg-gradient-to-br ${['from-amber-400 to-orange-500', 'from-pink-500 to-rose-500', 'from-violet-500 to-indigo-600'][i]}`}>
              <Crown size={56} className="absolute -right-3 -bottom-3 opacity-20" />
              <p className="text-xs text-white/80 flex items-center gap-1"><Trophy size={12} /> {label} · 180 days</p>
              <p className="text-xl font-extrabold mt-1">{v ? formatMoney(v[1], cur) : '-'}</p>
              <p className="text-xs text-white/80">{v ? v[0] : 'No data yet'}</p>
            </div>
          ))}
        </div>

        {/* TREND */}
        <Panel title="Sales Trend · last 30 days" icon={TrendingUp}>
          {trend.daily.length === 0 ? <Empty text="No sales in the last 30 days." /> : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trend.daily} margin={{ left: -10, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#9ca3af33" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip currency={cur} />} />
                <Area type="monotone" dataKey="total" stroke="#ea580c" strokeWidth={3} fill="url(#trendFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* MONEY IN / OUT + P&L */}
        <div className="grid lg:grid-cols-2 gap-4">
          <Panel title="Where the money went" icon={Wallet} tone="text-cyan-500"
            right={<span className={`text-xs font-bold px-2 py-1 rounded-full ${netCashFlow >= 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30' : 'bg-red-50 text-red-600 dark:bg-red-900/30'}`}>Net {formatMoney(netCashFlow, cur)}</span>}>
            <FlowBar label="Cash in (sales, debts, consignment)" value={cashIn} max={flowMax} color="from-emerald-400 to-teal-500" sign="+" currency={cur} />
            <FlowBar label="Expenses" value={totalExpenses} max={flowMax} color="from-rose-400 to-red-500" sign="-" currency={cur} />
            <FlowBar label="Suppliers" value={cashOutSuppliers} max={flowMax} color="from-orange-400 to-amber-500" sign="-" currency={cur} />
            <FlowBar label="Personal debts & consignment owners" value={cashOutPersonal} max={flowMax} color="from-fuchsia-400 to-purple-500" sign="-" currency={cur} />
          </Panel>

          <Panel title="Profit & Loss" icon={DollarSign} tone="text-emerald-500">
            <Line2 label="Total revenue" value={formatMoney(current?.revenue || 0, cur)} tone="font-medium" />
            <Line2 label="Cost of goods sold" value={`-${formatMoney(current?.cogs || 0, cur)}`} tone="font-medium text-red-500" />
            <Line2 label="Gross profit" value={formatMoney(current?.grossProfit || 0, cur)} tone="font-semibold" bold />
            <Line2 label="Consignment profit" value={`+${formatMoney(consignProfit, cur)}`} tone="font-medium text-emerald-600" />
            <Line2 label="Operating expenses" value={`-${formatMoney(totalExpenses, cur)}`} tone="font-medium text-red-500" />
            <div className={`mt-3 rounded-xl px-4 py-3 flex justify-between items-center bg-gradient-to-r ${netProfit >= 0 ? 'from-emerald-500 to-teal-600' : 'from-rose-500 to-red-600'} text-white`}>
              <span className="text-sm font-semibold">Net profit</span>
              <span className="text-lg font-extrabold">{formatMoney(netProfit, cur)}</span>
            </div>
          </Panel>
        </div>

        {/* LEADERBOARDS */}
        <div className="grid lg:grid-cols-2 gap-4">
          <Panel title="Staff Leaderboard" icon={Trophy} tone="text-amber-500">
            {staffLeaderboard.length === 0 ? <Empty text="No sales recorded by staff in this period." /> : (
              <div className="space-y-3">
                {staffLeaderboard.map((st, idx) => (
                  <div key={st.name + idx}>
                    <div className="flex justify-between items-center text-sm mb-1">
                      <span className="flex items-center gap-2 font-medium text-gray-800 dark:text-gray-100"><span className="text-lg">{MEDALS[idx] || '🏅'}</span>{st.name}</span>
                      <span className="text-xs text-gray-500">{formatMoney(st.total, cur)} · {st.count} sales</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-700" style={{ width: `${(st.total / (staffLeaderboard[0].total || 1)) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Top Customers" icon={Crown} tone="text-pink-500">
            {topCustomers.length === 0 ? <Empty text="No customer sales yet." /> : (
              <div>
                {topCustomers.map((c, idx) => (
                  <div key={c.name + idx} className="flex justify-between items-center py-2 text-sm border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <span className="flex items-center gap-2.5 text-gray-800 dark:text-gray-100">
                      <span className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center text-white bg-gradient-to-br ${idx === 0 ? 'from-amber-400 to-orange-500' : idx === 1 ? 'from-gray-400 to-gray-500' : idx === 2 ? 'from-orange-300 to-amber-600' : 'from-blue-400 to-indigo-500'}`}>{idx + 1}</span>
                      {c.name}
                    </span>
                    <span className="font-semibold">{formatMoney(c.total, cur)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* PRODUCTS */}
        <div className="grid lg:grid-cols-2 gap-4">
          <Panel title="Best-Selling Products" icon={Package} tone="text-purple-500">
            {loading ? <div className="h-52 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" /> : bestSellers.length === 0 ? <Empty text="No sales in this period." /> : (
              <ResponsiveContainer width="100%" height={Math.max(200, bestSellers.length * 34)}>
                <BarChart data={bestSellers} layout="vertical" margin={{ left: 10, right: 12 }}>
                  <defs>
                    <linearGradient id="barFill" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#f97316" />
                      <stop offset="100%" stopColor="#e11d48" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#9ca3af33" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: '#9ca3af22' }} />
                  <Bar dataKey="qty" fill="url(#barFill)" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>

          <Panel title="Slow-Moving · no sales this period" icon={TrendingDown} tone="text-red-500">
            {slowMovers.length === 0 ? <Empty text="Everything is moving! 🎉" /> : (
              <div>
                {slowMovers.map((p) => (
                  <div key={p.id} className="flex justify-between items-center py-2 text-sm border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <span className="text-gray-800 dark:text-gray-100">{p.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400">{p.stock_qty} in stock</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* DAILY BREAKDOWN */}
        <Panel title="Daily Sales Breakdown" icon={DollarSign} tone="text-blue-500">
          {dailyBreakdown.length === 0 ? <Empty text="No sales in this period." /> : (
            <div className="max-h-96 overflow-auto rounded-xl">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white dark:bg-gray-900">
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100 dark:border-gray-800">
                    <th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Total</th><th className="py-2 pr-3 hidden sm:table-cell w-1/3"></th><th className="py-2 pr-3">Sales</th><th className="py-2">Items</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyBreakdown.map((d) => (
                    <tr key={d.date} className="border-b border-gray-50 dark:border-gray-800/50">
                      <td className="py-2 pr-3 font-medium whitespace-nowrap">{d.date}</td>
                      <td className="py-2 pr-3 font-semibold whitespace-nowrap">{formatMoney(d.total, cur)}</td>
                      <td className="py-2 pr-3 hidden sm:table-cell">
                        <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-rose-500" style={{ width: `${(d.total / dayMax) * 100}%` }} /></div>
                      </td>
                      <td className="py-2 pr-3 text-gray-500">{d.transactions}</td>
                      <td className="py-2 text-gray-500">{d.items}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* BALANCE SHEET */}
        <Panel title="Balance Sheet · snapshot as of today" icon={Scale} tone="text-gray-400">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="rounded-xl p-4 bg-emerald-50 dark:bg-emerald-900/20">
              <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold mb-2">ASSETS</p>
              <Line2 label="Inventory (at cost)" value={formatMoney(stockValuation, cur)} />
              <Line2 label="Customer debts" value={formatMoney(receivables, cur)} />
              <Line2 label="Total assets" value={formatMoney(stockValuation + receivables, cur)} tone="font-bold" bold />
            </div>
            <div className="rounded-xl p-4 bg-red-50 dark:bg-red-900/20">
              <p className="text-xs text-red-700 dark:text-red-400 font-semibold mb-2">LIABILITIES</p>
              <Line2 label="Owed to suppliers" value={formatMoney(payables, cur)} tone="text-red-500 font-medium" />
            </div>
            <div className={`rounded-xl p-4 text-white bg-gradient-to-br flex flex-col justify-center ${stockValuation + receivables - payables >= 0 ? 'from-indigo-500 to-purple-600' : 'from-rose-500 to-red-600'}`}>
              <p className="text-xs text-white/80">Net position (assets − liabilities)</p>
              <p className="text-xl font-extrabold">{formatMoney(stockValuation + receivables - payables, cur)}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">Simplified for a single-shop operation — doesn't track cash-on-hand/bank balances separately (see the Cash &amp; Bank page for that).</p>
        </Panel>
      </div>
    </div>
  )
}
