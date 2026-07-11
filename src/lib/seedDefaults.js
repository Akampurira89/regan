import { collection, getDocs, writeBatch, doc } from 'firebase/firestore'
import { db } from './firebase'

const DEFAULT_CATEGORIES = ['Phones', 'TVs', 'Fridges', 'Deep Freezers', 'Woofers', 'Fridge Guards', 'Accessories']
const DEFAULT_EXPENSE_CATEGORIES = ['Rent', 'Utilities', 'Transport', 'Salaries', 'Repairs & Maintenance', 'Other']

// Runs once (cheap check each load) to make sure the category dropdowns on
// Products and Expenses aren't empty on a fresh Firebase project — Firestore
// has no seed data built in the way the Supabase schema.sql did.
export async function seedDefaultsIfEmpty() {
  const [catSnap, expCatSnap] = await Promise.all([
    getDocs(collection(db, 'categories')),
    getDocs(collection(db, 'expenseCategories')),
  ])

  const batch = writeBatch(db)
  let needsCommit = false

  if (catSnap.empty) {
    DEFAULT_CATEGORIES.forEach((name) => {
      batch.set(doc(collection(db, 'categories')), { name })
    })
    needsCommit = true
  }

  if (expCatSnap.empty) {
    DEFAULT_EXPENSE_CATEGORIES.forEach((name) => {
      batch.set(doc(collection(db, 'expenseCategories')), { name })
    })
    needsCommit = true
  }

  if (needsCommit) await batch.commit()
}
