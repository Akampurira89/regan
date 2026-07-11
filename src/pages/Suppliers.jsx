import { useEffect, useState } from 'react'
import { Plus, Pencil } from 'lucide-react'
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Button, Card, Input, Textarea, Modal, EmptyState, Badge } from '../components/ui/ui'
import { formatMoney, logAudit } from '../utils/helpers'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'

const empty = { name: '', contact_person: '', phone: '', email: '', address: '', notes: '', balance_owed: 0 }

export default function Suppliers() {
  const { profile } = useAuth()
  const { company } = useSettings()
  const [suppliers, setSuppliers] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const snap = await getDocs(collection(db, 'suppliers'))
    setSuppliers(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '')))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(empty); setModalOpen(true) }
  const openEdit = (s) => { setEditing(s); setForm(s); setModalOpen(true) }

  const save = async (e) => {
    e.preventDefault()
    if (editing) {
      await updateDoc(doc(db, 'suppliers', editing.id), form)
      await logAudit({ userId: profile?.id, action: 'update', entityType: 'suppliers', entityId: editing.id, newValues: form })
    } else {
      const ref = await addDoc(collection(db, 'suppliers'), { ...form, created_at: serverTimestamp() })
      await logAudit({ userId: profile?.id, action: 'create', entityType: 'suppliers', entityId: ref.id, newValues: form })
    }
    setModalOpen(false)
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Suppliers</h1>
          <p className="text-sm text-gray-400">{suppliers.length} suppliers</p>
        </div>
        <Button onClick={openNew}><Plus size={15} className="inline mr-1" /> Add Supplier</Button>
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
                      <button onClick={() => openEdit(s)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><Pencil size={15} /></button>
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
    </div>
  )
}
