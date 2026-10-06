import { useEffect, useRef, useState } from 'react'
import { Plus, Pencil, Wallet, History, ShoppingBag, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp, runTransaction, writeBatch } from 'firebase/firestore'
import { db, tPath } from '../lib/firebase'
import { Button, Card, Input, Textarea, Modal, EmptyState, Badge } from '../components/ui/ui'
import { formatMoney, formatDate, logAudit } from '../utils/helpers'
import { allocatePaymentsFIFO, allocateToPurchases } from '../utils/allocation'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'

const empty = { name: '', contact_person: '', phone: '', email: '', address: '', notes: '', balance_owed: 0 }

export default function Suppliers() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [reconciling, setReconciling] = useState(false)
  const { company } = useSettings()
  const [suppliers, setSuppliers] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [loading, setLoading] = useState(true)
  const [payModal, setPayModal] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [paying, setPaying] = useState(false)
  const payingRef = useRef(false)
  const [historyFor, setHistoryFor] = useState(null)
  const [history, setHistory] = useState([])

  const load = async () => {
    setLoading(true)
    const snap = await getDocs(collection(db, ...tPath('suppliers')))
    setSuppliers(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '')))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(empty); setModalOpen(true) }
  const openEdit = (s) => { setEditing(s); setForm(s); setModalOpen(true) }

  const deleteSupplier = async (supplier) => {
    if (supplier.balance_owed > 0) {
      alert(`You still owe ${supplier.name} ${formatMoney(supplier.balance_owed, company.currency)}. Settle or clear that balance before deleting them.`)
      return
    }
    const purchasesSnap = await getDocs(query(collection(db, ...tPath('purchases')), where('supplier_id', '==', supplier.id)))
    if (!purchasesSnap.empty) {
      if (!confirm(`${supplier.name} has ${purchasesSnap.size} past purchase record(s). Deleting the supplier keeps those records but removes them from your supplier list. Continue?`)) return
    } else if (!confirm(`Delete supplier "${supplier.name}"?`)) return
    await deleteDoc(doc(db, ...tPath('suppliers', supplier.id)))
    await logAudit({ userId: profile?.id, action: 'delete', entityType: 'suppliers', entityId: supplier.id, oldValues: supplier })
    load()
  }

  const save = async (e) => {
    e.preventDefault()
    if (editing) {
      await updateDoc(doc(db, ...tPath('suppliers', editing.id)), form)
      await logAudit({ userId: profile?.id, action: 'update', entityType: 'suppliers', entityId: editing.id, newValues: form })
    } else {
      const ref = await addDoc(collection(db, ...tPath('suppliers')), { ...form, created_at: serverTimestamp() })
      await logAudit({ userId: profile?.id, action: 'create', entityType: 'suppliers', entityId: ref.id, newValues: form })
    }
    setModalOpen(false)
    load()
  }

  const recordPayment = async (e) => {
    e.preventDefault()
    // Block double-taps instantly (ref updates immediately, state does not)
    if (payingRef.current) return
    const amount = Number(payAmount)
    if (!amount || amount <= 0) return
    if (!navigator.onLine) { alert('No internet connection. This needs internet so stock and balances stay exact. Please reconnect and try again.'); return }
    const supplier = payModal
    payingRef.current = true
    setPaying(true)
    try {
      // This supplier's orders, oldest first, so the payment can be applied to them
      const purchSnap = await getDocs(query(collection(db, ...tPath('purchases')), where('supplier_id', '==', supplier.id)))
      const purchaseRefs = purchSnap.docs
        .sort((a, b) => (a.data().created_at?.seconds || 0) - (b.data().created_at?.seconds || 0))
        .map((d) => d.ref)

      // Supplier balance, the orders' balances and the payment record are saved together, all or nothing
      await runTransaction(db, async (tx) => {
        const ref = doc(db, ...tPath('suppliers', supplier.id))
        const [snap, ...pSnaps] = await Promise.all([tx.get(ref), ...purchaseRefs.map((r) => tx.get(r))])
        const currentOwed = snap.data()?.balance_owed || 0
        if (amount > currentOwed) {
          throw new Error(`Amount is more than the balance owed (${formatMoney(currentOwed, company.currency)}).`)
        }
        const open = pSnaps
          .filter((ps) => ps.exists())
          .map((ps) => ({ ref: ps.ref, balance_due: Number(ps.data().balance_due) || 0, paid_via_payments: Number(ps.data().paid_via_payments) || 0 }))
          .filter((p) => p.balance_due > 0)
        const { updates } = allocateToPurchases(open, amount)
        updates.forEach((u) => tx.update(u.ref, { paid_via_payments: u.paid_via_payments, balance_due: u.balance_due }))
        tx.update(ref, { balance_owed: currentOwed - amount })
        const payRef = doc(collection(db, ...tPath('payments')))
        tx.set(payRef, { reference_type: 'supplier', reference_id: supplier.id, amount, method: 'cash', received_by: profile?.id || null, created_at: serverTimestamp() })
      })
      await logAudit({ userId: profile?.id, action: 'payment', entityType: 'suppliers', entityId: supplier.id, newValues: { amount } })
      setPayModal(null); setPayAmount('')
      load()
    } catch (err) {
      alert('Could not record payment: ' + err.message)
    } finally {
      payingRef.current = false
      setPaying(false)
    }
  }

  // Rebuilds what is owed from the records themselves: every order's total minus what was paid
  // when it was recorded, minus all supplier payments applied oldest-first. Safe to run any time.
  const computeBalances = async (onlySupplierId) => {
    const [purchSnap, paySnap, supSnap] = await Promise.all([
      getDocs(collection(db, ...tPath('purchases'))),
      getDocs(query(collection(db, ...tPath('payments')), where('reference_type', '==', 'supplier'))),
      getDocs(collection(db, ...tPath('suppliers'))),
    ])
    return supSnap.docs.filter((sd) => !onlySupplierId || sd.id === onlySupplierId).map((sd) => {
      const purchases = purchSnap.docs.filter((p) => p.data().supplier_id === sd.id)
        .map((p) => ({ id: p.id, total: p.data().total, amount_paid: p.data().amount_paid, created_secs: p.data().created_at?.seconds || 0 }))
      const paid = paySnap.docs.filter((p) => p.data().reference_id === sd.id).reduce((sum, p) => sum + Number(p.data().amount || 0), 0)
      return { id: sd.id, name: sd.data().name, current: Number(sd.data().balance_owed) || 0, paid, ...allocatePaymentsFIFO(purchases, paid) }
    })
  }

  const applyBalances = async (results) => {
    const ops = []
    results.forEach((r) => {
      ops.push([doc(db, ...tPath('suppliers', r.id)), { balance_owed: r.owed }])
      r.rows.forEach((row) => ops.push([doc(db, ...tPath('purchases', row.id)), { paid_via_payments: row.paid_via_payments, balance_due: row.balance_due }]))
    })
    for (let i = 0; i < ops.length; i += 400) {
      const batch = writeBatch(db)
      ops.slice(i, i + 400).forEach(([ref, data]) => batch.update(ref, data))
      await batch.commit()
    }
  }

  const reconcileBalances = async () => {
    if (!navigator.onLine) { alert('No internet connection. This needs internet so stock and balances stay exact. Please reconnect and try again.'); return }
    setReconciling(true)
    try {
      const results = await computeBalances()
      const summary = results.map((r) => `${r.name}: now ${formatMoney(r.current, company.currency)} -> ${formatMoney(r.owed, company.currency)}${r.overpaid > 0 ? `  (payments are ${formatMoney(r.overpaid, company.currency)} MORE than owed - look for duplicate payments in History)` : ''}`).join('\n')
      if (!confirm('Recalculate what you owe each supplier from your orders and payment records?\n\n' + summary)) return
      await applyBalances(results)
      await logAudit({ userId: profile?.id, action: 'recalculate_supplier_balances', entityType: 'suppliers', entityId: 'all', newValues: { suppliers: results.length } })
      load()
    } catch (err) {
      alert('Could not recalculate: ' + err.message)
    } finally {
      setReconciling(false)
    }
  }

  const removePayment = async (supplier, payment) => {
    if (!confirm(`Remove this payment of ${formatMoney(payment.amount, company.currency)} (${formatDate(payment.created_at)})?\n\nUse this only for a mistaken or duplicate entry. ${supplier.name}'s balance will be recalculated.`)) return
    if (!navigator.onLine) { alert('No internet connection. This needs internet so stock and balances stay exact. Please reconnect and try again.'); return }
    try {
      await deleteDoc(doc(db, ...tPath('payments', payment.id)))
      await logAudit({ userId: profile?.id, action: 'delete', entityType: 'supplier_payment', entityId: payment.id, oldValues: { supplier: supplier.name, amount: payment.amount } })
      await applyBalances(await computeBalances(supplier.id))
      await load()
      await viewHistory(supplier)
    } catch (err) {
      alert('Could not remove payment: ' + err.message)
    }
  }

  const viewHistory = async (supplier) => {
    setHistoryFor(supplier)
    const [purchasesSnap, paymentsSnap] = await Promise.all([
      getDocs(query(collection(db, ...tPath('purchases')), where('supplier_id', '==', supplier.id))),
      getDocs(query(collection(db, ...tPath('payments')), where('reference_type', '==', 'supplier'), where('reference_id', '==', supplier.id))),
    ])
    const purchases = purchasesSnap.docs.map((d) => ({ id: d.id, type: 'purchase', ...d.data() }))
    const payments = paymentsSnap.docs.map((d) => ({ id: d.id, type: 'payment', ...d.data() }))
    setHistory([...purchases, ...payments].sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0)))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Suppliers</h1>
          <p className="text-sm text-gray-400">{suppliers.length} suppliers</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && <Button variant="secondary" onClick={reconcileBalances} disabled={reconciling}>{reconciling ? 'Checking...' : 'Recalculate balances'}</Button>}
          <Link to="/purchases"><Button variant="secondary"><ShoppingBag size={15} className="inline mr-1" /> Order Stock</Button></Link>
          <Button onClick={openNew}><Plus size={15} className="inline mr-1" /> Add Supplier</Button>
        </div>
      </div>

      <Card>
        {loading ? <p className="text-sm text-gray-400">Loading...</p> : suppliers.length === 0 ? <EmptyState /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="py-2">Name</th><th className="py-2">Contact</th><th className="py-2">Phone</th><th className="py-2">Balance Owed</th><th className="py-2 text-right">Actions</th>
              </tr></thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50 dark:border-gray-800/50">
                    <td className="py-2 font-medium">{s.name}</td>
                    <td className="py-2 text-gray-500">{s.contact_person || '-'}</td>
                    <td className="py-2 text-gray-500">{s.phone || '-'}</td>
                    <td className="py-2">
                      {s.balance_owed > 0 ? <Badge color="red">{formatMoney(s.balance_owed, company.currency)}</Badge> : <Badge color="green">Settled</Badge>}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => viewHistory(s)} title="Order & payment history" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><History size={15} /></button>
                        {s.balance_owed > 0 && <button onClick={() => setPayModal(s)} title="Pay supplier" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-emerald-600"><Wallet size={15} /></button>}
                        <button onClick={() => openEdit(s)} title="Edit" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><Pencil size={15} /></button>
                        <button onClick={() => deleteSupplier(s)} title="Delete" className="p-1.5 rounded hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Supplier' : 'Add Supplier'}>
        <form onSubmit={save}>
          <Input label="Supplier Name *" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Contact Person" value={form.contact_person || ''} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
          <Input label="Phone" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Textarea label="Address" value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Textarea label="Notes" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit">{editing ? 'Save' : 'Add'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!payModal} onClose={() => setPayModal(null)} title={`Pay ${payModal?.name || ''}`}>
        <form onSubmit={recordPayment}>
          <p className="text-sm text-gray-500 mb-3">Balance owed: <strong>{formatMoney(payModal?.balance_owed, company.currency)}</strong></p>
          <Input label="Amount Paying" type="number" required min="1" max={payModal?.balance_owed || undefined} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="secondary" disabled={paying} onClick={() => setPayModal(null)}>Cancel</Button>
            <Button type="submit" disabled={paying}>{paying ? 'Saving...' : 'Save Payment'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!historyFor} onClose={() => setHistoryFor(null)} title={`History: ${historyFor?.name || ''}`} wide>
        {history.length === 0 ? <EmptyState message="No orders or payments yet." /> : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {history.map((h) => (
              <div key={h.id} className="flex justify-between items-center py-2 text-sm">
                <div>
                  <p className="font-medium">{h.type === 'purchase' ? 'Stock Order' : 'Payment Made'}</p>
                  <p className="text-xs text-gray-400">{formatDate(h.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${h.type === 'purchase' ? 'text-gray-800 dark:text-gray-100' : 'text-emerald-600'}`}>
                    {h.type === 'purchase' ? formatMoney(h.total, company.currency) : `-${formatMoney(h.amount, company.currency)}`}
                  </span>
                  {isAdmin && h.type === 'payment' && (
                    <button onClick={() => removePayment(historyFor, h)} title="Remove mistaken / duplicate payment" className="p-1 rounded hover:bg-red-50 text-red-500"><Trash2 size={14} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
