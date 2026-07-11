import { collection, addDoc, query, where, getCountFromServer, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'

export function formatMoney(amount, currency = 'UGX') {
  const n = Number(amount || 0)
  return `${currency} ${n.toLocaleString('en-UG', { maximumFractionDigits: 0 })}`
}

// Handles JS Dates, ISO strings, AND Firestore Timestamps (which have a .toDate() method)
export function formatDate(d) {
  if (!d) return '-'
  const date = d?.toDate ? d.toDate() : new Date(d)
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function toJsDate(d) {
  if (!d) return null
  return d?.toDate ? d.toDate() : new Date(d)
}

// Generates a sequential-looking receipt/ticket number, e.g. RCT-20260710-0001
// Firestore has no server-side row counts like Postgres, so we count today's docs.
export async function generateSequenceNumber(prefix, collectionName, dateField = 'created_at') {
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
  const startOfDay = new Date(today.setHours(0, 0, 0, 0))
  try {
    const q = query(collection(db, collectionName), where(dateField, '>=', Timestamp.fromDate(startOfDay)))
    const snap = await getCountFromServer(q)
    const seq = String((snap.data().count || 0) + 1).padStart(4, '0')
    return `${prefix}-${dateStr}-${seq}`
  } catch {
    // Fallback if the count query needs an index that hasn't built yet
    return `${prefix}-${dateStr}-${String(Date.now()).slice(-4)}`
  }
}

export async function logAudit({ userId, action, entityType, entityId, oldValues, newValues }) {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      user_id: userId || null,
      action,
      entity_type: entityType,
      entity_id: entityId ? String(entityId) : null,
      old_values: oldValues || null,
      new_values: newValues || null,
      created_at: serverTimestamp(),
    })
  } catch (e) {
    console.error('Audit log failed', e)
  }
}

export function exportToCSV(filename, rows) {
  if (!rows || rows.length === 0) return
  const headers = Object.keys(rows[0]).filter((h) => h !== 'id')
  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((h) => {
        let val = row[h]
        if (val?.toDate) val = val.toDate().toISOString()
        return `"${String(val ?? '').replace(/"/g, '""')}"`
      }).join(',')
    ),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function daysBetween(a, b) {
  const ms = toJsDate(b) - toJsDate(a)
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}
