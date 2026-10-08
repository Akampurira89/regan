// Platform owner contact details — shown to shops through the Help button
// (and on the locked-out login screen) so they can reach you when something goes wrong.
export const OWNER_CONTACT = {
  name: 'Regan Akampurira',
  phone: '0743111076',
  phone2: '0781137391',
  email: 'reganakampurira89@gmail.com',
}

const toIntl = (p) => {
  const d = String(p || '').replace(/[^\d]/g, '')
  return d.startsWith('0') ? '256' + d.slice(1) : d
}

export const ownerDigits = () => toIntl(OWNER_CONTACT.phone)
export const hasOwnerContact = () => ownerDigits().length >= 9

export const ownerWhatsAppLink = (message) => `https://wa.me/${ownerDigits()}?text=${encodeURIComponent(message)}`
export const ownerCallLink = (which = 1) => `tel:+${toIntl(which === 2 ? OWNER_CONTACT.phone2 : OWNER_CONTACT.phone)}`
export const ownerSmsLink = (message) => `sms:+${ownerDigits()}?body=${encodeURIComponent(message)}`
export const ownerEmailLink = (message) => `mailto:${OWNER_CONTACT.email}?subject=${encodeURIComponent('Help with the shop system')}&body=${encodeURIComponent(message)}`
