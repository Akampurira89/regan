import { useEffect, useState } from 'react'
import { Plus, Search, Eye, Pencil, MessageCircle } from 'lucide-react'
import { collection, getDocs, addDoc, updateDoc, doc, query, where, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Button, Card, Input, Textarea, Modal, EmptyState, Badge } from '../components/ui/ui'
import { formatMoney, formatDate, logAudit } from '../utils/helpers'
import { openWhatsApp } from '../utils/notifications'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'

const empty = { name: '', phone: '', email: '', address: '', notes: '' }

export default function Customers() {
  const { profile } = useAuth()
  const { company, template } = useSettings()
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [historyFor, setHistoryFor] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const snap = await getDocs(collection(db, 'customers'))
    setCustomers(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '')))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = customers.filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search))

  const openNew = () => { setEditing(null); setForm(empty); setModalOpen(true) }
  const openEdit = (c) => { setEditing(c); setForm(c); setModalOpen(true) }

  const save = async (e) => {
    e.preventDefault()
    if (editing) {
      await updateDoc(doc(db, 'customers', editing.id), form)
      await logAudit({ userId: profile?.id, action: 'update', entityType: 'customers', entityId: editing.id, newValues: form })
    } else {
      const ref = await addDoc(collection(db, 'customers'), { ...form, loyalty_points: 0, created_at: serverTimestamp() })
      await logAudit({ userId: profile?.id, action: 'create', entityType: 'customers', entityId: ref.id, newValues: form })
    }
    setModalOpen(false)
    load()
  }

  const viewHistory = async (c) => {
    setHistoryFor(c)
    const snap = await getDocs(query(collection(db, 'sales'), where('customer_id', '==', c.id)))
    setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0)))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Customers</h1>
          <p className="text-sm text-gray-400">{customers.length} customers</p>
        </div>
        <Button onClick={openNew}><Plus size={15} className="inline mr-1" /> Add Customer</Button>
      </div>

      <Card>
        <div className="relative mb-3 max-w-sm">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 text-sm" placeholder="Search name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {loading ? <p className="text-sm text-gray-400">Loading...</p> : filtered.length === 0 ? <EmptyState /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="py-2">Name</th><th className="py-2">Phone</th><th className="py-2">Loyalty Pts</th><th className="py-2 text-right">Actions</th>
              </tr></thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 dark:border-gray-800/50">
                    <td className="py-2 font-medium">{c.name}</td>
                    <td className="py-2 text-gray-500">{c.phone || '-'}</td>
                    <td className="py-2"><Badge color="blue">{c.loyalty_points || 0} pts</Badge></td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-1">
                        {c.phone && <button onClick={() => openWhatsApp(c.phone, `Hello ${c.name}, this is ${template.shop_name}.`)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-emerald-600" title="Message on WhatsApp"><MessageCircle size={15} /></button>}
                        <button onClick={() => viewHistory(c)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800" title="Purchase history"><Eye size={15} /></button>
                        <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800" title="Edit"><Pencil size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Customer' : 'Add Customer'}>
        <form onSubmit={save}>
          <Input label="Full Name *" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Phone" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Address" value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Textarea label="Notes" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit">{editing ? 'Save' : 'Add'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!historyFor} onClose={() => setHistoryFor(null)} title={`Purchase History: ${historyFor?.name || ''}`} wide>
        {history.length === 0 ? <EmptyState message="No purchases yet." /> : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {history.map((s) => (
              <div key={s.id} className="flex justify-between items-center py-2 text-sm">
                <div>
                  <p className="font-medium">{s.receipt_number}</p>
                  <p className="text-xs text-gray-400">{formatDate(s.created_at)}</p>
                </div>
                <span className="font-semibold">{formatMoney(s.total, company.currency)}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
