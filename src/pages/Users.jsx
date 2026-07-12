import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { collection, getDocs, updateDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { createStaffAuthAccount } from '../lib/createStaffAccount'
import { Card, Badge, EmptyState, Button, Modal, Input, Select } from '../components/ui/ui'
import { formatDate, logAudit } from '../utils/helpers'
import { useAuth } from '../context/AuthContext'

const empty = { full_name: '', email: '', password: '', role: 'cashier', phone: '' }

export default function Users() {
  const { profile } = useAuth()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    const snap = await getDocs(collection(db, 'profiles'))
    setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0)))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const changeRole = async (user, role) => {
    await updateDoc(doc(db, 'profiles', user.id), { role })
    await logAudit({ userId: profile?.id, action: 'update', entityType: 'profiles', entityId: user.id, newValues: { role } })
    load()
  }

  const toggleActive = async (user) => {
    await updateDoc(doc(db, 'profiles', user.id), { is_active: !user.is_active })
    await logAudit({ userId: profile?.id, action: 'update', entityType: 'profiles', entityId: user.id, newValues: { is_active: !user.is_active } })
    load()
  }

  const addStaff = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password.length < 6) { setError('Password must be at least 6 characters (Firebase minimum).'); return }
    setSaving(true)
    try {
      const uid = await createStaffAuthAccount(form.email, form.password)
      await setDoc(doc(db, 'profiles', uid), {
        full_name: form.full_name, role: form.role, phone: form.phone, is_active: true, created_at: serverTimestamp(),
      })
      await logAudit({ userId: profile?.id, action: 'create', entityType: 'profiles', entityId: uid, newValues: { full_name: form.full_name, role: form.role } })
      setModalOpen(false); setForm(empty)
      load()
    } catch (err) {
      setError(err.code === 'auth/email-already-in-use' ? 'That email is already registered.' : err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Staff / Users / Roles</h1>
          <p className="text-sm text-gray-400">Add cashiers, managers, and technicians — they'll only see the pages their role allows.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}><Plus size={15} className="inline mr-1" /> Add Staff</Button>
      </div>

      <Card>
        {loading ? <p className="text-sm text-gray-400">Loading...</p> : staff.length === 0 ? <EmptyState /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="py-2">Name</th><th className="py-2">Phone</th><th className="py-2">Role</th><th className="py-2">Status</th><th className="py-2">Joined</th>
              </tr></thead>
              <tbody>
                {staff.map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 dark:border-gray-800/50">
                    <td className="py-2 font-medium">{u.full_name}</td>
                    <td className="py-2 text-gray-500">{u.phone || '-'}</td>
                    <td className="py-2">
                      <select value={u.role} onChange={(e) => changeRole(u, e.target.value)} className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 capitalize">
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="cashier">Cashier</option>
                        <option value="technician">Technician</option>
                      </select>
                    </td>
                    <td className="py-2">
                      <button onClick={() => toggleActive(u)}>
                        <Badge color={u.is_active ? 'green' : 'red'}>{u.is_active ? 'Active' : 'Disabled'}</Badge>
                      </button>
                    </td>
                    <td className="py-2 text-gray-500">{formatDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Staff Member">
        <form onSubmit={addStaff}>
          <Input label="Full Name *" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Login Email *" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Login Password * (min 6 characters)" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="cashier">Cashier</option>
            <option value="manager">Manager</option>
            <option value="technician">Technician</option>
            <option value="admin">Admin</option>
          </Select>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create Staff Login'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
