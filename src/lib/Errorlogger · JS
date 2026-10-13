import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

// Collects app errors so the platform owner can see them on the Super Admin
// "Error Reports" page. Never throws — logging must not be able to break the app.
let ctx = { userId: null, role: null, tenantId: null }
export const setErrorContext = (c) => { ctx = { ...ctx, ...c } }

const lastSeen = new Map()
let sentThisSession = 0
const MAX_PER_SESSION = 25
const IGNORE = ['ResizeObserver loop', 'Script error', 'AbortError']

export async function logError(error, source = 'js_error', extraStack = '') {
  try {
    if (!ctx.userId || !navigator.onLine) return
    const message = String(error?.message || error || 'Unknown error').slice(0, 500)
    if (IGNORE.some((i) => message.includes(i))) return
    const last = lastSeen.get(message)
    if (last && Date.now() - last < 60000) return // same error again within a minute
    if (sentThisSession >= MAX_PER_SESSION) return
    lastSeen.set(message, Date.now())
    sentThisSession++
    await addDoc(collection(db, 'errorLogs'), {
      message,
      stack: (String(error?.stack || '') + '\n' + extraStack).trim().slice(0, 1500),
      source,
      page: window.location.pathname,
      userId: ctx.userId,
      role: ctx.role || null,
      tenantId: ctx.tenantId || null,
      device: String(navigator.userAgent || '').slice(0, 200),
      online: navigator.onLine,
      createdAt: serverTimestamp(),
    })
  } catch {
    /* ignore */
  }
}

export function installGlobalErrorHandlers() {
  window.addEventListener('error', (e) => logError(e.error || e.message, 'js_error'))
  window.addEventListener('unhandledrejection', (e) => logError(e.reason, 'promise'))
}
