// ---------------------------------------------------------------------------
// WhatsApp — works with ZERO setup. wa.me deep links open WhatsApp (mobile or
// WhatsApp Web) with a prefilled message. This is not the paid WhatsApp
// Business API — it's a real, always-free way to send a receipt/reminder that
// the cashier taps "Send" on. Good enough for a single shop; if Regan later
// wants fully automated sending with no tap required, that needs the WhatsApp
// Business API (requires Meta business verification).
// ---------------------------------------------------------------------------
export function buildWhatsAppLink(phone, message) {
  const digits = String(phone || '').replace(/[^\d]/g, '')
  // Normalize Ugandan numbers: 07xxxxxxxx -> 2567xxxxxxxx
  const normalized = digits.startsWith('0') ? '256' + digits.slice(1) : digits
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
}

export function openWhatsApp(phone, message) {
  window.open(buildWhatsAppLink(phone, message), '_blank')
}

export function receiptWhatsAppMessage({ shopName, receiptNumber, total, currency, itemsSummary }) {
  return `Thank you for shopping at ${shopName}!\nReceipt: ${receiptNumber}\nTotal: ${currency} ${Number(total).toLocaleString()}\n${itemsSummary ? `Items: ${itemsSummary}\n` : ''}Please keep this message as your receipt copy.`
}

export function debtReminderMessage({ shopName, customerName, balance, currency, dueDate }) {
  return `Hello ${customerName}, this is a friendly reminder from ${shopName} that you have an outstanding balance of ${currency} ${Number(balance).toLocaleString()}${dueDate ? ` due ${dueDate}` : ''}. Kindly clear it at your earliest convenience. Thank you.`
}

export function warrantyReminderMessage({ shopName, customerName, productName, endDate }) {
  return `Hello ${customerName}, this is a reminder from ${shopName} that the warranty on your ${productName} ends on ${endDate}. Contact us before then for any issues covered under warranty.`
}

// ---------------------------------------------------------------------------
// Email receipts via EmailJS — genuinely free-tier, runs entirely client-side,
// no backend or business registration needed. Only active if the three
// VITE_EMAILJS_* env vars are set; otherwise emailReceipt() is a no-op that
// tells the caller it's not configured, so the UI can hide/disable the button.
// ---------------------------------------------------------------------------
const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY

export const emailConfigured = !!(EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY)

export async function emailReceipt({ toEmail, toName, subject, message }) {
  if (!emailConfigured) return { ok: false, reason: 'not_configured' }
  const emailjs = await import('emailjs-com')
  await emailjs.send(
    EMAILJS_SERVICE_ID,
    EMAILJS_TEMPLATE_ID,
    { to_email: toEmail, to_name: toName, subject, message },
    EMAILJS_PUBLIC_KEY
  )
  return { ok: true }
}

// ---------------------------------------------------------------------------
// SMS — genuinely requires an account with a gateway (Africa's Talking, etc.)
// because carriers won't deliver SMS from an unregistered sender. This is a
// thin wrapper so wiring one in later is a one-file change; it will not send
// anything until VITE_SMS_API_URL / VITE_SMS_API_KEY are filled in.
// ---------------------------------------------------------------------------
const SMS_API_URL = import.meta.env.VITE_SMS_API_URL
const SMS_API_KEY = import.meta.env.VITE_SMS_API_KEY
const SMS_SENDER_ID = import.meta.env.VITE_SMS_SENDER_ID

export const smsConfigured = !!(SMS_API_URL && SMS_API_KEY)

export async function sendSMS(phone, message) {
  if (!smsConfigured) return { ok: false, reason: 'not_configured' }
  const res = await fetch(SMS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apiKey: SMS_API_KEY },
    body: JSON.stringify({ to: phone, message, from: SMS_SENDER_ID }),
  })
  if (!res.ok) return { ok: false, reason: 'gateway_error' }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// MTN MoMo / Airtel Money — a real payment-collection API needs an approved
// aggregator/business account (Momo API, Airtel OpenAPI, or a merchant
// number). What we CAN do with zero approval is generate a tel: link that
// opens the phone's dialer pre-filled with the shop's USSD "pay/send money"
// code, so the cashier can hand the customer's phone a one-tap prompt.
// Update the codes below to your shop's actual merchant/till number.
// ---------------------------------------------------------------------------
export function buildMomoUSSDLink(amount, merchantCode = '') {
  // MTN Uganda "Send Money" USSD pattern: *165*3*<merchant>*<amount>#
  const code = merchantCode ? `*165*3*${merchantCode}*${Math.round(amount)}#` : `*165#`
  return `tel:${encodeURIComponent(code)}`
}

export function buildAirtelUSSDLink() {
  return `tel:${encodeURIComponent('*185#')}`
}
