import { useEffect, useState } from 'react'
import { Search, Plus, Minus, Trash2, ShoppingCart, X, ScanLine, ClipboardCheck } from 'lucide-react'
import { collection, getDocs, addDoc, doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Button, Card, Input, Select, Modal, Badge } from '../components/ui/ui'
import BarcodeScannerModal from '../components/ui/BarcodeScannerModal'
import { formatMoney, generateSequenceNumber, logAudit } from '../utils/helpers'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import ReceiptView from './receipts/ReceiptView'

export default function Sales() {
  const { profile } = useAuth()
  const { company, template } = useSettings()
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [cart, setCart] = useState([])
  const [customers, setCustomers] = useState([])
  const [customerId, setCustomerId] = useState('')
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [discount, setDiscount] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [amountPaid, setAmountPaid] = useState('')
  const [isCredit, setIsCredit] = useState(false)
  const [notes, setNotes] = useState('')
  const [lastSale, setLastSale] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const load = async () => {
    const [pSnap, cSnap] = await Promise.all([getDocs(collection(db, 'products')), getDocs(collection(db, 'customers'))])
    setProducts(pSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.is_active !== false))
    setCustomers(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
  }
  useEffect(() => { load() }, [])

  const filteredProducts = products.filter((p) => {
    const q = search.toLowerCase()
    return !q || p.name.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)
  })

  const addToCart = (product) => {
    if (product.stock_qty <= 0) { alert('This product is out of stock.'); return }
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id)
      if (existing) {
        if (existing.qty + 1 > product.stock_qty) { alert('Not enough stock.'); return prev }
        return prev.map((i) => (i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i))
      }
      return [...prev, { product, qty: 1, rate: product.selling_price, serial: '' }]
    })
  }

  const handleScan = (code) => {
    const match = products.find((p) => p.barcode === code || p.sku === code)
    if (match) addToCart(match)
    else setSearch(code)
  }

  const updateQty = (productId, qty) => setCart((prev) => prev.map((i) => (i.product.id === productId ? { ...i, qty: Math.max(1, qty) } : i)))
  const updateRate = (productId, rate) => setCart((prev) => prev.map((i) => (i.product.id === productId ? { ...i, rate: Math.max(0, Number(rate) || 0) } : i)))
  const updateSerial = (productId, serial) => setCart((prev) => prev.map((i) => (i.product.id === productId ? { ...i, serial } : i)))
  const removeItem = (productId) => setCart((prev) => prev.filter((i) => i.product.id !== productId))

  const subtotal = cart.reduce((s, i) => s + i.rate * i.qty, 0)
  const discountAmt = Number(discount) || 0
  const total = Math.max(0, subtotal - discountAmt)
  const paid = isCredit ? Number(amountPaid) || 0 : total
  const balanceDue = Math.max(0, total - paid)

  const resetSaleForm = () => {
    setCart([]); setCustomerId(''); setDiscount('0'); setAmountPaid(''); setIsCredit(false)
    setNotes(''); setNewCustomerName(''); setNewCustomerPhone('')
  }

  const openConfirm = () => {
    if (cart.length === 0) return
    const isNewCustomer = !customerId && !!newCustomerName.trim()
    if (isCredit && !customerId && !isNewCustomer) { alert('Credit sales require a customer name and phone.'); return }
    setConfirmOpen(true)
  }

  const checkout = async () => {
    if (company.min_sale_amount > 0 && total < company.min_sale_amount) {
      const proceed = confirm(`This sale (${formatMoney(total, company.currency)}) is below your minimum sale amount of ${formatMoney(company.min_sale_amount, company.currency)}. Continue anyway?`)
      if (!proceed) return
    }
    const isNewCustomer = !customerId && !!newCustomerName.trim()
    setProcessing(true)
    try {
      let finalCustomerId = customerId || null
      let finalCustomer = customers.find((c) => c.id === customerId) || null
      if (isNewCustomer) {
        const custRef = await addDoc(collection(db, 'customers'), { name: newCustomerName.trim(), phone: newCustomerPhone.trim(), loyalty_points: 0, created_at: serverTimestamp() })
        finalCustomerId = custRef.id
        finalCustomer = { id: custRef.id, name: newCustomerName.trim(), phone: newCustomerPhone.trim() }
      }

      const receiptNumber = await generateSequenceNumber('RCT', 'sales')
      const saleData = {
        receipt_number: receiptNumber, customer_id: finalCustomerId, cashier_id: profile?.id,
        subtotal, discount: discountAmt, tax_amount: 0, total,
        amount_paid: paid, balance_due: balanceDue, payment_method: paymentMethod,
        is_credit_sale: isCredit && balanceDue > 0, status: 'completed', notes,
        created_at: serverTimestamp(),
      }

      const saleRef = doc(collection(db, 'sales'))
      await runTransaction(db, async (tx) => {
        const productRefs = cart.map((i) => doc(db, 'products', i.product.id))
        const productSnaps = await Promise.all(productRefs.map((r) => tx.get(r)))
        productSnaps.forEach((snap, idx) => {
          const current = snap.data()?.stock_qty ?? 0
          if (current < cart[idx].qty) throw new Error(`Not enough stock for ${cart[idx].product.name}`)
        })

        tx.set(saleRef, saleData)
        cart.forEach((i, idx) => {
          const itemRef = doc(collection(db, 'sales', saleRef.id, 'items'))
          tx.set(itemRef, {
            product_id: i.product.id, product_name: i.product.name, serial_number: i.serial || null,
            qty: i.qty, rate: i.rate, amount: i.rate * i.qty, cost_price: i.product.buying_price,
          })
          tx.update(productRefs[idx], { stock_qty: productSnaps[idx].data().stock_qty - i.qty })
          const movementRef = doc(collection(db, 'stockMovements'))
          tx.set(movementRef, { product_id: i.product.id, change_qty: -i.qty, reason: 'sale', reference_id: saleRef.id, created_at: serverTimestamp() })
        })

        if (saleData.is_credit_sale) {
          const debtRef = doc(collection(db, 'debts'))
          tx.set(debtRef, {
            sale_id: saleRef.id, customer_id: finalCustomerId, original_amount: total,
            amount_paid: paid, balance: balanceDue, status: 'open', created_at: serverTimestamp(),
          })
        }
      })

      if (paid > 0) {
        await addDoc(collection(db, 'payments'), { reference_type: 'sale', reference_id: saleRef.id, amount: paid, method: paymentMethod, received_by: profile?.id, created_at: serverTimestamp() })
      }
      await logAudit({ userId: profile?.id, action: 'create', entityType: 'sales', entityId: saleRef.id, newValues: { total, receipt_number: receiptNumber } })

      const items = cart.map((i) => ({ product_id: i.product.id, product_name: i.product.name, serial_number: i.serial || null, qty: i.qty, rate: i.rate, amount: i.rate * i.qty }))
      setConfirmOpen(false)
      setLastSale({ id: saleRef.id, ...saleData, created_at: new Date(), items, customer: finalCustomer })
      resetSaleForm()
      load()
    } catch (err) {
      alert('Checkout failed: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            autoFocus
            className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 text-sm"
            placeholder="Search product, scan barcode, or type SKU..."
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
          <button onClick={() => setScannerOpen(true)} className="absolute right-3 top-2.5 text-gray-400 hover:text-blue-600" title="Scan with camera">
            <ScanLine size={17} />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[65vh] overflow-y-auto scrollbar-thin pr-1">
          {filteredProducts.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              disabled={p.stock_qty <= 0}
              className="text-left bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-3 hover:border-brand disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <p className="font-medium text-sm text-gray-800 dark:text-gray-100 line-clamp-2">{p.name}</p>
              <p className="text-xs text-gray-400 mt-1">{p.brand}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm font-bold text-brand">{formatMoney(p.selling_price, company.currency)}</span>
                <Badge color={p.stock_qty === 0 ? 'red' : p.stock_qty <= 3 ? 'yellow' : 'green'}>{p.stock_qty}</Badge>
              </div>
            </button>
          ))}
        </div>
      </div>

      <Card title="Current Sale" actions={<ShoppingCart size={16} className="text-gray-400" />} className="h-fit lg:sticky lg:top-20">
        {cart.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Cart is empty. Tap a product to add it.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin mb-3">
            {cart.map((i) => {
              const canNegotiate = company.allow_price_negotiation && i.product.negotiable !== false
              return (
                <div key={i.product.id} className="border border-gray-100 dark:border-gray-800 rounded-lg p-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 flex-1 pr-2">{i.product.name}</p>
                    <button onClick={() => removeItem(i.product.id)} className="text-red-500"><X size={14} /></button>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(i.product.id, i.qty - 1)} className="p-1 rounded bg-gray-100 dark:bg-gray-800"><Minus size={12} /></button>
                      <span className="w-6 text-center text-sm">{i.qty}</span>
                      <button onClick={() => updateQty(i.product.id, i.qty + 1)} className="p-1 rounded bg-gray-100 dark:bg-gray-800"><Plus size={12} /></button>
                    </div>
                    {canNegotiate ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">@</span>
                        <input type="number" className="w-20 text-sm text-right px-1 py-0.5 rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800" value={i.rate} onChange={(e) => updateRate(i.product.id, e.target.value)} />
                      </div>
                    ) : (
                      <span className="text-sm font-semibold">{formatMoney(i.rate * i.qty, company.currency)}</span>
                    )}
                  </div>
                  {canNegotiate && i.rate !== i.product.selling_price && (
                    <p className="text-[0.7rem] text-amber-600 mt-0.5">
                      Negotiated ({i.rate < i.product.selling_price ? 'below' : 'above'} list {formatMoney(i.product.selling_price, company.currency)})
                      {i.rate < i.product.buying_price && <span className="text-red-600 font-medium"> — below cost!</span>}
                    </p>
                  )}
                  {canNegotiate && <p className="text-right text-xs text-gray-400">Line total: {formatMoney(i.rate * i.qty, company.currency)}</p>}
                  {i.product.has_serial && (
                    <input placeholder="Serial / IMEI" className="mt-1 w-full text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800" value={i.serial} onChange={(e) => updateSerial(i.product.id, e.target.value)} />
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-1 text-sm">
          <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatMoney(subtotal, company.currency)}</span></div>
          <div className="flex justify-between font-bold text-base text-gray-800 dark:text-gray-100"><span>Total</span><span>{formatMoney(total, company.currency)}</span></div>
        </div>

        <Button className="w-full mt-3" disabled={cart.length === 0} onClick={openConfirm}>
          <ClipboardCheck size={15} className="inline mr-1" /> Review &amp; Complete Sale
        </Button>
      </Card>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm Sale Details" wide>
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Fill in the customer's details for the receipt, then confirm to complete the sale.</p>

          <Select label="Returning Customer (optional)" value={customerId} onChange={(e) => {
            const id = e.target.value
            setCustomerId(id)
            const match = customers.find((c) => c.id === id)
            if (match) { setNewCustomerName(match.name || ''); setNewCustomerPhone(match.phone || '') }
          }}>
            <option value="">Walk-in / type name below</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Customer Name" value={newCustomerName} onChange={(e) => { setNewCustomerName(e.target.value); setCustomerId('') }} placeholder="For this receipt" />
            <Input label="Phone Number" value={newCustomerPhone} onChange={(e) => { setNewCustomerPhone(e.target.value); setCustomerId('') }} placeholder="e.g. 0781137391" />
          </div>
          <p className="text-xs text-gray-400 -mt-2">Printed on the receipt and saved to Customers for next time. Leave blank for an anonymous walk-in sale.</p>

          <div className="grid grid-cols-2 gap-2">
            <Input label={`Discount (${company.currency})`} type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            <Select label="Payment Method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="mtn_momo">MTN MoMo</option>
              <option value="airtel_money">Airtel Money</option>
              <option value="bank">Bank Transfer</option>
              <option value="card">Card</option>
            </Select>
          </div>

          {(paymentMethod === 'mtn_momo' || paymentMethod === 'airtel_money') && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg p-2 text-sm text-center">
              Send to <strong>{paymentMethod === 'mtn_momo' ? company.mtn_number : company.airtel_number}</strong>
              <a href={paymentMethod === 'mtn_momo' ? 'tel:*165%23' : 'tel:*185%23'} className="block text-xs text-blue-600 mt-1 underline">
                Open dialer to prompt payment on customer's phone
              </a>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isCredit} onChange={(e) => setIsCredit(e.target.checked)} />
            Credit sale (customer pays later / partially)
          </label>
          {isCredit && <Input label={`Amount Paid Now (${company.currency})`} type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />}

          <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatMoney(subtotal, company.currency)}</span></div>
            {discountAmt > 0 && <div className="flex justify-between text-gray-500"><span>Discount</span><span>-{formatMoney(discountAmt, company.currency)}</span></div>}
            <div className="flex justify-between font-bold text-base text-gray-800 dark:text-gray-100"><span>Total</span><span>{formatMoney(total, company.currency)}</span></div>
            {isCredit && <div className="flex justify-between text-red-500 font-medium"><span>Balance Due</span><span>{formatMoney(balanceDue, company.currency)}</span></div>}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Back to Cart</Button>
            <Button onClick={checkout} disabled={processing}>{processing ? 'Processing...' : `Confirm & Charge ${formatMoney(total, company.currency)}`}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!lastSale} onClose={() => setLastSale(null)} title="Sale Complete" wide>
        {lastSale && <ReceiptView sale={lastSale} items={lastSale.items} customer={lastSale.customer} template={template} onClose={() => setLastSale(null)} />}
      </Modal>

      <BarcodeScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={handleScan} />
    </div>
  )
}
