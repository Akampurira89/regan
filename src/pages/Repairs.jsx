import { useEffect, useState } from 'react'
import { Plus, MessageSquare } from 'lucide-react'
import { collection, getDocs, addDoc, updateDoc, doc, query, where, orderBy, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Button, Card, Input, Select, Textarea, Modal, EmptyState, Badge } from '../components/ui/ui'
import { formatDate, generateSequenceNumber, logAudit } from '../utils/helpers'
import { useAuth } from '../context/AuthContext'

const STATUSES = ['received', 'diagnosing', 'waiting_parts', 'in_progress', 'ready', 'delivered', 'cancelled']

const empty = { customer_id: '', device_type: '', brand: '', model: '', serial_or_imei: '', fault_description: '', technician_id: '', cost_estimate: '0' }

export default function Repairs() {
  const { profile } = useAuth()
  const [repairs, setRepairs] = useState([])
  const [customers, setCustomers] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [noteModal, setNoteModal] = useState(null)
  const [notes, setNotes] = useState([])
  const [newNote, setNewNote] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [rSnap, cSnap, tSnap] = await Promise.all([
      getDocs(collection(db, 'repairs')),
      getDocs(collection(db, 'customers')),
      getDocs(query(collection(db, 'profiles'), where('role', 'in', ['technician', 'admin']))),
    ])
    const customerMap = Object.fromEntries(cSnap.docs.map((d) => [d.id, d.data()]))
    const techMap = Object.fromEntries(tSnap.docs.map((d) => [d.id, d.data()]))
    setRepairs(rSnap.docs.map((d) => {
      const data = d.data()
      return { id: d.id, ...data, customer: customerMap[data.customer_id], technicianName: techMap[data.technician_id]?.full_name }
    }).sort((a, b) => (b.received_at?.seconds || 0) - (a.received_at?.seconds || 0)))
    setCustomers(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
    setTechnicians(tSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const openNew = () => { setForm(empty); setModalOpen(true) }

  const save = async (e) => {
    e.preventDefault()
    const ticketNumber = await generateSequenceNumber('RPR', 'repairs', 'received_at')
    const payload = { ...form, ticket_number: ticketNumber, cost_estimate: Number(form.cost_estimate) || 0, technician_id: form.technician_id || null, customer_id: form.customer_id || null, status: 'received', received_at: serverTimestamp() }
    const ref = await addDoc(collection(db, 'repairs'), payload)
    await logAudit({ userId: profile?.id, action: 'create', entityType: 'repairs', entityId: ref.id, newValues: payload })
    setModalOpen(false)
    load()
  }

  const updateStatus = async (repair, status) => {
    const updates = { status }
    if (status === 'delivered') updates.completed_at = serverTimestamp()
    await updateDoc(doc(db, 'repairs', repair.id), updates)
    await logAudit({ userId: profile?.id, action: 'update', entityType: 'repairs', entityId: repair.id, newValues: updates })
    load()
  }

  const openNotes = async (repair) => {
    setNoteModal(repair)
    const snap = await getDocs(collection(db, 'repairs', repair.id, 'notes'))
    setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0)))
  }

  const addNote = async (e) => {
    e.preventDefault()
    if (!newNote.trim()) return
    await addDoc(collection(db, 'repairs', noteModal.id, 'notes'), { note: newNote, added_by: profile?.id, addedByName: profile?.full_name, created_at: serverTimestamp() })
    setNewNote('')
    openNotes(noteModal)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Repairs / Service Tickets</h1>
          <p className="text-sm text-gray-400">{repairs.filter((r) => !['delivered', 'cancelled'].includes(r.status)).length} open tickets</p>
        </div>
        <Button onClick={openNew}><Plus size={15} className="inline mr-1" /> New Repair Ticket</Button>
      </div>

      <Card>
        {loading ? <p className="text-sm text-gray-400">Loading...</p> : repairs.length === 0 ? <EmptyState /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="py-2">Ticket</th><th className="py-2">Customer</th><th className="py-2">Device</th><th className="py-2">Technician</th><th className="py-2">Status</th><th className="py-2 text-right">Notes</th>
              </tr></thead>
              <tbody>
                {repairs.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 dark:border-gray-800/50">
                    <td className="py-2 font-medium">{r.ticket_number}</td>
                    <td className="py-2 text-gray-500">{r.customer?.name}</td>
                    <td className="py-2 text-gray-500">{r.device_type} {r.brand} {r.model}</td>
                    <td className="py-2 text-gray-500">{r.technicianName || 'Unassigned'}</td>
                    <td className="py-2">
                      <select value={r.status} onChange={(e) => updateStatus(r, e.target.value)} className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800">
                        {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                      </select>
                    </td>
                    <td className="py-2 text-right">
                      <button onClick={() => openNotes(r)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><MessageSquare size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Repair Ticket" wide>
        <form onSubmit={save} className="grid sm:grid-cols-2 gap-x-4">
          <Select label="Customer *" required value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
            <option value="">Select customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input label="Device Type * (phone, TV, radio...)" required value={form.device_type} onChange={(e) => setForm({ ...form, device_type: e.target.value })} />
          <Input label="Brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          <Input label="Model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          <Input label="Serial Number / IMEI" value={form.serial_or_imei} onChange={(e) => setForm({ ...form, serial_or_imei: e.target.value })} />
          <Select label="Assign Technician" value={form.technician_id} onChange={(e) => setForm({ ...form, technician_id: e.target.value })}>
            <option value="">Unassigned</option>
            {technicians.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </Select>
          <Input label="Cost Estimate" type="number" value={form.cost_estimate} onChange={(e) => setForm({ ...form, cost_estimate: e.target.value })} />
          <div className="sm:col-span-2">
            <Textarea label="Fault Description *" required value={form.fault_description} onChange={(e) => setForm({ ...form, fault_description: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2 mt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit">Create Ticket</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!noteModal} onClose={() => setNoteModal(null)} title={`Repair Notes: ${noteModal?.ticket_number || ''}`}>
        <form onSubmit={addNote} className="flex gap-2 mb-4">
          <input className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-sm" placeholder="Add a note..." value={newNote} onChange={(e) => setNewNote(e.target.value)} />
          <Button type="submit">Add</Button>
        </form>
        {notes.length === 0 ? <EmptyState message="No notes yet." /> : (
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="text-sm border-b border-gray-100 dark:border-gray-800 pb-2">
                <p>{n.note}</p>
                <p className="text-xs text-gray-400">{n.addedByName || 'Staff'} · {formatDate(n.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
