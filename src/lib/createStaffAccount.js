import { initializeApp, getApps, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { app } from './firebase'

// Firebase's client SDK signs you in as whatever user you just created with
// createUserWithEmailAndPassword — there's no client-side "create user without
// switching sessions" call (that requires the Admin SDK / a Cloud Function,
// which needs a paid Blaze plan). The standard workaround: spin up a second,
// throwaway Firebase App instance with the same config, create the user on
// THAT instance's Auth (which doesn't touch the admin's session on the main
// app instance), then tear the secondary instance down.
export async function createStaffAuthAccount(email, password) {
  const secondaryApp = initializeApp(app.options, `secondary-${Date.now()}`)
  const secondaryAuth = getAuth(secondaryApp)
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password)
    const uid = cred.user.uid
    await signOut(secondaryAuth)
    return uid
  } finally {
    await deleteApp(secondaryApp)
  }
}
