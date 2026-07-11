import { useEffect, useState } from 'react'
import { Printer, Search, Undo2 } from 'lucide-react'
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
  const [search, setSearch] = useState('')
  const [reprint, setReprint] = useState(null)
  const [loading, setLoading] = useState(true)
  const [voiding, setVoiding] = useState(false)

  const canVoid = profile?.role === 'admin' || profile?.role === 'manager'

  const load = async () => {
    const [salesSnap, customersSnap] = await Promise.all([
      getDocs(query(collection(db, 'sales'), orderBy('created_at', 'desc'), limit(200))),
      getDocs(collection(db, 'customers')),
    ])
    const customerMap = Object.fromEntries(customersSnap.docs.map((d) => [d.id, d.data()]))
    setSales(salesSnap.docs.map((d) => ({ id: d.id, ...d.data(), customer: customerMap[d.data().customer_id] })))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = sales.filter((s) => !search || s.receipt_number.toLowerCase().includes(search.toLowerCase()) || s.customer?.name?.toLowerCase().includes(search.toLowerCase()))

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
    <Card title="Receipt History (Reprints & Reversals)">
      <div className="relative mb-3 max-w-sm">
        <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
        <input className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 text-sm" placeholder="Search by receipt # or customer" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {loading ? <p className="text-sm text-gray-400">Loading...</p> : filtered.length === 0 ? <EmptyState /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-800">
              <th className="py-2">Receipt #</th><th className="py-2">Customer</th><th className="py-2">Date</th><th className="py-2">Total</th><th className="py-2">Status</th><th className="py-2 text-right">Action</th>
            </tr></thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-gray-50 dark:border-gray-800/50">
                  <td className="py-2 font-medium">{s.receipt_number}</td>
                  <td className="py-2 text-gray-500">{s.customer?.name || 'Walk-in'}</td>
                  <td className="py-2 text-gray-500">{formatDate(s.created_at)}</td>
                  <td className="py-2 font-medium">{formatMoney(s.total, company.currency)}</td>
                  <td className="py-2">{s.status === 'void' ? <Badge color="red">Reversed</Badge> : <Badge color="green">Completed</Badge>}</td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="secondary" onClick={() => openReprint(s)}><Printer size={14} className="inline mr-1" />Reprint</Button>
                      {canVoid && s.status !== 'void' && (
                        <Button variant="danger" onClick={() => voidSale(s)} disabled={voiding}><Undo2 size={14} className="inline mr-1" />Reverse</Button>
                      )}
                    </div>
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
