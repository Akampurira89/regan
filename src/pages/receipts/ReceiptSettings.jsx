import { useState } from 'react'
import { useSettings } from '../../context/SettingsContext'
import { Card, Input, Textarea, Select, Checkbox, Button } from '../../components/ui/ui'
import ReceiptView from './ReceiptView'

const SAMPLE_SALE = {
  receipt_number: 'RCT-20260710-0001', total: 185000, subtotal: 190000, discount: 5000,
  tax_amount: 0, balance_due: 0, payment_method: 'cash', created_at: new Date(),
}
const SAMPLE_ITEMS = [
  { qty: 1, product_name: 'Samsung A15 Charger', rate: 35000, amount: 35000, serial_number: '' },
  { qty: 1, product_name: 'iPhone 12 Screen Protector', rate: 15000, amount: 15000, serial_number: 'SN-88213' },
  { qty: 1, product_name: 'JBL Bluetooth Speaker', rate: 140000, amount: 140000, serial_number: '' },
]

export default function ReceiptSettings() {
  const { template, saveTemplate } = useSettings()
  const [form, setForm] = useState(template)
  const [saving, setSaving] = useState(false)

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const setCol = (key, value) => setForm((f) => ({ ...f, column_headings: { ...f.column_headings, [key]: value } }))

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try { await saveTemplate(form) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Receipt Template</h1>
        <p className="text-sm text-gray-400">Customize how printed receipts look for Eddy K. Electronics.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Header">
          <form onSubmit={submit}>
            <Input label="Shop Name" value={form.shop_name} onChange={(e) => set('shop_name', e.target.value)} />
            <Input label="Logo URL" value={form.logo_url || ''} onChange={(e) => set('logo_url', e.target.value)} placeholder="https://..." />
            <Input label="Address" value={form.address || ''} onChange={(e) => set('address', e.target.value)} />
            <Input label="Town" value={form.town || ''} onChange={(e) => set('town', e.target.value)} />
            <Input label="P.O Box" value={form.po_box || ''} onChange={(e) => set('po_box', e.target.value)} placeholder="e.g. Mbarara" />
            <Input label="Email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
            <Input label="Phone Numbers" value={form.phone_numbers || ''} onChange={(e) => set('phone_numbers', e.target.value)} placeholder="0700 000 000 / 0770 000 000" />
            <Input label="Dealers In (line)" value={form.dealers_line || ''} onChange={(e) => set('dealers_line', e.target.value)} />
            <Input label="Receipt Title" value={form.receipt_title || ''} onChange={(e) => set('receipt_title', e.target.value)} />
            <Input label="Customer Contact Label" value={form.customer_contact_label || ''} onChange={(e) => set('customer_contact_label', e.target.value)} placeholder="e.g. M/S" />
            <Textarea label="Footer Note" value={form.footer_note || ''} onChange={(e) => set('footer_note', e.target.value)} />
            <Checkbox label="Show blank 'Customer's Contact ....' line in footer" checked={form.show_footer_contact_line} onChange={(e) => set('show_footer_contact_line', e.target.checked)} />
            <Textarea label="Return Policy Text" value={form.return_policy_text || ''} onChange={(e) => set('return_policy_text', e.target.value)} />

            <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mt-2 mb-1">Column Headings</p>
            <div className="grid grid-cols-2 gap-x-3">
              <Input label="Qty column" value={form.column_headings?.qty || ''} onChange={(e) => setCol('qty', e.target.value)} />
              <Input label="Particulars column" value={form.column_headings?.particulars || ''} onChange={(e) => setCol('particulars', e.target.value)} />
              <Input label="Rate column" value={form.column_headings?.rate || ''} onChange={(e) => setCol('rate', e.target.value)} />
              <Input label="Amount column" value={form.column_headings?.amount || ''} onChange={(e) => setCol('amount', e.target.value)} />
            </div>

            <Select label="Receipt Size / Print Layout" value={form.receipt_size} onChange={(e) => set('receipt_size', e.target.value)}>
              <option value="80mm">80mm Thermal</option>
              <option value="58mm">58mm Thermal</option>
              <option value="A5">A5</option>
              <option value="A4">A4</option>
            </Select>

            <div className="grid grid-cols-2">
              <Checkbox label="Show discount" checked={form.show_discount} onChange={(e) => set('show_discount', e.target.checked)} />
              <Checkbox label="Show cashier" checked={form.show_cashier} onChange={(e) => set('show_cashier', e.target.checked)} />
              <Checkbox label="Show payment method" checked={form.show_payment_method} onChange={(e) => set('show_payment_method', e.target.checked)} />
              <Checkbox label="Show serial number" checked={form.show_serial_number} onChange={(e) => set('show_serial_number', e.target.checked)} />
              <Checkbox label="Show warranty note" checked={form.show_warranty_note} onChange={(e) => set('show_warranty_note', e.target.checked)} />
            </div>

            <Button type="submit" className="mt-2" disabled={saving}>{saving ? 'Saving...' : 'Save Receipt Template'}</Button>
          </form>
        </Card>

        <Card title="Live Preview">
          <ReceiptView sale={SAMPLE_SALE} items={SAMPLE_ITEMS} customer={{ name: 'John Okello', phone: '0700123456' }} template={form} />
        </Card>
      </div>
    </div>
  )
}
