import { useEffect, useState } from 'react'
import { Printer, Search, Undo2, HandCoins } from 'lucide-react'
import { collection, getDocs, query, orderBy, limit, doc, runTransaction, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { Card, Button, Modal, EmptyState, Badge } from '../../components/ui/ui'
import { formatMoney, formatDate, logAudit } from '../../utils/helpers'
import { useSettings } from '../../context/SettingsContext'
import { useAuth } from '../../context/AuthContext'
import ReceiptView from './ReceiptView'

export default function ReceiptHistory() {
  const { company, template } = useSettings()
  const { profile } = useAuth()
  const [sales, setSales] = useState([])
  const [consignSales, setConsignSales] = useState([])
  const [search, setSearch] = useState('')
  const [reprint, setReprint] = useState(null)
  const [loading, setLoading] = useState(true)
  const [voiding, setVoiding] = useState(false)

  const canVoid = profile?.role === 'admin' || profile?.role === 'manager'

  const load = async () => {
    const [salesSnap, customersSnap, consignSnap] = await Promise.all([
      getDocs(query(collection(db, 'sales'), orderBy('created_at', 'desc'), limit(200))),
      getDocs(collection(db, 'customers')),
      getDocs(query(collection(db, 'consignmentItems'), where('status', 'in', ['sold', 'paid']))),
    ])
    const customerMap = Object.fromEntries(customersSnap.docs.map((d) => [d.id, d.data()]))
    setSales(salesSnap.docs.map((d) => ({ id: d.id, ...d.data(), customer: customerMap[d.data().customer_id] })))
    setConsignSales(consignSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.sold_at?.seconds || 0) - (a.sold_at?.seconds || 0)))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Combine real sales with sold consignment items into one chronological list,
  // clearly tagged so consignment rows are visually distinct — they don't touch
  // your own stock or the sales/debts totals, they're just shown alongside.
  const combined = [
    ...sales.map((s) => ({ kind: 'sale', id: s.id, date: s.created_at, label: s.receipt_number, customerName: s.customer?.name || 'Walk-in', amount: s.total, raw: s })),
    ...consignSales.map((c) => ({ kind: 'consignment', id: c.id, date: c.sold_at, label: c.description, customerName: c.customer_name || 'Walk-in', amount: c.sale_amount, raw: c })),
  ].sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0))

  const filtered = combined.filter((row) => !search || row.label?.toLowerCase().includes(search.toLowerCase()) || row.customerName?.toLowerCase().includes(search.toLowerCase()))

  const openReprint = async (sale) => {
    const itemsSnap = await getDocs(collection(db, 'sales', sale.id, 'items'))
    setReprint({ sale, items: itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() })), customer: sale.customer })
  }

  const voidSale = async (sale) => {
    if (!confirm(`Reverse sale ${sale.receipt_number}? This restocks all items and cannot be undone. Use this for mistaken or fraudulent sales, even from past days.`)) return
    setVoiding(true)
    try {
      const itemsSnap = await getDocs(collection(db, 'sales', sale.id, 'items'))
      const items = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      const debtSnap = sale.is_credit_sale ? await getDocs(query(collection(db, 'debts'), where('sale_id', '==', sale.id))) : null

      await runTransaction(db, async (tx) => {
        const productRefs = items.map((i) => doc(db, 'products', i.product_id))
        const productSnaps = await Promise.all(productRefs.map((r) => tx.get(r)))

        tx.update(doc(db, 'sales', sale.id), { status: 'void' })
        items.forEach((i, idx) => {
          if (productSnaps[idx].exists()) {
            tx.update(productRefs[idx], { stock_qty: (productSnaps[idx].data().stock_qty || 0) + i.qty })
          }
          const movementRef = doc(collection(db, 'stockMovements'))
          tx.set(movementRef, { product_id: i.product_id, change_qty: i.qty, reason: 'sale_reversal', reference_id: sale.id })
        })
        if (debtSnap && !debtSnap.empty) {
          tx.update(doc(db, 'debts', debtSnap.docs[0].id), { status: 'paid', balance: 0 })
        }
      })

      await logAudit({ userId: profile?.id, action: 'void_sale', entityType: 'sales', entityId: sale.id, oldValues: { receipt_number: sale.receipt_number, total: sale.total } })
      load()
    } catch (err) {
      alert('Could not reverse sale: ' + err.message)
    } finally {
      setVoiding(false)
    }
  }

  return (
    <Card title="Sales History (incl. Consignment)">
      <div className="relative mb-3 max-w-sm">
        <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
        <input className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 text-sm" placeholder="Search by receipt #, item, or customer" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {loading ? <p className="text-sm text-gray-400">Loading...</p> : filtered.length === 0 ? <EmptyState /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-800">
              <th className="py-2">Type</th><th className="py-2">Item / Receipt #</th><th className="py-2">Customer</th><th className="py-2">Date</th><th className="py-2">Amount</th><th className="py-2">Status</th><th className="py-2 text-right">Action</th>
            </tr></thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={`${row.kind}-${row.id}`} className="border-b border-gray-50 dark:border-gray-800/50">
                  <td className="py-2">
                    {row.kind === 'sale' ? <Badge color="blue">Sale</Badge> : <Badge color="yellow"><HandCoins size={11} className="inline mr-0.5" />Consignment</Badge>}
                  </td>
                  <td className="py-2 font-medium">{row.label}</td>
                  <td className="py-2 text-gray-500">{row.customerName}</td>
                  <td className="py-2 text-gray-500">{formatDate(row.date)}</td>
                  <td className="py-2 font-medium">{formatMoney(row.amount, company.currency)}</td>
                  <td className="py-2">
                    {row.kind === 'sale'
                      ? (row.raw.status === 'void' ? <Badge color="red">Reversed</Badge> : <Badge color="green">Completed</Badge>)
                      : (row.raw.status === 'paid' ? <Badge color="green">Owner Paid</Badge> : <Badge color="amber">Owner Unpaid</Badge>)}
                  </td>
                  <td className="py-2 text-right">
                    {row.kind === 'sale' ? (
                      <div className="flex justify-end gap-1">
                        <Button variant="secondary" onClick={() => openReprint(row.raw)}><Printer size={14} className="inline mr-1" />Reprint</Button>
                        {canVoid && row.raw.status !== 'void' && (
                          <Button variant="danger" onClick={() => voidSale(row.raw)} disabled={voiding}><Undo2 size={14} className="inline mr-1" />Reverse</Button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Manage in Consignment page</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!reprint} onClose={() => setReprint(null)} title="Reprint Receipt" wide>
        {reprint && <ReceiptView sale={reprint.sale} items={reprint.items} customer={reprint.customer} template={template} onClose={() => setReprint(null)} />}
      </Modal>
    </Card>
  )
}
