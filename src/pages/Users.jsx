import { useEffect, useState } from 'react'
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Card, Badge, EmptyState } from '../components/ui/ui'
import { formatDate, logAudit } from '../utils/helpers'
import { useAuth } from '../context/AuthContext'

export default function Users() {
  const { profile } = useAuth()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Staff / Users / Roles</h1>
        <p className="text-sm text-gray-400">
          To add a new staff member: create their account in Firebase Authentication, then create a matching
          document in the <code>profiles</code> collection (doc ID = their Firebase Auth UID) with their name
          and role. See README for the exact steps.
        </p>
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
    </div>
  )
}
