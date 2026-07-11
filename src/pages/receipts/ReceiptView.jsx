import { useRef, useState } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Printer, Download, MessageCircle, Bluetooth } from 'lucide-react'
import { Button } from '../../components/ui/ui'
import { formatMoney, formatDate } from '../../utils/helpers'
import { openWhatsApp, receiptWhatsAppMessage } from '../../utils/notifications'
import { printReceiptViaBluetooth, bluetoothPrintingSupported } from '../../utils/thermalPrint'

// Renders a single receipt in the exact Eddy K. Electronics paper-receipt layout:
// shop header (left) + P.O Box (right), boxed "RECEIPT" title, No./Date line,
// "M/S" customer line, Qty/Particulars/Rate/Amount table, E&OE + Total row,
// and the "Once goods sold are not returnable" / "Customer's Contact" footer.
export default function ReceiptView({ sale, items, customer, template, onClose }) {
  const printRef = useRef(null)
  const sizeClass = {
    '80mm': 'receipt-80mm', '58mm': 'receipt-58mm', A5: 'receipt-a5', A4: 'receipt-a4',
  }[template.receipt_size] || 'receipt-80mm'

  const cols = template.column_headings || { qty: 'Qty', particulars: 'Particulars', rate: 'Rate', amount: 'Amount' }
  const [btPrinting, setBtPrinting] = useState(false)

  const handlePrint = () => window.print()

  const handleWhatsApp = () => {
    if (!customer?.phone) { alert('This customer has no phone number on file.'); return }
    const msg = receiptWhatsAppMessage({
      shopName: template.shop_name, receiptNumber: sale.receipt_number, total: sale.total,
      currency: 'UGX', itemsSummary: (items || []).map((i) => `${i.qty}x ${i.product_name}`).join(', '),
    })
    openWhatsApp(customer.phone, msg)
  }

  const handleBluetoothPrint = async () => {
    setBtPrinting(true)
    try {
      await printReceiptViaBluetooth({ template, sale, items, customer })
    } catch (e) {
      alert('Bluetooth printing failed: ' + e.message)
    } finally {
      setBtPrinting(false)
    }
  }

  const handleDownloadPDF = () => {
    const doc = new jsPDF({ unit: 'mm', format: template.receipt_size === 'A4' ? 'a4' : template.receipt_size === 'A5' ? 'a5' : [80, 200] })
    let y = 8
    doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.text(template.shop_name, 5, y); doc.setFont(undefined, 'normal'); y += 5
    doc.setFontSize(8)
    if (template.address) { doc.text(template.address, 5, y); y += 4 }
    if (template.dealers_line) { doc.text(template.dealers_line, 5, y, { maxWidth: 70 }); y += 8 }
    if (template.email) { doc.text(`Email: ${template.email}`, 5, y); y += 4 }
    if (template.phone_numbers) { doc.text(`Tel: ${template.phone_numbers}`, 5, y); y += 4 }
    if (template.po_box) { doc.text(`P.O Box ${template.po_box}`, 5, y); y += 4 }
    doc.setFontSize(9); doc.text(`[ ${template.receipt_title} ]`, 5, y); y += 5
    doc.setFontSize(8)
    doc.text(`No.: ${sale.receipt_number}`, 5, y); doc.text(`Date: ${formatDate(sale.created_at || new Date())}`, 40, y); y += 4
    doc.text(`${template.customer_contact_label}: ${customer?.name || 'Walk-in'} ${customer?.phone || ''}`, 5, y); y += 6

    autoTable(doc, {
      startY: y,
      head: [[cols.qty, cols.particulars, cols.rate, cols.amount]],
      body: (items || []).map((i) => [i.qty, i.product_name + (i.serial_number ? `\nSN: ${i.serial_number}` : ''), formatMoney(i.rate), formatMoney(i.amount)]),
      styles: { fontSize: 7 },
      margin: { left: 5, right: 5 },
    })
    let finalY = doc.lastAutoTable.finalY + 4
    doc.setFontSize(9); doc.setFont(undefined, 'bold')
    doc.text(`E&OE`, 5, finalY)
    doc.text(`TOTAL: ${formatMoney(sale.total)}`, 40, finalY); doc.setFont(undefined, 'normal'); finalY += 6
    doc.setFontSize(7)
    if (template.footer_note) { doc.text(template.footer_note, 5, finalY, { maxWidth: 70 }); finalY += 4 }
    if (template.show_footer_contact_line) doc.text("Customer's Contact.........................", 5, finalY)
    doc.save(`${sale.receipt_number}.pdf`)
  }

  return (
    <div>
      <div className="flex gap-2 mb-3 no-print">
        <Button onClick={handlePrint}><Printer size={15} className="inline mr-1" /> Print</Button>
        <Button variant="secondary" onClick={handleDownloadPDF}><Download size={15} className="inline mr-1" /> Download PDF</Button>
        {customer?.phone && (
          <Button variant="success" onClick={handleWhatsApp}><MessageCircle size={15} className="inline mr-1" /> Send via WhatsApp</Button>
        )}
        {bluetoothPrintingSupported && (
          <Button variant="secondary" onClick={handleBluetoothPrint} disabled={btPrinting}>
            <Bluetooth size={15} className="inline mr-1" /> {btPrinting ? 'Printing...' : 'Print via Bluetooth'}
          </Button>
        )}
        {onClose && <Button variant="ghost" onClick={onClose}>Close</Button>}
      </div>

      {/* On-screen preview */}
      <div className={`mx-auto border border-dashed border-gray-300 dark:border-gray-700 p-4 bg-white text-black ${sizeClass}`}>
        <ReceiptContent sale={sale} items={items} customer={customer} template={template} cols={cols} />
      </div>

      {/* Hidden print-only version */}
      <div className="receipt-print-area" ref={printRef}>
        <div className={`mx-auto p-2 bg-white text-black ${sizeClass}`}>
          <ReceiptContent sale={sale} items={items} customer={customer} template={template} cols={cols} />
        </div>
      </div>
    </div>
  )
}

