import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore'
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth, db, secondaryAuth } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { Store, CheckCircle2, XCircle, Search, Plus, LogOut, Sparkles, Pencil, Trash2, ExternalLink, Clock } from 'lucide-react'

const TRIAL_DAYS = 30
const MONTHLY_FEE = 50000

const STATUS_STYLES = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  expired: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  trial: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
}

const AVATAR_GRADIENTS = [
  'from-blue-500 to-cyan-500', 'from-purple-500 to-pink-500', 'from-pink-500 to-rose-500',
  'from-emerald-500 to-teal-500', 'from-amber-500 to-orange-500', 'from-cyan-500 to-blue-500',
  'from-indigo-500 to-purple-500', 'from-rose-500 to-red-500',
]

const avatarGradient = (name = '') => {
  const sum = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
  return AVATAR_GRADIENTS[sum % AVATAR_GRADIENTS.length]
}

const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000)

function statusLabel(t) {
  const now = Date.now()
  if (t.subscriptionStatus === 'trial' && t.trialEndsAt) {
    const daysLeft = Math.ceil((t.trialEndsAt.toMillis() - now) / 86400000)
    if (daysLeft > 0) return { text: `Trial · ${daysLeft}d left`, style: STATUS_STYLES.trial }
    return { text: 'Trial expired', style: STATUS_STYLES.expired }
  }
  if (t.subscriptionStatus === 'active') {
    if (t.nextBillingDate && t.nextBillingDate.toMillis() < now) {
      return { text: 'Payment overdue', style: STATUS_STYLES.expired }
    }
    return { text: 'Active', style: STATUS_STYLES.active }
  }
  return { text: 'Suspended', style: STATUS_STYLES.expired }
}

const emptyAddForm = { shopName: '', ownerName: '', plan: 'standard', adminEmail: '', adminPassword: '' }

