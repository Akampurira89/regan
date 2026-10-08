import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { LifeBuoy, X, Phone, MessageCircle, MessageSquareText, Mail } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { OWNER_CONTACT, hasOwnerContact, ownerWhatsAppLink, ownerCallLink, ownerSmsLink, ownerEmailLink } from '../../lib/contact'

export default function HelpButton() {
  const [open, setOpen] = useState(false)
  const { profile } = useAuth()
  const { pathname } = useLocation()
  if (!hasOwnerContact()) return null

  const message = `Hello${OWNER_CONTACT.name ? ' ' + OWNER_CONTACT.name : ''}, I need help with the shop system.\nName: ${profile?.full_name || '-'}\nPage: ${pathname}`

  const options = [
    { label: 'WhatsApp', hint: 'Fastest way to reach me', href: ownerWhatsAppLink(message), icon: MessageCircle, tone: 'from-emerald-500 to-green-600', external: true },
    { label: 'Call', hint: OWNER_CONTACT.phone, href: ownerCallLink(1), icon: Phone, tone: 'from-blue-500 to-indigo-600' },
    { label: 'Call (2nd line)', hint: OWNER_CONTACT.phone2, href: ownerCallLink(2), icon: Phone, tone: 'from-sky-500 to-blue-600' },
    { label: 'SMS', hint: 'Send a text message', href: ownerSmsLink(message), icon: MessageSquareText, tone: 'from-orange-500 to-rose-600' },
    { label: 'Email', hint: OWNER_CONTACT.email, href: ownerEmailLink(message), icon: Mail, tone: 'from-purple-500 to-fuchsia-600' },
  ]

  return (
    <div className="fixed bottom-4 right-4 z-40 print:hidden">
      {open && (
        <div className="mb-3 w-72 rounded-2xl bg-white dark:bg-gray-900 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-orange-500 to-rose-600 text-white">
            <p className="font-semibold text-sm">Need help?</p>
            <p className="text-xs text-white/80">Having an issue? Contact {OWNER_CONTACT.name || 'support'} here.</p>
          </div>
          <div className="p-2">
            {options.map((o) => (
              <a key={o.label} href={o.href} target={o.external ? '_blank' : undefined} rel="noreferrer"
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <span className={`w-9 h-9 rounded-xl bg-gradient-to-br ${o.tone} text-white flex items-center justify-center shadow-sm`}><o.icon size={17} /></span>
                <span>
                  <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">{o.label}</span>
                  <span className="block text-xs text-gray-400">{o.hint}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
      <button onClick={() => setOpen((v) => !v)} aria-label="Get help"
        className="ml-auto flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-rose-600 text-white shadow-lg shadow-orange-500/30 hover:scale-105 active:scale-95 transition-transform">
        {open ? <X size={20} /> : <LifeBuoy size={22} />}
      </button>
    </div>
  )
}
