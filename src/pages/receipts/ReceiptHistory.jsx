import { useEffect, useState } from 'react'
import { Printer, Search, Undo2, HandCoins, Pencil, Trash2, Plus } from 'lucide-react'
import { collection, getDocs, query, orderBy, limit, doc, runTransaction, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { Card, Button, Input, Modal, EmptyState, Badge } from '../../components/ui/ui'
import { formatMoney, formatDate, logAudit } from '../../utils/helpers'
import { useSettings } from '../../context/SettingsContext'
import { useAuth } from '../../context/AuthContext'
import ReceiptView from './ReceiptView'

export default function ReceiptHistory() {
  const { company, template } = useSettings()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [sales, setSales] = useState([])
  const [consignSales, setConsignSales] = useState([])
  const [search, setSearch] = useState('')
  const [reprint, setReprint] = useState(null)
  const [loading, setLoading] = useState(true)
  const [voiding, setVoiding] = useState(false)
  const [editSale, setEditSale] = useState(null)
  const [editItems, setEditItems] = useState([])
  const [originalEditItems, setOriginalEditItems] = useState([])
  const [editDiscount, setEditDiscount] = useState('0')
  const [editPaid, setEditPaid] = useState('0')
  const [products, setProducts] = useState([])
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const [salesSnap, customersSnap, consignSnap, productsSnap] = await Promise.all([
      getDocs(query(collection(db, 'sales'), orderBy('created_at', 'desc'), limit(200))),
      getDocs(collection(db, 'customers')),
      getDocs(query(collection(db, 'consignmentItems'), where('status', 'in', ['sold', 'paid']))),
      getDocs(collection(db, 'products')),
    ])
    const customerMap = Object.fromEntries(customersSnap.docs.map((d) => [d.id, d.data()]))
    setSales(salesSnap.docs.map((d) => ({ id: d.id, ...d.data(), customer: customerMap[d.data().customer_id] })))
    setConsignSales(consignSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.sold_at?.seconds || 0) - (a.sold_at?.seconds || 0)))
    setProducts(productsSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

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

  const openEditSale = async (sale) => {
    const itemsSnap = await getDocs(collection(db, 'sales', sale.id, 'items'))
    const items = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    setEditSale(sale)
    setOriginalEditItems(items.map((i) => ({ ...i })))
    setEditItems(items.map((i) => ({ ...i })))
    setEditDiscount(String(sale.discount || 0))
    setEditPaid(String(sale.amount_paid || 0))
  }

  const editTotal = () => Math.max(0, editItems.reduce((s, i) => s + Number(i.rate) * Number(i.qty), 0) - Number(editDiscount || 0))

  const updateEditRow = (idx, key, val) => setEditItems((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: val } : r)))
  const removeEditRow = (idx) => setEditItems((prev) => prev.filter((_, i) => i !== idx))
  const addEditRow = () => setEditItems((prev) => [...prev, { product_id: '', product_name: '', qty: 1, rate: 0, serial_number: '' }])

  const saveSaleEdit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const newTotal = editTotal()
      const paid = Number(editPaid) || 0
      const newBalanceDue = Math.max(0, newTotal - paid)

      // Same reconcile pattern as Purchases: reverse old items' stock effect,
      // apply new items' effect, adjust the linked debt if this was a credit sale.
      const productIds = [...new Set([
        ...originalEditItems.map((i) => i.product_id).filter(Boolean),
        ...editItems.map((i) => i.product_id).filter(Boolean),
      ])]

      await runTransaction(db, async (tx) => {
        const productRefs = productIds.map((id) => doc(db, 'products', id))
        const productSnaps = await Promise.all(productRefs.map((r) => tx.get(r)))
        const stockMap = {}
        productIds.forEach((id, idx) => { stockMap[id] = productSnaps[idx].exists() ? (productSnaps[idx].data().stock_qty || 0) : 0 })

        originalEditItems.forEach((i) => { if (i.product_id) stockMap[i.product_id] += i.qty }) // give back old qty
        editItems.forEach((i) => { if (i.product_id) stockMap[i.product_id] -= Number(i.qty) }) // take out new qty

        productIds.forEach((id, idx) => tx.update(productRefs[idx], { stock_qty: stockMap[id] }))

        originalEditItems.forEach((i) => tx.delete(doc(db, 'sales', editSale.id, 'items', i.id)))
        editItems.forEach((i) => {
          const ref = doc(collection(db, 'sales', editSale.id, 'items'))
          tx.set(ref, {
            product_id: i.product_id || null, product_name: i.product_name, serial_number: i.serial_number || null,
            qty: Number(i.qty), rate: Number(i.rate), amount: Number(i.qty) * Number(i.rate), cost_price: i.cost_price || 0,
          })
        })

        tx.update(doc(db, 'sales', editSale.id), {
          subtotal: editItems.reduce((s, i) => s + Number(i.rate) * Number(i.qty), 0),
          discount: Number(editDiscount) || 0, total: newTotal, amount_paid: paid, balance_due: newBalanceDue,
          is_credit_sale: newBalanceDue > 0,
        })
      })

      if (editSale.is_credit_sale) {
        const debtSnap = await getDocs(query(collection(db, 'debts'), where('sale_id', '==', editSale.id)))
        if (!debtSnap.empty) {
          const debtRef = doc(db, 'debts', debtSnap.docs[0].id)
          await runTransaction(db, async (tx) => {
            tx.update(debtRef, { original_amount: newTotal, balance: newBalanceDue, status: newBalanceDue === 0 ? 'paid' : 'partially_paid' })
          })
        }
      }

      await logAudit({ userId: profile?.id, action: 'edit_sale', entityType: 'sales', entityId: editSale.id, oldValues: { total: editSale.total }, newValues: { total: newTotal } })
      setEditSale(null)
      load()
    } catch (err) {
      alert('Could not save changes: ' + err.message)
    } finally {
      setSaving(false)
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
                        {isAdmin && row.raw.status !== 'void' && (
                          <button onClick={() => openEditSale(row.raw)} title="Edit sale (admin only)" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><Pencil size={15} /></button>
                        )}
                        {isAdmin && row.raw.status !== 'void' && (
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

      <Modal
        open={!!editSale}
        onClose={() => setEditSale(null)}
        title={`Edit Sale: ${editSale?.receipt_number || ''} (admin only)`}
        wide
      >
        {editSale && (
          <form onSubmit={saveSaleEdit}>
            <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 mb-3">
              Editing a completed sale adjusts stock and any linked debt automatically. Use carefully — this changes financial records.
            </p>
            {editItems.map((row, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_70px_100px_30px] gap-2 mb-2 items-center">
                <select
                  className="px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-sm"
                  value={row.product_id || ''}
                  onChange={(e) => {
                    const p = products.find((pr) => pr.id === e.target.value)
                    updateEditRow(idx, 'product_id', e.target.value)
                    if (p) { updateEditRow(idx, 'product_name', p.name); updateEditRow(idx, 'rate', p.selling_price); updateEditRow(idx, 'cost_price', p.buying_price) }
                  }}
                >
                  <option value="">{row.product_name || 'Select product'}</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input type="number" min="1" className="px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-sm" value={row.qty} onChange={(e) => updateEditRow(idx, 'qty', e.target.value)} placeholder="Qty" />
                <input type="number" className="px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-sm" value={row.rate} onChange={(e) => updateEditRow(idx, 'rate', e.target.value)} placeholder="Rate" />
                <button type="button" onClick={() => removeEditRow(idx)} className="text-red-500"><Trash2 size={15} /></button>
              </div>
            ))}
            <button type="button" onClick={addEditRow} className="text-sm text-brand mb-3"><Plus size={13} className="inline" /> Add item</button>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <Input label={`Discount (${company.currency})`} type="number" value={editDiscount} onChange={(e) => setEditDiscount(e.target.value)} />
              <Input label={`Amount Paid (${company.currency})`} type="number" value={editPaid} onChange={(e) => setEditPaid(e.target.value)} />
            </div>
            <p className="text-sm font-semibold mb-3">New Total: {formatMoney(editTotal(), company.currency)}</p>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditSale(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
            </div>
          </form>
        )}
      </Modal>
    </Card>
  )
}
