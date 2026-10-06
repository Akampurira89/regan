import { useEffect, useRef, useState } from 'react'
import { CreditCard, MessageCircle, Send } from 'lucide-react'
import { collection, getDocs, doc, query, where, serverTimestamp, runTransaction } from 'firebase/firestore'
import { db, tPath } from '../lib/firebase'
import { Card, Button, Input, Select, Modal, EmptyState, Badge } from '../components/ui/ui'
import { formatMoney, formatDate, daysBetween, logAudit } from '../utils/helpers'
import { openWhatsApp, debtReminderMessage, sendSMS, smsConfigured } from '../utils/notifications'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'

export default function Debts() {
  const { profile } = useAuth()
  const { company, template } = useSettings()
  const [debts, setDebts] = useState([])
  const [payModal, setPayModal] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const payingRef = useRef(false)

  const load = async () => {
    setLoading(true)
    const [dSnap, cSnap, sSnap] = await Promise.all([
      getDocs(query(collection(db, ...tPath('debts')), where('status', '!=', 'paid'))),
      getDocs(collection(db, ...tPath('customers'))),
      getDocs(collection(db, ...tPath('sales'))),
    ])
    const customerMap = Object.fromEntries(cSnap.docs.map((d) => [d.id, d.data()]))
    const saleMap = Object.fromEntries(sSnap.docs.map((d) => [d.id, d.data()]))
    setDebts(dSnap.docs.map((d) => {
      const data = d.data()
      return { id: d.id, ...data, customer: customerMap[data.customer_id], receiptNumber: saleMap[data.sale_id]?.receipt_number }
    }).sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0)))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const totalOutstanding = debts.reduce((s, d) => s + Number(d.balance), 0)

  const recordPayment = async (e) => {
    e.preventDefault()
    if (payingRef.current) return // blocks double-taps instantly
    const amount = Number(payAmount)
    if (!amount || amount <= 0) return
    if (!navigator.onLine) { alert('No internet connection. This needs internet so stock and balances stay exact. Please reconnect and try again.'); return }
    const debt = payModal
    payingRef.current = true
    setPaying(true)
    try {
      // Re-reads the CURRENT debt inside the transaction, so a repeat tap or a
      // second device can never double-count or overpay. Debt, the linked sale
      // and the payment record are saved together.
      await runTransaction(db, async (tx) => {
        const debtRef = doc(db, ...tPath('debts', debt.id))
        const debtSnap = await tx.get(debtRef)
        if (!debtSnap.exists()) throw new Error('This debt no longer exists.')
        const d = debtSnap.data()
        const balance = Number(d.balance) || 0
        if (amount > balance) throw new Error(`Amount is more than the balance due (${formatMoney(balance, company.currency)}).`)
        const saleRef = d.sale_id ? doc(db, ...tPath('sales', d.sale_id)) : null
        const saleSnap = saleRef ? await tx.get(saleRef) : null

        const newPaid = (Number(d.amount_paid) || 0) + amount
        const newBalance = balance - amount
        tx.update(debtRef, { amount_paid: newPaid, balance: newBalance, status: newBalance === 0 ? 'paid' : 'partially_paid' })
        if (saleSnap?.exists()) {
          const sd = saleSnap.data()
          tx.update(saleRef, { amount_paid: (Number(sd.amount_paid) || 0) + amount, balance_due: Math.max(0, (Number(sd.balance_due) || 0) - amount) })
        }
        const payRef = doc(collection(db, ...tPath('payments')))
        tx.set(payRef, { reference_type: 'debt', reference_id: debt.id, amount, method: payMethod, received_by: profile?.id ?? null, created_at: serverTimestamp() })
      })
      await logAudit({ userId: profile?.id, action: 'payment', entityType: 'debts', entityId: debt.id, newValues: { amount } })
      setPayModal(null); setPayAmount('')
      load()
    } catch (err) {
      alert('Could not record payment: ' + err.message)
    } finally {
      payingRef.current = false
      setPaying(false)
    }
  }

  const remind = async (debt, via) => {
    const msg = debtReminderMessage({ shopName: template.shop_name, customerName: debt.customer?.name, balance: debt.balance, currency: company.currency, dueDate: debt.due_date })
    if (via === 'whatsapp') {
      if (!debt.customer?.phone) { alert('No phone number on file for this customer.'); return }
      openWhatsApp(debt.customer.phone, msg)
    } else {
      if (!smsConfigured) { alert('SMS is not configured yet. Add VITE_SMS_API_URL / VITE_SMS_API_KEY to .env (see README) or use WhatsApp instead.'); return }
      const res = await sendSMS(debt.customer?.phone, msg)
      alert(res.ok ? 'SMS sent.' : 'SMS failed to send.')
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Debts / Credit Sales</h1>
        <p className="text-sm text-gray-400">Outstanding: <strong>{formatMoney(totalOutstanding, company.currency)}</strong></p>
      </div>

      <Card>
        {loading ? <p className="text-sm text-gray-400">Loading...</p> : debts.length === 0 ? <EmptyState message="No outstanding debts." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="py-2">Customer</th><th className="py-2">Receipt</th><th className="py-2">Original</th><th className="py-2">Balance</th><th className="py-2">Age</th><th className="py-2 text-right">Action</th>
              </tr></thead>
              <tbody>
                {debts.map((d) => {
                  const age = daysBetween(d.created_at, new Date())
                  return (
                    <tr key={d.id} className="border-b border-gray-50 dark:border-gray-800/50">
                      <td className="py-2 font-medium">{d.customer?.name}<div className="text-xs text-gray-400">{d.customer?.phone}</div></td>
                      <td className="py-2 text-gray-500">{d.receiptNumber}</td>
                      <td className="py-2">{formatMoney(d.original_amount, company.currency)}</td>
                      <td className="py-2 font-semibold text-red-600">{formatMoney(d.balance, company.currency)}</td>
                      <td className="py-2"><Badge color={age > 30 ? 'red' : age > 14 ? 'yellow' : 'gray'}>{age}d</Badge></td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => remind(d, 'whatsapp')} title="Remind via WhatsApp" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-emerald-600"><MessageCircle size={15} /></button>
                          <button onClick={() => remind(d, 'sms')} title="Remind via SMS" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-blue-600"><Send size={15} /></button>
                          <Button variant="secondary" onClick={() => setPayModal(d)}><CreditCard size={14} className="inline mr-1" />Payment</Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!payModal} onClose={() => setPayModal(null)} title={`Record Payment: ${payModal?.customer?.name || ''}`}>
        <form onSubmit={recordPayment}>
          <p className="text-sm text-gray-500 mb-3">Balance due: <strong>{formatMoney(payModal?.balance, company.currency)}</strong></p>
          <Input label="Amount Received" type="number" required min="1" max={payModal?.balance || undefined} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          <Select label="Payment Method" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="mtn_momo">MTN MoMo</option>
            <option value="airtel_money">Airtel Money</option>
            <option value="bank">Bank Transfer</option>
          </Select>
          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="secondary" onClick={() => setPayModal(null)}>Cancel</Button>
            <Button type="submit" disabled={paying}>{paying ? 'Saving...' : 'Save Payment'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
