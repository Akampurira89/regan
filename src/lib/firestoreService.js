import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, setDoc,
  query, where, orderBy, limit as qLimit, onSnapshot, serverTimestamp, increment,
  writeBatch, runTransaction,
} from 'firebase/firestore'
import { db } from './firebase'

export const col = (name) => collection(db, name)
export const docRef = (name, id) => doc(db, name, id)

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
