import { useEffect, useState } from 'react'
import { Plus, HandCoins, CheckCircle2, Wallet } from 'lucide-react'
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Button, Card, Input, Textarea, Modal, EmptyState, Badge } from '../components/ui/ui'
import { formatMoney, formatDate, logAudit } from '../utils/helpers'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'

const empty = { description: '', owner_name: '', owner_phone: '', owner_amount: '' }

export default function Consignment() {
  const { profile } = useAuth()
  const { company } = useSettings()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [sellModal, setSellModal] = useState(null)
  const [saleAmount, setSaleAmount] = useState('')
  const [saleCustomer, setSaleCustomer] = useState('')
  const [payModal, setPayModal] = useState(null)

  const load = async () => {
    setLoading(true)
    const snap = await getDocs(collection(db, 'consignmentItems'))
    setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0)))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const addItem = async (e) => {
    e.preventDefault()
    const payload = {
      description: form.description, owner_name: form.owner_name, owner_phone: form.owner_phone,
      owner_amount: Number(form.owner_amount) || 0, status: 'available', created_at: serverTimestamp(),
    }
    const ref = await addDoc(collection(db, 'consignmentItems'), payload)
    await logAudit({ userId: profile?.id, action: 'create', entityType: 'consignmentItems', entityId: ref.id, newValues: payload })
    setAddModalOpen(false); setForm(empty)
    load()
  }

  const markSold = async (e) => {
    e.preventDefault()
    const amount = Number(saleAmount)
    if (!amount) return
    await updateDoc(doc(db, 'consignmentItems', sellModal.id), {
      status: 'sold', sale_amount: amount, customer_name: saleCustomer, sold_at: serverTimestamp(),
    })
    await logAudit({ userId: profile?.id, action: 'update', entityType: 'consignmentItems', entityId: sellModal.id, newValues: { status: 'sold', sale_amount: amount } })
    setSellModal(null); setSaleAmount(''); setSaleCustomer('')
    load()
  }

  const markPaid = async (item) => {
    if (!confirm(`Confirm you've paid ${item.owner_name} ${formatMoney(item.owner_amount, company.currency)} for "${item.description}"?`)) return
    await updateDoc(doc(db, 'consignmentItems', item.id), { status: 'paid', paid_at: serverTimestamp() })
    await addDoc(collection(db, 'payments'), { reference_type: 'consignment_owner', reference_id: item.id, amount: item.owner_amount, method: 'cash', received_by: profile?.id, created_at: serverTimestamp() })
    await logAudit({ userId: profile?.id, action: 'payment', entityType: 'consignmentItems', entityId: item.id, newValues: { amount: item.owner_amount } })
    load()
  }

  const statusBadge = (status) => {
    if (status === 'available') return <Badge color="blue">Available</Badge>
    if (status === 'sold') return <Badge color="yellow">Sold — owner unpaid</Badge>
    return <Badge color="green">Paid</Badge>
  }

  const totalOwed = items.filter((i) => i.status === 'sold').reduce((s, i) => s + Number(i.owner_amount), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Consignment / Borrowed Items</h1>
          <p className="text-sm text-gray-400">
            For items you borrow from someone else and sell on their behalf — not part of your own stock.
            {totalOwed > 0 && <span className="text-amber-600 font-medium"> You currently owe {formatMoney(totalOwed, company.currency)} to owners.</span>}
          </p>
        </div>
        <Button onClick={() => setAddModalOpen(true)}><Plus size={15} className="inline mr-1" /> Add Borrowed Item</Button>
      </div>

      <Card>
        {loading ? <p className="text-sm text-gray-400">Loading...</p> : items.length === 0 ? (
          <EmptyState message="No borrowed items yet. Add one when someone gives you something to sell for them." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="py-2">Item</th><th className="py-2">Owner</th><th className="py-2">Owed to Owner</th><th className="py-2">Sold For</th><th className="py-2">Your Profit</th><th className="py-2">Status</th><th className="py-2 text-right">Action</th>
              </tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-b border-gray-50 dark:border-gray-800/50">
                    <td className="py-2 font-medium">{i.description}</td>
                    <td className="py-2 text-gray-500">{i.owner_name}<div className="text-xs text-gray-400">{i.owner_phone}</div></td>
                    <td className="py-2">{formatMoney(i.owner_amount, company.currency)}</td>
                    <td className="py-2">{i.sale_amount ? formatMoney(i.sale_amount, company.currency) : '-'}</td>
                    <td className="py-2 font-medium text-emerald-600">{i.sale_amount ? formatMoney(i.sale_amount - i.owner_amount, company.currency) : '-'}</td>
                    <td className="py-2">{statusBadge(i.status)}</td>
                    <td className="py-2 text-right">
                      {i.status === 'available' && (
                        <Button variant="secondary" onClick={() => setSellModal(i)}><HandCoins size={14} className="inline mr-1" />Mark Sold</Button>
                      )}
                      {i.status === 'sold' && (
                        <Button variant="success" onClick={() => markPaid(i)}><Wallet size={14} className="inline mr-1" />Pay Owner</Button>
                      )}
                      {i.status === 'paid' && <CheckCircle2 size={16} className="text-emerald-600 inline" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add Borrowed Item">
        <form onSubmit={addItem}>
          <Textarea label="Item Description *" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Used iPhone 11, black, 64GB" />
          <Input label="Owner's Name *" required value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} />
          <Input label="Owner's Phone" value={form.owner_phone} onChange={(e) => setForm({ ...form, owner_phone: e.target.value })} />
          <Input label={`Amount to Pay Owner When Sold (${company.currency}) *`} type="number" required value={form.owner_amount} onChange={(e) => setForm({ ...form, owner_amount: e.target.value })} />
          <p className="text-xs text-gray-400 -mt-2 mb-3">Whatever you sell it for above this amount is your profit.</p>
          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="secondary" onClick={() => setAddModalOpen(false)}>Cancel</Button>
            <Button type="submit">Add Item</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!sellModal} onClose={() => setSellModal(null)} title={`Mark Sold: ${sellModal?.description || ''}`}>
        <form onSubmit={markSold}>
          <p className="text-sm text-gray-500 mb-3">You owe the owner: <strong>{formatMoney(sellModal?.owner_amount, company.currency)}</strong></p>
          <Input label={`Sold For (${company.currency}) *`} type="number" required value={saleAmount} onChange={(e) => setSaleAmount(e.target.value)} />
          <Input label="Customer Name (optional)" value={saleCustomer} onChange={(e) => setSaleCustomer(e.target.value)} />
          {saleAmount && sellModal && (
            <p className="text-sm mb-3">
              Your profit: <strong className={Number(saleAmount) - sellModal.owner_amount >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                {formatMoney(Number(saleAmount) - sellModal.owner_amount, company.currency)}
              </strong>
            </p>
          )}
          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="secondary" onClick={() => setSellModal(null)}>Cancel</Button>
            <Button type="submit">Confirm Sale</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
