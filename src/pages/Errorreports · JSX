import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs, query, orderBy, limit, writeBatch, doc } from 'firebase/firestore'
import { ArrowLeft, Bug, Trash2, ChevronDown, RefreshCw } from 'lucide-react'
import { db } from '../lib/firebase'

const SOURCE_LABEL = { js_error: 'Script error', promise: 'Failed action', screen_crash: 'Screen crash' }
const SOURCE_STYLE = {
  screen_crash: 'bg-red-100 text-red-700',
  promise: 'bg-orange-100 text-orange-700',
  js_error: 'bg-yellow-100 text-yellow-800',
}

const when = (ts) => (ts?.toDate ? ts.toDate().toLocaleString() : '-')

export default function ErrorReports() {
  const [rows, setRows] = useState([])
  const [shops, setShops] = useState({})
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    const [eSnap, tSnap] = await Promise.all([
      getDocs(query(collection(db, 'errorLogs'), orderBy('createdAt', 'desc'), limit(200))),
      getDocs(collection(db, 'tenants')),
    ])
    setRows(eSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
    const map = {}
    tSnap.docs.forEach((d) => { map[d.id] = d.data().shopName || d.id })
    setShops(map)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Same error repeated many times shows as ONE line with a count
  const groups = useMemo(() => {
    const m = new Map()
    rows.forEach((r) => {
      const key = `${r.source}|${r.message}`
      if (!m.has(key)) m.set(key, { key, message: r.message, source: r.source, items: [] })
      m.get(key).items.push(r)
    })
    return [...m.values()]
  }, [rows])

  const removeDocs = async (ids) => {
    setBusy(true)
    try {
      for (let i = 0; i < ids.length; i += 400) {
        const batch = writeBatch(db)
        ids.slice(i, i + 400).forEach((id) => batch.delete(doc(db, 'errorLogs', id)))
        // eslint-disable-next-line no-await-in-loop
        await batch.commit()
      }
      await load()
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="bg-gradient-to-br from-rose-600 to-orange-600 px-4 sm:px-6 pt-6 pb-16">
        <div className="max-w-4xl mx-auto">
          <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-white/80 hover:text-white mb-3"><ArrowLeft size={14} /> Back to shops</Link>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-white"><Bug size={22} /> Error Reports</h1>
              <p className="text-sm text-white/80 mt-0.5">Problems the app caught on your shops' devices. The same error is grouped into one line.</p>
            </div>
            <button onClick={load} className="p-2 rounded-lg bg-white/15 hover:bg-white/25 text-white" title="Refresh"><RefreshCw size={16} /></button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 -mt-8 pb-10 space-y-3">
        <div className="flex items-center justify-between rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-100 dark:ring-gray-800 px-4 py-3 text-sm">
          <span className="text-gray-600 dark:text-gray-300"><b>{groups.length}</b> different error{groups.length === 1 ? '' : 's'} · <b>{rows.length}</b> report{rows.length === 1 ? '' : 's'}</span>
          {rows.length > 0 && (
            <button disabled={busy} onClick={() => confirm('Delete ALL error reports?') && removeDocs(rows.map((r) => r.id))} className="text-red-600 font-medium text-xs hover:underline disabled:opacity-50">Clear all</button>
          )}
        </div>

        {loading ? <p className="text-center text-sm text-gray-400 py-10">Loading...</p> : groups.length === 0 ? (
          <div className="text-center py-14 rounded-2xl bg-white dark:bg-gray-900 shadow-sm"><p className="text-3xl mb-2">✅</p><p className="text-sm text-gray-500">No errors reported. Everything is running smoothly.</p></div>
        ) : groups.map((g) => {
          const latest = g.items[0]
          const shopNames = [...new Set(g.items.map((i) => shops[i.tenantId] || (i.tenantId ? i.tenantId.slice(0, 6) : 'no shop')))]
          const isOpen = open === g.key
          return (
            <div key={g.key} className="rounded-2xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-100 dark:ring-gray-800 overflow-hidden">
              <button onClick={() => setOpen(isOpen ? null : g.key)} className="w-full text-left p-4 flex items-start gap-3">
                <span className={`shrink-0 mt-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full ${SOURCE_STYLE[g.source] || 'bg-gray-100 text-gray-600'}`}>{SOURCE_LABEL[g.source] || g.source}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-gray-800 dark:text-gray-100 break-words">{g.message}</span>
                  <span className="block text-xs text-gray-400 mt-1">{g.items.length}× · last {when(latest.createdAt)} · {shopNames.join(', ')} · {latest.page}</span>
                </span>
                <ChevronDown size={16} className={`shrink-0 mt-1 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800">
                  <p className="text-xs text-gray-400 mt-3 mb-1">Details (most recent)</p>
                  <p className="text-xs text-gray-600 dark:text-gray-300">Role: {latest.role || '-'} · {latest.online ? 'Online' : 'Offline'}</p>
                  <p className="text-xs text-gray-400 break-words mt-1">{latest.device}</p>
                  <pre className="mt-2 text-[11px] leading-snug bg-gray-50 dark:bg-gray-800 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-56">{latest.stack || 'No technical details'}</pre>
                  <button disabled={busy} onClick={() => removeDocs(g.items.map((i) => i.id))} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50"><Trash2 size={13} /> Mark as fixed (delete {g.items.length})</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
