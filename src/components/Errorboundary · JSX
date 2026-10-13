import { Component } from 'react'
import { logError } from '../lib/errorLogger'
import { OWNER_CONTACT, hasOwnerContact, ownerWhatsAppLink } from '../lib/contact'

// Catches any screen that crashes, reports it automatically, and shows a friendly
// message instead of a blank white page.
export default class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error, info) {
    logError(error, 'screen_crash', info?.componentStack || '')
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-950">
        <div className="max-w-sm w-full text-center rounded-2xl bg-white dark:bg-gray-900 shadow-lg p-6">
          <p className="text-3xl mb-2">⚠️</p>
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">Something went wrong</h1>
          <p className="text-sm text-gray-500 mt-1 mb-4">The problem has been reported automatically. Please reload the page. Your data is safe.</p>
          <button onClick={() => window.location.reload()} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-rose-600 text-white font-semibold text-sm">Reload</button>
          {hasOwnerContact() && (
            <a href={ownerWhatsAppLink(`Hello ${OWNER_CONTACT.name}, the shop system showed an error on ${window.location.pathname}.`)} target="_blank" rel="noreferrer"
              className="block mt-2 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm">Tell us on WhatsApp</a>
          )}
        </div>
      </div>
    )
  }
}
