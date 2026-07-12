// ---------------------------------------------------------------------------
// Direct thermal printing via Web Bluetooth + ESC/POS commands. This works
// with most generic BLE thermal receipt printers (the common 58mm/80mm ones
// sold for POS use) without any native app, SDK, or paid service — Chrome/Edge
// on desktop and Android support Web Bluetooth out of the box.
//
// Limitation: Web Bluetooth is NOT supported in Safari/iOS. On those devices,
// the regular browser print dialog (already wired into ReceiptView) remains
// the fallback — most shops pair an 80mm thermal printer as a normal "system
// printer" via USB/Bluetooth-as-printer-driver anyway, which also works fine.
// ---------------------------------------------------------------------------

const ESC = 0x1b
const GS = 0x1d

function textToBytes(str) {
  return Array.from(new TextEncoder().encode(str))
}

// Builds a simple ESC/POS byte sequence for a receipt. Keeps formatting basic
// (bold header, plain rows, cut) since ESC/POS command sets vary by printer.
function buildEscPosReceipt({ template, sale, items, customer }) {
  const bytes = []
  const push = (...arr) => bytes.push(...arr)
  const line = (str = '') => push(...textToBytes(str + '\n'))

  push(ESC, 0x40) // init
  push(ESC, 0x61, 0x01) // center align
  push(ESC, 0x21, 0x30) // double height/width
  line(template.shop_name)
  push(ESC, 0x21, 0x00) // normal
  if (template.address) line(template.address)
  if (template.phone_numbers) line(template.phone_numbers)
  line('--------------------------------')
  push(ESC, 0x61, 0x00) // left align
  line(`Receipt: ${sale.receipt_number}`)
  line(`Date: ${new Date(sale.created_at?.toDate ? sale.created_at.toDate() : sale.created_at || Date.now()).toLocaleString()}`)
  line(`${template.customer_contact_label}: ${customer?.name || 'Walk-in'}`)
  line('--------------------------------')
  ;(items || []).forEach((i) => {
    line(`${i.qty} x ${i.product_name}`)
    line(`   ${Number(i.amount).toLocaleString()}`)
  })
  line('--------------------------------')
  push(ESC, 0x21, 0x08) // bold
  line(`TOTAL: ${Number(sale.total).toLocaleString()}`)
  push(ESC, 0x21, 0x00)
  if (sale.balance_due > 0) line(`Balance Due: ${Number(sale.balance_due).toLocaleString()}`)
  line('')
  push(ESC, 0x61, 0x01)
  if (template.footer_note) line(template.footer_note)
  line('')
  line('')
  push(GS, 0x56, 0x42, 0x00) // partial cut

  return new Uint8Array(bytes)
}

let cachedDevice = null
let cachedCharacteristic = null

export async function connectThermalPrinter() {
  if (!navigator.bluetooth) {
    throw new Error('Web Bluetooth is not supported in this browser (works in Chrome/Edge on desktop or Android).')
  }
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '0000ff00-0000-1000-8000-00805f9b34fb'],
  })
  const server = await device.gatt.connect()
  const services = await server.getPrimaryServices()
  let characteristic = null
  for (const service of services) {
    const chars = await service.getCharacteristics()
    const writable = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse)
    if (writable) { characteristic = writable; break }
  }
  if (!characteristic) throw new Error('No writable characteristic found on this printer.')
  cachedDevice = device
  cachedCharacteristic = characteristic
  return device.name || 'Thermal printer'
}

export async function printReceiptViaBluetooth({ template, sale, items, customer }) {
  if (!cachedCharacteristic) await connectThermalPrinter()
  const payload = buildEscPosReceipt({ template, sale, items, customer })
  // BLE has a small MTU — write in chunks
  const chunkSize = 180
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize)
    // eslint-disable-next-line no-await-in-loop
    await cachedCharacteristic.writeValue(chunk)
  }
}

export const bluetoothPrintingSupported = typeof navigator !== 'undefined' && !!navigator.bluetooth
