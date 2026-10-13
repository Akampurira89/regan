import { useRef, useState } from 'react'
import { AlertTriangle, Download, Trash2 } from 'lucide-react'
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { Card, Button, Modal, Input } from './ui/ui'
import { useAuth } from '../context/AuthContext'
import { logAudit } from '../utils/helpers'
import { RESET_COLLECTIONS, buildBackup, wipeShopData } from "../lib/firestoreServ
const KEEP = ['Staff accounts and roles', 'Settings and receipt template', 'Categories', 'Audit log']

// "Start fresh" for the shop OWNER only. Three locks: (1) a safety-copy file must be
// downloaded first, (2) the owner types DELETE ALL, (3) the owner re-enters their password.
export default function ResetShopCard() {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [backedUp, setBackedUp] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [done, setDone] = useState(null)
  const busy = useRef(false)

  const close = () => {
    if (busy.current) return
    setOpen(false); setBackedUp(false); setConfirmText(''); setPassword(''); setStatus(''); setError(''); setDone(null)
  }

  const downloadBackup = async () => {
    if (busy.current) return
    busy.current = true; setWorking(true); setError('')
    try {
      const { json } = await buildBackup(profile?.full_name || 'shop', setStatus)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `shop_backup_before_reset_${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      setBackedUp(true); setStatus('Backup downloaded. Check your Downloads folder.')
    } catch (e) {
      setError('Backup failed, so nothing was deleted. ' + (e.message || ''))
    } finally { busy.current = false; setWorking(false) }
  }

  const runReset = async () => {
    if (busy.current) return
    setError('')
    if (confirmText.trim() !== 'DELETE ALL') { setError('Type DELETE ALL exactly as shown.'); return }
    if (!auth.currentUser?.email) { setError('Could not verify your login. Please log in again.'); return }
    busy.current = true; setWorking(true)
    try {
      try {
        await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, password))
      } catch {
        setError('Wrong password. Nothing was deleted.')
        return
      }
      const result = await wipeShopData(setStatus)
      await logAudit({ userId: profile?.id, action: 'reset', entityType: 'shop_data', newValues: { deleted_records: result.total, ...result.counts } })
      setDone(result.total)
    } catch (e) {
      setError('Reset stopped part-way: ' + (e.message || 'unknown error') + '. Your backup file is still safe. Tap the button again to finish.')
    } finally { busy.current = false; setWorking(false) }
  }

  return (
    <>
      <Card title="Danger Zone">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 shrink-0 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-600 flex items-center justify-center"><AlertTriangle size={18} /></div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Start fresh</p>
            <p className="text-xs text-gray-500 mt-0.5 mb-3">Delete all products, sales, customers, suppliers, debts and expenses, and begin again (for example to recount your stock). A backup file is downloaded first.</p>
            <Button variant="danger" onClick={() => setOpen(true)}><Trash2 size={14} className="inline mr-1" /> Delete all data...</Button>
          </div>
        </div>
      </Card>

      <Modal open={open} onClose={close} title={done !== null ? 'All done' : 'Delete all shop data'}>
        {done !== null ? (
          <div className="text-center py-2">
            <p className="text-3xl mb-2">✅</p>
            <p className="text-sm text-gray-700 dark:text-gray-200">{done.toLocaleString()} records were deleted. Your shop is now empty and ready to start fresh.</p>
            <div className="mt-4"><Button onClick={() => { close(); window.location.reload() }}>Close</Button></div>
          </div>
        ) : (
          <div className="text-sm">
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-3 mb-3">
              <p className="font-semibold">This cannot be undone.</p>
              <p className="text-xs mt-1">Deleted: {RESET_COLLECTIONS.map((c) => c.label).join(', ')}.</p>
              <p className="text-xs mt-1">Kept: {KEEP.join(', ')}.</p>
            </div>

            <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">Step 1: save a backup</p>
            <Button variant="secondary" onClick={downloadBackup} disabled={working}>
              <Download size={14} className="inline mr-1" /> {backedUp ? 'Download again' : 'Download backup file'}
            </Button>

            {backedUp && (
              <div className="mt-4">
                <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">Step 2: confirm</p>
                <Input label="Type DELETE ALL" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
                <Input label="Your login password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                <Button variant="danger" onClick={runReset} disabled={working || !password || confirmText.trim() !== 'DELETE ALL'}>
                  {working ? 'Deleting...' : 'Permanently delete everything'}
                </Button>
              </div>
            )}

            {status && <p className="text-xs text-gray-500 mt-3">{status}</p>}
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          </div>
        )}
      </Modal>
    </>
  )
}