function ReceiptContent({ sale, items, customer, template, cols }) {
  return (
    <div className="font-serif">
      {/* Header: shop details left, P.O Box right — matches the printed receipt book */}
      <div className="flex justify-between items-start gap-2 mb-2">
        <div>
          {template.logo_url && <img src={template.logo_url} alt="logo" className="h-8 mb-1 object-contain" />}
          <p className="font-bold text-lg leading-tight tracking-wide">{template.shop_name}</p>
          {template.address && <p className="text-sm">{template.address}</p>}
          {template.dealers_line && <p className="text-[0.85em]">{template.dealers_line}</p>}
          {template.email && <p className="text-[0.85em]">Email: {template.email}</p>}
          {template.phone_numbers && <p className="text-[0.85em]">Tel: {template.phone_numbers}</p>}
        </div>
        {(template.po_box || template.town) && (
          <div className="text-right text-[0.85em] whitespace-nowrap">
            {template.po_box && <p>P.O Box</p>}
            {template.town && <p>{template.town}</p>}
          </div>
        )}
      </div>

      <div className="text-center my-2">
        <span className="inline-block border-2 border-black font-bold px-6 py-0.5">{template.receipt_title}</span>
      </div>

      <div className="flex justify-between text-sm mb-1">
        <span><strong>No.</strong> {sale.receipt_number}</span>
        <span><strong>Date:</strong> {formatDate(sale.created_at || new Date())}</span>
      </div>
      <div className="text-sm border-b border-dotted border-black pb-1 mb-2">
        <strong>{template.customer_contact_label || 'M/S'}</strong> {customer?.name || 'Walk-in'} {customer?.phone ? `- ${customer.phone}` : ''}
      </div>
      {template.show_cashier && sale.cashier_name && <div className="flex justify-between text-sm"><span>Cashier:</span><span>{sale.cashier_name}</span></div>}

      <table className="w-full mt-1 border border-black border-collapse">
        <thead>
          <tr className="border-b border-black">
            <th className="text-left py-1 px-1 border-r border-black w-10">{cols.qty}</th>
            <th className="text-left py-1 px-1 border-r border-black">{cols.particulars}</th>
            <th className="text-right py-1 px-1 border-r border-black w-16">{cols.rate}</th>
            <th className="text-right py-1 px-1 w-20">{cols.amount}</th>
          </tr>
        </thead>
        <tbody>
          {(items || []).map((i, idx) => (
            <tr key={idx} className="border-b border-black/20">
              <td className="py-0.5 px-1 border-r border-black align-top">{i.qty}</td>
              <td className="py-0.5 px-1 border-r border-black align-top">
                {i.product_name}
                {template.show_serial_number && i.serial_number && <div className="text-[0.8em]">SN: {i.serial_number}</div>}
              </td>
              <td className="py-0.5 px-1 border-r border-black align-top text-right">{formatMoney(i.rate)}</td>
              <td className="py-0.5 px-1 align-top text-right">{formatMoney(i.amount)}</td>
            </tr>
          ))}
          {/* Blank ruled rows to mimic the physical receipt pad when the cart is short */}
          {Array.from({ length: Math.max(0, 6 - (items?.length || 0)) }).map((_, idx) => (
            <tr key={`blank-${idx}`} className="border-b border-black/20 h-6">
              <td className="border-r border-black">&nbsp;</td>
              <td className="border-r border-black"></td>
              <td className="border-r border-black"></td>
              <td></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black font-bold">
            <td className="py-1 px-1 border-r border-black">E&amp;OE</td>
            <td className="py-1 px-1 border-r border-black text-right" colSpan={2}>Total</td>
            <td className="py-1 px-1 text-right">{formatMoney(sale.total)}</td>
          </tr>
        </tfoot>
      </table>

      {(template.show_discount && sale.discount > 0) || (template.show_tax && sale.tax_amount > 0) || sale.balance_due > 0 ? (
        <div className="mt-2 space-y-0.5 text-sm">
          {template.show_discount && sale.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{formatMoney(sale.discount)}</span></div>}
          {template.show_tax && sale.tax_amount > 0 && <div className="flex justify-between"><span>Tax</span><span>{formatMoney(sale.tax_amount)}</span></div>}
          {template.show_payment_method && <div className="flex justify-between"><span>Payment</span><span className="capitalize">{sale.payment_method?.replace('_', ' ')}</span></div>}
          {sale.balance_due > 0 && <div className="flex justify-between font-bold"><span>Balance Due</span><span>{formatMoney(sale.balance_due)}</span></div>}
        </div>
      ) : null}

      {template.show_warranty_note && (
        <p className="text-center mt-2 text-[0.8em] italic">Standard warranty applies as per product terms.</p>
      )}
      {template.footer_note && <p className="text-center mt-2 italic">{template.footer_note}</p>}
      {template.show_footer_contact_line && (
        <p className="mt-2 text-sm">{template.customer_contact_label === 'M/S' ? "Customer's Contact" : 'Contact'}<span className="border-b border-dotted border-black">.........................................</span></p>
      )}
    </div>
  )
}