export default function SuperAdminDashboard() {
  const { logout } = useAuth()
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState(emptyAddForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [editTarget, setEditTarget] = useState(null)
  const [editForm, setEditForm] = useState({ shopName: '', ownerName: '', plan: 'standard' })

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const load = async () => {
    setLoading(true)
    const snap = await getDocs(collection(db, 'tenants'))
    setTenants(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (!search) return tenants
    const q = search.toLowerCase()
    return tenants.filter((t) => t.shopName?.toLowerCase().includes(q) || t.ownerName?.toLowerCase().includes(q))
  }, [tenants, search])

  const stats = useMemo(() => {
    const now = Date.now()
    let active = 0, needsAttention = 0
    tenants.forEach((t) => {
      const trialValid = t.subscriptionStatus === 'trial' && t.trialEndsAt && t.trialEndsAt.toMillis() > now
      const billingValid = t.subscriptionStatus === 'active' && (!t.nextBillingDate || t.nextBillingDate.toMillis() > now)
      if (trialValid || billingValid) active++
      else needsAttention++
    })
    return { total: tenants.length, active, needsAttention }
  }, [tenants])

  // "Suspend" always fully locks a shop out. "Activate" marks this month as
  // paid and pushes the next billing date exactly 30 days forward from now —
  // this is what you tap once you've received their 50,000 UGX payment.
  const toggleStatus = async (t) => {
    const label = statusLabel(t)
    const isCurrentlyLocked = label.text === 'Suspended' || label.text.includes('overdue') || label.text.includes('expired')
    if (isCurrentlyLocked) {
      await updateDoc(doc(db, 'tenants', t.id), {
        subscriptionStatus: 'active',
        nextBillingDate: Timestamp.fromDate(addDays(new Date(), 30)),
        monthlyFee: MONTHLY_FEE,
      })
    } else {
      await updateDoc(doc(db, 'tenants', t.id), { subscriptionStatus: 'expired' })
    }
    load()
  }

  const openAdd = () => { setAddForm(emptyAddForm); setError(''); setAddOpen(true) }

  const addShop = async (e) => {
    e.preventDefault()
    setError('')
    if (!addForm.shopName || !addForm.ownerName || !addForm.adminEmail || !addForm.adminPassword) {
      setError('Please fill in every field.'); return
    }
    if (addForm.adminPassword.length < 6) {
      setError('Password must be at least 6 characters.'); return
    }
    let tenantId = slugify(addForm.shopName)
    if (!tenantId) { setError('Please enter a valid shop name.'); return }

    setSaving(true)
    try {
      const existing = tenants.find((t) => t.id === tenantId)
      if (existing) tenantId = `${tenantId}-${Date.now().toString().slice(-4)}`

      const cred = await createUserWithEmailAndPassword(secondaryAuth, addForm.adminEmail, addForm.adminPassword)
      const newUid = cred.user.uid
      await signOut(secondaryAuth)

      await setDoc(doc(db, 'tenants', tenantId), {
        shopName: addForm.shopName,
        ownerName: addForm.ownerName,
        subscriptionStatus: 'trial',
        trialEndsAt: Timestamp.fromDate(addDays(new Date(), TRIAL_DAYS)),
        nextBillingDate: null,
        monthlyFee: MONTHLY_FEE,
        plan: addForm.plan,
        createdAt: new Date(),
      })
      await setDoc(doc(db, 'userTenants', newUid), { tenantId, role: 'admin' })
      await setDoc(doc(db, 'tenants', tenantId, 'profiles', newUid), {
        full_name: addForm.ownerName, role: 'admin', is_active: true,
      })

      setAddOpen(false)
      load()
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (t) => {
    setEditTarget(t)
    setEditForm({ shopName: t.shopName || '', ownerName: t.ownerName || '', plan: t.plan || 'standard' })
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    await updateDoc(doc(db, 'tenants', editTarget.id), {
      shopName: editForm.shopName,
      ownerName: editForm.ownerName,
      plan: editForm.plan,
    })
    setEditTarget(null)
    load()
  }

  const openDelete = (t) => { setDeleteTarget(t); setDeleteConfirmText(''); setDeleteError('') }

  const confirmDelete = async () => {
    if (deleteConfirmText !== deleteTarget.shopName) return
    setDeleting(true)
    setDeleteError('')
    try {
      const profilesSnap = await getDocs(collection(db, 'tenants', deleteTarget.id, 'profiles'))
      const uids = profilesSnap.docs.map((p) => p.id)

      if (uids.length > 0) {
        try {
          const token = await auth.currentUser.getIdToken()
          const res = await fetch('/api/deleteAuthUser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ uids }),
          })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            setDeleteError(`Shop data was deleted, but login accounts may not have been fully removed (${body.error || res.status}). You can clean those up manually in Firebase Console → Authentication if needed.`)
          }
        } catch {
          setDeleteError('Shop data was deleted, but login accounts could not be reached. You can remove them manually in Firebase Console → Authentication if needed.')
        }
      }

      for (const uid of uids) {
        await deleteDoc(doc(db, 'tenants', deleteTarget.id, 'profiles', uid))
        await deleteDoc(doc(db, 'userTenants', uid))
      }
      await deleteDoc(doc(db, 'tenants', deleteTarget.id))

      if (!deleteError) setDeleteTarget(null)
      load()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-600 px-4 sm:px-6 pt-6 pb-16">
        <div className="max-w-5xl mx-auto flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-white/80 text-xs font-medium mb-1">
              <Sparkles size={13} /> SUPER ADMIN
            </div>
            <h1 className="text-2xl font-bold text-white">Manage Clients</h1>
            <p className="text-sm text-white/70 mt-0.5">Every shop running on your platform &middot; UGX {MONTHLY_FEE.toLocaleString()}/month after a {TRIAL_DAYS}-day free trial</p>
          </div>
          <button onClick={logout} className="flex items-center gap-1.5 text-sm text-white/90 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors">
            <LogOut size={14} /> Log out
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 -mt-10 pb-10">
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard icon={Store} label="Total Shops" value={stats.total} color="text-blue-600 bg-blue-50 dark:bg-blue-900/30" />
          <StatCard icon={CheckCircle2} label="Active / On Trial" value={stats.active} color="text-green-600 bg-green-50 dark:bg-green-900/30" />
          <StatCard icon={XCircle} label="Needs Attention" value={stats.needsAttention} color="text-red-600 bg-red-50 dark:bg-red-900/30" />
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search shops or owners..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button onClick={openAdd} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors">
            <Plus size={16} /> Add Shop
          </button>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          {loading ? (
            <p className="p-8 text-sm text-gray-400 text-center">Loading shops...</p>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <Store size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">{search ? 'No shops match your search.' : 'No shops yet. Tap "Add Shop" to create the first one.'}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((t) => {
                const label = statusLabel(t)
                const locked = label.text === 'Suspended' || label.text.includes('overdue') || label.text.includes('expired')
                return (
                  <div key={t.id} className="flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <Link to={`/admin/shop/${t.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${avatarGradient(t.shopName)} text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm`}>
                        {(t.shopName || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 dark:text-gray-100 truncate flex items-center gap-1">
                          {t.shopName || '-'} <ExternalLink size={11} className="text-gray-300" />
                        </p>
                        <p className="text-xs text-gray-400 truncate">{t.ownerName || '-'} &middot; {t.plan || 'standard'}</p>
                      </div>
                    </Link>
                    <span className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${label.style}`}>
                      {label.text.includes('Trial') && <Clock size={11} />}
                      {label.text}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => toggleStatus(t)} className="text-xs font-medium text-blue-600 hover:underline px-1.5">
                        {locked ? 'Activate (mark paid)' : 'Suspend'}
                      </button>
                      <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600" title="Edit shop details">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => openDelete(t)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600" title="Delete shop">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {addOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <Store size={17} className="text-blue-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Add New Shop</h2>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Starts with a {TRIAL_DAYS}-day free trial. After that, it'll show as needing payment until you mark it Activated.
            </p>
            <form onSubmit={addShop} className="space-y-3">
              <Field label="Shop Name" value={addForm.shopName} onChange={(v) => setAddForm({ ...addForm, shopName: v })} />
              <Field label="Owner's Name" value={addForm.ownerName} onChange={(v) => setAddForm({ ...addForm, ownerName: v })} />
              <Field label="Owner's Login Email" type="email" value={addForm.adminEmail} onChange={(v) => setAddForm({ ...addForm, adminEmail: v })} />
              <Field label="Temporary Password" value={addForm.adminPassword} onChange={(v) => setAddForm({ ...addForm, adminPassword: v })} placeholder="At least 6 characters" />
              {error && <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setAddOpen(false)} className="px-4 py-2 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Creating...' : 'Create Shop'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <Pencil size={15} className="text-blue-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Edit Shop</h2>
            </div>
            <form onSubmit={saveEdit} className="space-y-3">
              <Field label="Shop Name" value={editForm.shopName} onChange={(v) => setEditForm({ ...editForm, shopName: v })} />
              <Field label="Owner's Name" value={editForm.ownerName} onChange={(v) => setEditForm({ ...editForm, ownerName: v })} />
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Plan</label>
                <select
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 text-sm"
                  value={editForm.plan}
                  onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })}
                >
                  <option value="standard">Standard</option>
                  <option value="premium">Premium</option>
                  <option value="trial">Trial</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditTarget(null)} className="px-4 py-2 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                <Trash2 size={15} className="text-red-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Delete "{deleteTarget.shopName}"?</h2>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              This permanently deletes the shop, its staff profiles, AND their login accounts. Their email addresses become free to reuse immediately. This cannot be undone.
            </p>
            {deleteError && (
              <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg mb-3">{deleteError}</p>
            )}
            <label className="text-xs text-gray-500 dark:text-gray-400">
              Type <strong>{deleteTarget.shopName}</strong> to confirm:
            </label>
            <input
              className="w-full mt-1 mb-3 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 text-sm"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
              <button
                onClick={confirmDelete}
                disabled={deleteConfirmText !== deleteTarget.shopName || deleting}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-40"
              >
                {deleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-4">
      <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center mb-2`}>
        <Icon size={17} />
      </div>
      <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div>
      <label className="text-xs text-gray-500 dark:text-gray-400">{label}</label>
      <input
        type={type}
        className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}
