import { useEffect, useState } from 'react'
import { Plus, UserMinus, Wallet, History } from 'lucide-react'
import { collection, getDocs, addDoc, updateDoc, doc, runTransaction, serverTimestamp, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Card, Input, Select, Checkbox, Button, Modal, EmptyState, Badge, Textarea } from '../components/ui/ui'
import { useSettings } from '../context/SettingsContext'
import { formatMoney, formatDate, logAudit } from '../utils/helpers'
import { useAuth } from '../context/AuthContext'

export default function Settings() {
  const { profile } = useAuth()
  const { company, saveCompany } = useSettings()
  const [form, setForm] = useState(company)
  const [saving, setSaving] = useState(false)
  const [expenses, setExpenses] = useState([])
  const [expenseCategories, setExpenseCategories] = useState([])
  const [expModal, setExpModal] = useState(false)
  const [expForm, setExpForm] = useState({ category_id: '', amount: '', description: '', expense_date: new Date().toISOString().slice(0, 10) })
  const [payables, setPayables] = useState([])
  const [payableModalOpen, setPayableModalOpen] = useState(false)
  const [payableForm, setPayableForm] = useState({ person_name: '', phone: '', amount: '', reason: '' })
  const [payModal, setPayModal] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [historyFor, setHistoryFor] = useState(null)
  const [payableHistory, setPayableHistory] = useState([])

  const viewPayableHistory = async (payable) => {
    setHistoryFor(payable)
    const snap = await getDocs(query(collection(db, 'payments'), where('reference_type', '==', 'personal_payable'), where('reference_id', '==', payable.id)))
    setPayableHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0)))
  }

  const loadPayables = async () => {
    const snap = await getDocs(collection(db, 'personalPayables'))
    setPayables(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.balance > 0).sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0)))
  }
  useEffect(() => { loadPayables() }, [])

  const addPayable = async (e) => {
    e.preventDefault()
    const amount = Number(payableForm.amount)
    if (!amount) return
    const payload = { person_name: payableForm.person_name, phone: payableForm.phone, reason: payableForm.reason, original_amount: amount, balance: amount, created_at: serverTimestamp() }
    const ref = await addDoc(collection(db, 'personalPayables'), payload)
    await logAudit({ userId: profile?.id, action: 'create', entityType: 'personalPayables', entityId: ref.id, newValues: payload })
    setPayableModalOpen(false); setPayableForm({ person_name: '', phone: '', amount: '', reason: '' })
    loadPayables()
  }

  const recordPayablePayment = async (e) => {
    e.preventDefault()
    const amount = Number(payAmount)
    if (!amount || amount <= 0) return
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'personalPayables', payModal.id)
        const snap = await tx.get(ref)
        const currentBalance = snap.data()?.balance || 0
        tx.update(ref, { balance: Math.max(0, currentBalance - amount) })
      })
      // Kept separate from the 'expenses' collection on purpose — this is a personal debt
      // repayment, not a business expense category, so it won't skew your expense reports.
      await addDoc(collection(db, 'payments'), { reference_type: 'personal_payable', reference_id: payModal.id, amount, method: 'cash', received_by: profile?.id, created_at: serverTimestamp() })
      await logAudit({ userId: profile?.id, action: 'payment', entityType: 'personalPayables', entityId: payModal.id, newValues: { amount } })
      setPayModal(null); setPayAmount('')
      loadPayables()
    } catch (err) {
      alert('Could not record payment: ' + err.message)
    }
  }

  useEffect(() => { setForm(company) }, [company])

  const loadExpenses = async () => {
    const [eSnap, cSnap] = await Promise.all([getDocs(collection(db, 'expenses')), getDocs(collection(db, 'expenseCategories'))])
    const catMap = Object.fromEntries(cSnap.docs.map((d) => [d.id, d.data().name]))
    setExpenses(eSnap.docs.map((d) => ({ id: d.id, ...d.data(), categoryName: catMap[d.data().category_id] })).sort((a, b) => (b.expense_date || '').localeCompare(a.expense_date || '')).slice(0, 20))
    setExpenseCategories(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
  }
  useEffect(() => { loadExpenses() }, [])

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try { await saveCompany(form) } finally { setSaving(false) }
  }

  const saveExpense = async (e) => {
    e.preventDefault()
    const ref = await addDoc(collection(db, 'expenses'), { ...expForm, amount: Number(expForm.amount), paid_by: profile?.id, created_at: serverTimestamp() })
    await logAudit({ userId: profile?.id, action: 'create', entityType: 'expenses', entityId: ref.id, newValues: expForm })
    setExpModal(false)
    setExpForm({ category_id: '', amount: '', description: '', expense_date: new Date().toISOString().slice(0, 10) })
    loadExpenses()
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Settings</h1>
        <p className="text-sm text-gray-400">Currency and business preferences. For receipt design, see "Receipt Template" in the sidebar.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Business Settings">
          <form onSubmit={submit}>
            <Select label="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option value="UGX">UGX - Ugandan Shilling</option>
              <option value="KES">KES - Kenyan Shilling</option>
              <option value="USD">USD - US Dollar</option>
              <option value="TZS">TZS - Tanzanian Shilling</option>
            </Select>
            <Checkbox label="Enable multi-branch mode" checked={form.multi_branch} onChange={(e) => setForm({ ...form, multi_branch: e.target.checked })} />
            <Input label="Default Low Stock Threshold" type="number" value={form.low_stock_default} onChange={(e) => setForm({ ...form, low_stock_default: Number(e.target.value) })} />

            <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mt-3 mb-1">Mobile Money Numbers</p>
            <Input label="MTN MoMo Number" value={form.mtn_number || ''} onChange={(e) => setForm({ ...form, mtn_number: e.target.value })} placeholder="e.g. 0781137391" />
            <Input label="Airtel Money Number" value={form.airtel_number || ''} onChange={(e) => setForm({ ...form, airtel_number: e.target.value })} placeholder="e.g. 0743111076" />
            <p className="text-xs text-gray-400 -mt-2 mb-3">Shown at checkout so cashiers can tell customers where to send payment.</p>

            <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mt-3 mb-1">Pricing Rules</p>
            <Checkbox label="Allow cashiers to negotiate / edit item price at checkout" checked={form.allow_price_negotiation} onChange={(e) => setForm({ ...form, allow_price_negotiation: e.target.checked })} />
            <Input label={`Minimum Sale Amount (${form.currency || 'UGX'}) — 0 disables this check`} type="number" value={form.min_sale_amount ?? 0} onChange={(e) => setForm({ ...form, min_sale_amount: Number(e.target.value) })} />
            <p className="text-xs text-gray-400 -mt-2 mb-3">If set above 0, the POS warns before completing a sale below this total.</p>

            <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mt-3 mb-1">Look & Feel</p>
            <label className="block text-sm mb-3">
              <span className="block mb-1 text-gray-600 dark:text-gray-300 font-medium">Accent Color</span>
              <div className="flex items-center gap-2">
                <input type="color" value={form.accent_color || '#c2410c'} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} className="w-10 h-10 rounded cursor-pointer border border-gray-300 dark:border-gray-700" />
                <span className="text-xs text-gray-400">Used for buttons, active menu highlight, and totals throughout the app.</span>
              </div>
            </label>

            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</Button>
          </form>
        </Card>

        <Card title="Expense Tracking" actions={<Button onClick={() => setExpModal(true)}><Plus size={14} className="inline mr-1" />Add Expense</Button>}>
          {expenses.length === 0 ? <EmptyState message="No expenses recorded." /> : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-80 overflow-y-auto scrollbar-thin">
              {expenses.map((e) => (
                <div key={e.id} className="flex justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium">{e.categoryName}</p>
                    <p className="text-xs text-gray-400">{e.description} · {formatDate(e.expense_date)}</p>
                  </div>
                  <span className="font-semibold text-red-600">-{formatMoney(e.amount, company.currency)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="People You Owe" actions={<Button onClick={() => setPayableModalOpen(true)}><Plus size={14} className="inline mr-1" />Add Debt</Button>}>
          <p className="text-xs text-gray-400 -mt-1 mb-2">Personal debts — money you owe individuals, kept separate from supplier balances and expense categories.</p>
          {payables.length === 0 ? <EmptyState message="You don't owe anyone right now." /> : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-80 overflow-y-auto scrollbar-thin">
              {payables.map((p) => (
                <div key={p.id} className="flex justify-between items-center py-2 text-sm">
                  <div>
                    <p className="font-medium">{p.person_name}</p>
                    <p className="text-xs text-gray-400">{p.reason} {p.phone ? `· ${p.phone}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge color="red">{formatMoney(p.balance, company.currency)}</Badge>
                    <button onClick={() => viewPayableHistory(p)} title="Payment history" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"><History size={15} /></button>
                    <button onClick={() => setPayModal(p)} title="Pay them" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-emerald-600"><Wallet size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Modal open={expModal} onClose={() => setExpModal(false)} title="Add Expense">
        <form onSubmit={saveExpense}>
          <Select label="Category *" required value={expForm.category_id} onChange={(e) => setExpForm({ ...expForm, category_id: e.target.value })}>
            <option value="">Select category</option>
            {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input label="Amount *" type="number" required value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} />
          <Input label="Description" value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} />
          <Input label="Date" type="date" value={expForm.expense_date} onChange={(e) => setExpForm({ ...expForm, expense_date: e.target.value })} />
          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="secondary" onClick={() => setExpModal(false)}>Cancel</Button>
            <Button type="submit">Save Expense</Button>
          </div>
        </form>
      </Modal>

      <Modal open={payableModalOpen} onClose={() => setPayableModalOpen(false)} title="Add a Personal Debt">
        <form onSubmit={addPayable}>
          <Input label="Person's Name *" required value={payableForm.person_name} onChange={(e) => setPayableForm({ ...payableForm, person_name: e.target.value })} />
          <Input label="Phone" value={payableForm.phone} onChange={(e) => setPayableForm({ ...payableForm, phone: e.target.value })} />
          <Input label={`Amount You Owe (${company.currency}) *`} type="number" required value={payableForm.amount} onChange={(e) => setPayableForm({ ...payableForm, amount: e.target.value })} />
          <Textarea label="What's it for?" value={payableForm.reason} onChange={(e) => setPayableForm({ ...payableForm, reason: e.target.value })} placeholder="e.g. Borrowed capital, personal loan..." />
          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="secondary" onClick={() => setPayableModalOpen(false)}>Cancel</Button>
            <Button type="submit"><UserMinus size={14} className="inline mr-1" />Add Debt</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!payModal} onClose={() => setPayModal(null)} title={`Pay ${payModal?.person_name || ''}`}>
        <form onSubmit={recordPayablePayment}>
          <p className="text-sm text-gray-500 mb-3">Balance owed: <strong>{formatMoney(payModal?.balance, company.currency)}</strong></p>
          <Input label="Amount Paying *" type="number" required value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="secondary" onClick={() => setPayModal(null)}>Cancel</Button>
            <Button type="submit">Save Payment</Button>
          </div>
        </form>
      </Modal>
      <Modal open={!!historyFor} onClose={() => setHistoryFor(null)} title={`Payment History: ${historyFor?.person_name || ''}`}>
        <p className="text-sm text-gray-500 mb-3">
          Originally owed: <strong>{formatMoney(historyFor?.original_amount, company.currency)}</strong> · Still owe: <strong>{formatMoney(historyFor?.balance, company.currency)}</strong>
        </p>
        {payableHistory.length === 0 ? <EmptyState message="No payments recorded yet." /> : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {payableHistory.map((h) => (
              <div key={h.id} className="flex justify-between py-2 text-sm">
                <span className="text-gray-500">{formatDate(h.created_at)}</span>
                <span className="font-medium text-emerald-600">-{formatMoney(h.amount, company.currency)}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
