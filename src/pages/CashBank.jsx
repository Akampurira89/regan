import { useEffect, useState } from 'react'
import { Plus, Landmark, Wallet, ArrowRightLeft } from 'lucide-react'
import { collection, getDocs, addDoc, query, orderBy, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Card, Button, Input, Select, Textarea, Modal, EmptyState, StatCard } from '../components/ui/ui'
import { formatMoney, formatDate, logAudit } from '../utils/helpers'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'

const empty = { direction: 'to_bank', amount: '', note: '' }

export default function CashBank() {
  const { profile } = useAuth()
  const { company, saveCompany } = useSettings()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [openingModalOpen, setOpeningModalOpen] = useState(false)
  const [openingCash, setOpeningCash] = useState('')
  const [openingBank, setOpeningBank] = useState('')

  const load = async () => {
    setLoading(true)
    const snap = await getDocs(query(collection(db, 'cashBankLedger'), orderBy('created_at', 'desc')))
    setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const movedToBank = entries.filter((e) => e.direction === 'to_bank').reduce((s, e) => s + Number(e.amount), 0)
  const movedToCash = entries.filter((e) => e.direction === 'to_cash').reduce((s, e) => s + Number(e.amount), 0)
  const openingCashBal = Number(company.opening_cash_balance || 0)
  const openingBankBal = Number(company.opening_bank_balance || 0)
  const cashBalance = openingCashBal - movedToBank + movedToCash
  const bankBalance = openingBankBal + movedToBank - movedToCash

  const save = async (e) => {
    e.preventDefault()
    const amount = Number(form.amount)
    if (!amount || amount <= 0) return
    const payload = { direction: form.direction, amount, note: form.note, created_by: profile?.id, created_at: serverTimestamp() }
    const ref = await addDoc(collection(db, 'cashBankLedger'), payload)
    await logAudit({ userId: profile?.id, action: 'create', entityType: 'cashBankLedger', entityId: ref.id, newValues: payload })
    setModalOpen(false); setForm(empty)
    load()
  }

  const saveOpening = async (e) => {
    e.preventDefault()
    await saveCompany({ opening_cash_balance: Number(openingCash) || 0, opening_bank_balance: Number(openingBank) || 0 })
    setOpeningModalOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Cash &amp; Bank</h1>
          <p className="text-sm text-gray-400">Track money you move between cash-on-hand and the bank — useful when banking cash to make a repayment.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => { setOpeningCash(String(openingCashBal)); setOpeningBank(String(openingBankBal)); setOpeningModalOpen(true) }}>Set Opening Balances</Button>
          <Button onClick={() => setModalOpen(true)}><Plus size={15} className="inline mr-1" /> Move Money</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Cash on Hand" value={formatMoney(cashBalance, company.currency)} icon={Wallet} color="green" />
        <StatCard label="Bank Balance" value={formatMoney(bankBalance, company.currency)} icon={Landmark} color="blue" />
      </div>

      <p className="text-xs text-gray-400 -mt-2">
        These balances only reflect opening balances plus transfers logged here — they don't automatically pull in every sale or expense payment method. Set your real starting balances above, then log transfers as you make them.
      </p>

      <Card title="Transfer History">
        {loading ? <p className="text-sm text-gray-400">Loading...</p> : entries.length === 0 ? <EmptyState message="No transfers logged yet." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="py-2">Date</th><th className="py-2">Direction</th><th className="py-2">Amount</th><th className="py-2">Note</th>
              </tr></thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-gray-50 dark:border-gray-800/50">
                    <td className="py-2 text-gray-500">{formatDate(e.created_at)}</td>
                    <td className="py-2">
                      <span className="inline-flex items-center gap-1 text-xs font-medium">
                        <ArrowRightLeft size={12} />
                        {e.direction === 'to_bank' ? 'Cash → Bank' : 'Bank → Cash'}
                      </span>
                    </td>
                    <td className="py-2 font-medium">{formatMoney(e.amount, company.currency)}</td>
                    <td className="py-2 text-gray-500">{e.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Move Money">
        <form onSubmit={save}>
          <Select label="Direction" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
            <option value="to_bank">Cash → Bank (banking money)</option>
            <option value="to_cash">Bank → Cash (withdrawal)</option>
          </Select>
          <Input label={`Amount (${company.currency}) *`} type="number" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <Textarea label="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Banking money to repay Kato for the TV" />
          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save Transfer</Button>
          </div>
        </form>
      </Modal>

      <Modal open={openingModalOpen} onClose={() => setOpeningModalOpen(false)} title="Set Opening Balances">
        <form onSubmit={saveOpening}>
          <p className="text-sm text-gray-500 mb-3">Set these once to match what you actually have right now — the running balances above will build from here.</p>
          <Input label={`Current Cash on Hand (${company.currency})`} type="number" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} />
          <Input label={`Current Bank Balance (${company.currency})`} type="number" value={openingBank} onChange={(e) => setOpeningBank(e.target.value)} />
          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="secondary" onClick={() => setOpeningModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
