import { useEffect, useState } from 'react'
import { Plus, MessageCircle } from 'lucide-react'
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Button, Card, Input, Select, Modal, EmptyState, Badge } from '../components/ui/ui'
import { formatDate, daysBetween, logAudit } from '../utils/helpers'
import { openWhatsApp, warrantyReminderMessage } from '../utils/notifications'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'

const empty = { customer_id: '', product_name: '', serial_or_imei: '', start_date: '', end_date: '', terms: '' }

export default function Warranties() {
  const { profile } = useAuth()
  const { template } = useSettings()
  const [warranties, setWarranties] = useState([])
  const [customers, setCustomers] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [claimModal, setClaimModal] = useState(null)
  const [claimDesc, setClaimDesc] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [wSnap, cSnap] = await Promise.all([getDocs(collection(db, 'warranties')), getDocs(collection(db, 'customers'))])
    const customerMap = Object.fromEntries(cSnap.docs.map((d) => [d.id, d.data()]))
    setWarranties(wSnap.docs.map((d) => ({ id: d.id, ...d.data(), customer: customerMap[d.data().customer_id] })).sort((a, b) => new Date(a.end_date) - new Date(b.end_date)))
    setCustomers(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const save = async (e) => {
    e.preventDefault()
    const payload = { ...form, customer_id: form.customer_id || null, created_at: serverTimestamp() }
    const ref = await addDoc(collection(db, 'warranties'), payload)
    await logAudit({ userId: profile?.id, action: 'create', entityType: 'warranties', entityId: ref.id, newValues: payload })
    setModalOpen(false); setForm(empty)
    load()
  }

  const fileClaim = async (e) => {
    e.preventDefault()
    await addDoc(collection(db, 'warranties', claimModal.id, 'claims'), { claim_description: claimDesc, status: 'open', created_at: serverTimestamp() })
    setClaimModal(null); setClaimDesc('')
    alert('Warranty claim filed.')
  }

  const remind = (w) => {
    if (!w.customer?.phone) { alert('No phone number on file for this customer.'); return }
    const msg = warrantyReminderMessage({ shopName: template.shop_name, customerName: w.customer?.name, productName: w.product_name, endDate: w.end_date })
    openWhatsApp(w.customer.phone, msg)
  }

  const statusFor = (w) => {
    const daysLeft = daysBetween(new Date(), w.end_date)
    if (daysLeft < 0) return { label: 'Expired', color: 'red' }
    if (daysLeft <= 14) return { label: `${daysLeft}d left`, color: 'yellow' }
    return { label: `${daysLeft}d left`, color: 'green' }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Warranty Tracking</h1>
          <p className="text-sm text-gray-400">{warranties.length} warranties on record</p>
        </div>
        <Button onClick={() => setModalOpen(true)}><Plus size={15} className="inline mr-1" /> Add Warranty</Button>
      </div>

      <Card>
        {loading ? <p className="text-sm text-gray-400">Loading...</p> : warranties.length === 0 ? <EmptyState /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="py-2">Product</th><th className="py-2">Customer</th><th className="py-2">Serial</th><th className="py-2">Ends</th><th className="py-2">Status</th><th className="py-2 text-right">Action</th>
              </tr></thead>
              <tbody>
                {warranties.map((w) => {
                  const st = statusFor(w)
                  return (
                    <tr key={w.id} className="border-b border-gray-50 dark:border-gray-800/50">
                      <td className="py-2 font-medium">{w.product_name}</td>
                      <td className="py-2 text-gray-500">{w.customer?.name || '-'}</td>
                      <td className="py-2 text-gray-500">{w.serial_or_imei || '-'}</td>
                      <td className="py-2 text-gray-500">{formatDate(w.end_date)}</td>
                      <td className="py-2"><Badge color={st.color}>{st.label}</Badge></td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {w.customer?.phone && <button onClick={() => remind(w)} title="Send expiry reminder" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-emerald-600"><MessageCircle size={15} /></button>}
                          <Button variant="secondary" onClick={() => setClaimModal(w)}>File Claim</Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Warranty" wide>
        <form onSubmit={save} className="grid sm:grid-cols-2 gap-x-4">
          <Input label="Product Name *" required value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} />
          <Select label="Customer" value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
            <option value="">None</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input label="Serial / IMEI" value={form.serial_or_imei} onChange={(e) => setForm({ ...form, serial_or_imei: e.target.value })} />
          <Input label="Start Date *" type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          <Input label="End Date *" type="date" required value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          <Input label="Terms" value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
          <div className="sm:col-span-2 flex justify-end gap-2 mt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save Warranty</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!claimModal} onClose={() => setClaimModal(null)} title={`File Claim: ${claimModal?.product_name || ''}`}>
        <form onSubmit={fileClaim}>
          <Input label="Issue Description *" required value={claimDesc} onChange={(e) => setClaimDesc(e.target.value)} />
          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="secondary" onClick={() => setClaimModal(null)}>Cancel</Button>
            <Button type="submit">Submit Claim</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
