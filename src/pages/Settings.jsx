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
        <p className="text-sm text-gray-400">Currency, tax, and business preferences. For receipt design, see "Receipt Template" in the sidebar.</p>
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
            <Checkbox label="Enable tax calculation on sales" checked={form.tax_enabled} onChange={(e) => setForm({ ...form, tax_enabled: e.target.checked })} />
            <Checkbox label="Enable multi-branch mode" checked={form.multi_branch} onChange={(e) => setForm({ ...form, multi_branch: e.target.checked })} />
            <Input label="Default Low Stock Threshold" type="number" value={form.low_stock_default} onChange={(e) => setForm({ ...form, low_stock_default: Number(e.target.value) })} />
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
