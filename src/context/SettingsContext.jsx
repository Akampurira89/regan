import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { seedDefaultsIfEmpty } from '../lib/seedDefaults'

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
  currency: 'UGX', tax_enabled: false, multi_branch: false, low_stock_default: 3,
  mtn_number: '0781137391', airtel_number: '0743111076',
  min_sale_amount: 0, allow_price_negotiation: true,
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
