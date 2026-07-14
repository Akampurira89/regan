import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { seedDefaultsIfEmpty } from '../lib/seedDefaults'

// A curated palette of distinct, good-looking accent colors — cycled through
// automatically on each app load when "auto_color_rotate" is on, so the shop
// gets a fresh look every time without anyone having to pick manually.
const COLOR_PALETTE = [
  '#c2410c', // amber/orange (original brand)
  '#0f766e', // teal
  '#7c3aed', // violet
  '#be123c', // rose
  '#0369a1', // ocean blue
  '#15803d', // green
  '#a16207', // gold
  '#4338ca', // indigo
  '#0891b2', // cyan
  '#b91c1c', // red
]

function pickRandomColor() {
  return COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)]
}
function shadeColor(hex, percent) {
  try {
    const num = parseInt(hex.replace('#', ''), 16)
    let r = (num >> 16) + percent
    let g = ((num >> 8) & 0x00ff) + percent
    let b = (num & 0x0000ff) + percent
    r = Math.max(0, Math.min(255, r))
    g = Math.max(0, Math.min(255, g))
    b = Math.max(0, Math.min(255, b))
    return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`
  } catch {
    return hex
  }
}

const SettingsContext = createContext(null)

const DEFAULT_TEMPLATE = {
  shop_name: 'EDDY .K. ELECTRONICS',
  logo_url: '',
  address: 'La Grand Mall shop No.6 High Street',
  town: 'Mbarara',
  po_box: 'Mbarara',
  email: 'ekasigaire@gmail.com',
  phone_numbers: '0706 270 169/0787 821 439',
  dealers_line: 'Dealers in: Tvs, Fridges, Deep Freezers, Phones and Accessories, Woofers, Fridge guards etc',
  receipt_title: 'RECEIPT',
  footer_note: 'Once goods sold are not returnable.',
  customer_contact_label: 'M/S',
  show_footer_contact_line: true,
  return_policy_text: '',
  column_headings: { qty: 'Qty', particulars: 'Particulars', rate: 'Rate', amount: 'Amount' },
  receipt_size: '80mm',
  show_tax: false,
  show_discount: true,
  show_cashier: true,
  show_payment_method: true,
  show_serial_number: true,
  show_warranty_note: true,
}

const DEFAULT_COMPANY = {
  currency: 'UGX', multi_branch: false, low_stock_default: 3,
  mtn_number: '0781137391', airtel_number: '0743111076',
  min_sale_amount: 0, allow_price_negotiation: true, accent_color: '#c2410c', auto_color_rotate: true,
}

export function SettingsProvider({ children }) {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE)
  const [company, setCompany] = useState(DEFAULT_COMPANY)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('eddyk_dark') === '1')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const tplSnap = await getDoc(doc(db, 'settings', 'receiptTemplate'))
    if (tplSnap.exists()) setTemplate({ ...DEFAULT_TEMPLATE, ...tplSnap.data() })
    else await setDoc(doc(db, 'settings', 'receiptTemplate'), DEFAULT_TEMPLATE)

    const compSnap = await getDoc(doc(db, 'settings', 'company'))
    if (compSnap.exists()) setCompany({ ...DEFAULT_COMPANY, ...compSnap.data() })
    else await setDoc(doc(db, 'settings', 'company'), DEFAULT_COMPANY)

    await seedDefaultsIfEmpty()
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('eddyk_dark', darkMode ? '1' : '0')
  }, [darkMode])

  useEffect(() => {
    const useColor = company.auto_color_rotate ? pickRandomColor() : (company.accent_color || '#c2410c')
    const root = document.documentElement
    root.style.setProperty('--color-brand', useColor)
    root.style.setProperty('--color-brand-dark', shadeColor(useColor, -30))
    root.style.setProperty('--color-brand-light', shadeColor(useColor, 40))
    // Intentionally only re-runs when auto_color_rotate or the manual color changes —
    // NOT on every render — so the color picked on load stays stable for the session.
  }, [company.auto_color_rotate, company.accent_color])

  const saveTemplate = async (updates) => {
    const next = { ...template, ...updates }
    await setDoc(doc(db, 'settings', 'receiptTemplate'), next, { merge: true })
    setTemplate(next)
    return next
  }

  const saveCompany = async (updates) => {
    const next = { ...company, ...updates }
    await setDoc(doc(db, 'settings', 'company'), next, { merge: true })
    setCompany(next)
    return next
  }

  const value = { template, company, darkMode, setDarkMode, saveTemplate, saveCompany, refresh, loading }
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider')
  return ctx
}
