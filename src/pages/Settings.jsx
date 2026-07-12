import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Card, Input, Select, Checkbox, Button, Modal, EmptyState } from '../components/ui/ui'
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
                <input type="color" value={form.accent_color || '#1d4ed8'} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} className="w-10 h-10 rounded cursor-pointer border border-gray-300 dark:border-gray-700" />
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
    </div>
  )
}
