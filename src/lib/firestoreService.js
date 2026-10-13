import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, setDoc,
  query, where, orderBy, limit as qLimit, onSnapshot, serverTimestamp, increment,
  writeBatch, runTransaction,
} from 'firebase/firestore'
import { db, tPath } from './firebase'

export const col = (name) => collection(db, ...tPath(name))
export const docRef = (name, id) => doc(db, ...tPath(name, id))

export async function getAllDocs(name, constraints = []) {
  const q = query(col(name), ...constraints)
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function getOneDoc(name, id) {
  const snap = await getDoc(docRef(name, id))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export async function addDocTo(name, data) {
  const ref = await addDoc(col(name), { ...data, created_at: serverTimestamp() })
  return { id: ref.id, ...data }
}

export async function setDocAt(name, id, data, merge = true) {
  await setDoc(docRef(name, id), data, { merge })
  return { id, ...data }
}

export async function updateDocAt(name, id, data) {
  await updateDoc(docRef(name, id), data)
  return { id, ...data }
}

export async function deleteDocAt(name, id) {
  await deleteDoc(docRef(name, id))
}

export function listenAll(name, constraints, cb) {
  const q = query(col(name), ...constraints)
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
}

// Re-export common Firestore query builders so pages don't need a second import line
export { where, orderBy, qLimit as limit, serverTimestamp, increment, writeBatch, runTransaction }

// ==========================================
// START FRESH (used by components/ResetShopCard.jsx)
// ==========================================
// Everything below is DELETED by a reset. Staff accounts, settings, receipt template,
// categories, the audit log and login history are KEPT.
export const RESET_COLLECTIONS = [
  { name: 'sales', subs: ['items'], label: 'Sales & receipts' },
  { name: 'purchases', subs: ['items'], label: 'Purchases' },
  { name: 'products', label: 'Products / stock' },
  { name: 'stockMovements', label: 'Stock movements' },
  { name: 'customers', label: 'Customers' },
  { name: 'suppliers', label: 'Suppliers' },
  { name: 'payments', label: 'Payments' },
  { name: 'debts', label: 'Debts / credit' },
  { name: 'consignmentItems', label: 'Consignment / borrowed items' },
  { name: 'personalPayables', label: 'People you owe' },
  { name: 'expenses', label: 'Expenses' },
  { name: 'cashBankLedger', label: 'Cash & bank transfers' },
  { name: 'repairs', label: 'Repairs' },
  { name: 'warranties', label: 'Warranties' },
]

// Reads every record (and sub-records such as sale items) that a reset would remove.
async function collectAll(onProgress) {
  const out = []
  for (const c of RESET_COLLECTIONS) {
    onProgress?.(`Reading ${c.label}...`)
    // eslint-disable-next-line no-await-in-loop
    const snap = await getDocs(collection(db, ...tPath(c.name)))
    const docs = []
    for (const d of snap.docs) {
      const subs = {}
      for (const sub of c.subs || []) {
        // eslint-disable-next-line no-await-in-loop
        const subSnap = await getDocs(collection(db, ...tPath(c.name, d.id, sub)))
        subs[sub] = subSnap.docs.map((x) => ({ ref: x.ref, id: x.id, data: x.data() }))
      }
      docs.push({ ref: d.ref, id: d.id, data: d.data(), subs })
    }
    out.push({ ...c, docs })
  }
  return out
}

// Builds the safety-copy file contents (JSON text) of everything a reset would delete.
export async function buildBackup(shopName, onProgress) {
  const all = await collectAll(onProgress)
  const data = {}
  const counts = {}
  all.forEach((c) => {
    counts[c.name] = c.docs.length
    data[c.name] = c.docs.map((d) => {
      const row = { id: d.id, ...d.data }
      Object.entries(d.subs).forEach(([k, v]) => { row[`_${k}`] = v.map((x) => ({ id: x.id, ...x.data })) })
      return row
    })
  })
  return { json: JSON.stringify({ shop: shopName, exportedAt: new Date().toISOString(), data }, null, 1), counts }
}

// Permanently deletes all business data listed above.
export async function wipeShopData(onProgress) {
  const all = await collectAll(onProgress)
  const refs = []
  const counts = {}
  all.forEach((c) => {
    counts[c.name] = c.docs.length
    c.docs.forEach((d) => {
      Object.values(d.subs).forEach((list) => list.forEach((x) => refs.push(x.ref)))
      refs.push(d.ref)
    })
  })
  // Fast path: big batches. If the server refuses a big batch, fall back to small
  // batches, then one-by-one, so the reset still completes.
  const commit = async (list) => {
    const batch = writeBatch(db)
    list.forEach((r) => batch.delete(r))
    await batch.commit()
  }
  let done = 0
  for (let i = 0; i < refs.length; i += 400) {
    const chunk = refs.slice(i, i + 400)
    try {
      await commit(chunk) // eslint-disable-line no-await-in-loop
    } catch {
      for (let j = 0; j < chunk.length; j += 10) {
        const small = chunk.slice(j, j + 10)
        try {
          await commit(small) // eslint-disable-line no-await-in-loop
        } catch {
          for (const r of small) await deleteDoc(r) // eslint-disable-line no-await-in-loop
        }
      }
    }
    done += chunk.length
    onProgress?.(`Deleting... ${done} of ${refs.length}`)
  }
  return { counts, total: refs.length }
}
