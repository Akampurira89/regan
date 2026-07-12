import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { collection, getDocs, doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Button, Card, Input, Select, Modal, EmptyState, Badge } from '../components/ui/ui'
import { formatMoney, formatDate, logAudit } from '../utils/helpers'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'

export default function Purchases() {
  const { profile } = useAuth()
  const { company } = useSettings()
  const [purchases, setPurchases] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [supplierId, setSupplierId] = useState('')
  const [items, setItems] = useState([{ product_id: '', qty: 1, cost_price: 0 }])
  const [amountPaid, setAmountPaid] = useState('0')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const [pSnap, sSnap, prodSnap] = await Promise.all([
      getDocs(collection(db, 'purchases')), getDocs(collection(db, 'suppliers')), getDocs(collection(db, 'products')),
    ])
    const supplierMap = Object.fromEntries(sSnap.docs.map((d) => [d.id, d.data().name]))
    setPurchases(pSnap.docs.map((d) => ({ id: d.id, ...d.data(), supplierName: supplierMap[d.data().supplier_id] })).sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0)))
    setSuppliers(sSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
    setProducts(prodSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const addRow = () => setItems([...items, { product_id: '', qty: 1, cost_price: 0 }])
  const updateRow = (i, key, val) => setItems(items.map((r, idx) => idx === i ? { ...r, [key]: val } : r))
  const removeRow = (i) => setItems(items.filter((_, idx) => idx !== i))

  const total = items.reduce((s, i) => s + (Number(i.qty) * Number(i.cost_price)), 0)

  const save = async (e) => {
    e.preventDefault()
    const valid = items.filter((i) => i.product_id && i.qty > 0)
    if (!supplierId) { alert('Please select a supplier.'); return }
    if (valid.length === 0) { alert('Add at least one item with a product and quantity selected.'); return }
    setSaving(true)
    const paid = Number(amountPaid) || 0
    const purchaseRef = doc(collection(db, 'purchases'))

    try {
      await runTransaction(db, async (tx) => {
        // IMPORTANT: every tx.get() must happen before any tx.set()/tx.update() —
        // Firestore transactions require all reads to complete before any writes.
        const productRefs = valid.map((i) => doc(db, 'products', i.product_id))
        const supplierRef = doc(db, 'suppliers', supplierId)
        const [productSnaps, supplierSnap] = await Promise.all([
          Promise.all(productRefs.map((r) => tx.get(r))),
          tx.get(supplierRef),
        ])

        // Now it's safe to write.
        tx.set(purchaseRef, {
          supplier_id: supplierId, total, amount_paid: paid, balance_due: Math.max(0, total - paid),
          created_by: profile?.id, created_at: serverTimestamp(),
        })
        valid.forEach((i, idx) => {
          const itemRef = doc(collection(db, 'purchases', purchaseRef.id, 'items'))
          tx.set(itemRef, { product_id: i.product_id, qty: Number(i.qty), cost_price: Number(i.cost_price), amount: Number(i.qty) * Number(i.cost_price) })
          const currentStock = productSnaps[idx].exists() ? (productSnaps[idx].data().stock_qty || 0) : 0
          tx.update(productRefs[idx], { stock_qty: currentStock + Number(i.qty) })
          const movementRef = doc(collection(db, 'stockMovements'))
          tx.set(movementRef, { product_id: i.product_id, change_qty: Number(i.qty), reason: 'purchase', reference_id: purchaseRef.id, created_at: serverTimestamp() })
        })
        if (total - paid > 0) {
          const currentOwed = supplierSnap.exists() ? (supplierSnap.data().balance_owed || 0) : 0
          tx.update(supplierRef, { balance_owed: currentOwed + (total - paid) })
        }
      })

      await logAudit({ userId: profile?.id, action: 'create', entityType: 'purchases', entityId: purchaseRef.id, newValues: { total } })
      setModalOpen(false); setItems([{ product_id: '', qty: 1, cost_price: 0 }]); setSupplierId(''); setAmountPaid('0')
      load()
    } catch (err) {
      alert('Could not save purchase: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Purchases</h1>
          <p className="text-sm text-gray-400">Stock automatically increases when a purchase is recorded.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}><Plus size={15} className="inline mr-1" /> Record Purchase</Button>
      </div>

      {products.length === 0 && (
        <div className="text-sm bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
          You don't have any products yet — add products first (Products page) so you can select them here.
        </div>
      )}

      <Card>
        {loading ? <p className="text-sm text-gray-400">Loading...</p> : purchases.length === 0 ? <EmptyState /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="py-2">Supplier</th><th className="py-2">Date</th><th className="py-2">Total</th><th className="py-2">Balance Due</th>
              </tr></thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 dark:border-gray-800/50">
                    <td className="py-2 font-medium">{p.supplierName}</td>
                    <td className="py-2 text-gray-500">{formatDate(p.created_at)}</td>
                    <td className="py-2">{formatMoney(p.total, company.currency)}</td>
                    <td className="py-2">{p.balance_due > 0 ? <Badge color="red">{formatMoney(p.balance_due, company.currency)}</Badge> : <Badge color="green">Paid</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Record Purchase" wide>
        <form onSubmit={save}>
          <Select label="Supplier *" required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Select supplier</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>

          <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Items</p>
          {items.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_80px_100px_30px] gap-2 mb-2 items-center">
              <select className="px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-sm" value={row.product_id} onChange={(e) => updateRow(i, 'product_id', e.target.value)}>
                <option value="">Product</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" min="1" className="px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-sm" value={row.qty} onChange={(e) => updateRow(i, 'qty', e.target.value)} placeholder="Qty" />
              <input type="number" className="px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-sm" value={row.cost_price} onChange={(e) => updateRow(i, 'cost_price', e.target.value)} placeholder="Cost" />
              <button type="button" onClick={() => removeRow(i)} className="text-red-500"><Trash2 size={15} /></button>
            </div>
          ))}
          <button type="button" onClick={addRow} className="text-sm text-blue-600 mb-3">+ Add item</button>

          <Input label={`Amount Paid Now (${company.currency})`} type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
          <p className="text-sm font-semibold mb-3">Total: {formatMoney(total, company.currency)}</p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Purchase'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
