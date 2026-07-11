import { useEffect, useState } from 'react'
import { collection, getDocs, orderBy, query, limit } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Card, Badge, Select, EmptyState } from '../components/ui/ui'
import { formatDate } from '../utils/helpers'

const ACTION_COLORS = { create: 'green', update: 'blue', delete: 'red', payment: 'green', login: 'gray', stock_adjustment: 'yellow' }

export default function AuditLog() {
  const [logs, setLogs] = useState([])
  const [entityFilter, setEntityFilter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [logSnap, profileSnap] = await Promise.all([
        getDocs(query(collection(db, 'auditLogs'), orderBy('created_at', 'desc'), limit(300))),
        getDocs(collection(db, 'profiles')),
      ])
      const profileMap = Object.fromEntries(profileSnap.docs.map((d) => [d.id, d.data().full_name]))
      setLogs(logSnap.docs.map((d) => ({ id: d.id, ...d.data(), userName: profileMap[d.data().user_id] })))
      setLoading(false)
    })()
  }, [])

  const entities = [...new Set(logs.map((l) => l.entity_type))]
  const filtered = entityFilter ? logs.filter((l) => l.entity_type === entityFilter) : logs

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Audit Log</h1>
          <p className="text-sm text-gray-400">Every create, update, delete, and payment action across the system.</p>
        </div>
        <Select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className="!mb-0">
          <option value="">All entities</option>
          {entities.map((e) => <option key={e} value={e}>{e}</option>)}
        </Select>
      </div>

      <Card>
        {loading ? <p className="text-sm text-gray-400">Loading...</p> : filtered.length === 0 ? <EmptyState /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="py-2">User</th><th className="py-2">Action</th><th className="py-2">Entity</th><th className="py-2">When</th>
              </tr></thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} className="border-b border-gray-50 dark:border-gray-800/50">
                    <td className="py-2">{l.userName || 'System'}</td>
                    <td className="py-2"><Badge color={ACTION_COLORS[l.action] || 'gray'}>{l.action}</Badge></td>
                    <td className="py-2 text-gray-500">{l.entity_type} {l.entity_id ? `#${String(l.entity_id).slice(0, 8)}` : ''}</td>
                    <td className="py-2 text-gray-500">{formatDate(l.created_at)}</td>
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
