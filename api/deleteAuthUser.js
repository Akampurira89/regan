import admin from 'firebase-admin'

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8')
  )
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // 1. Verify the caller is actually signed in
  const authHeader = req.headers.authorization || ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!idToken) {
    return res.status(401).json({ error: 'Missing auth token' })
  }

  let callerUid
  try {
    const decoded = await admin.auth().verifyIdToken(idToken)
    callerUid = decoded.uid
  } catch {
    return res.status(401).json({ error: 'Invalid auth token' })
  }

  // 2. Verify the caller is genuinely a super admin (not just anyone logged in)
  const linkSnap = await admin.firestore().collection('userTenants').doc(callerUid).get()
  if (!linkSnap.exists || linkSnap.data().role !== 'super_admin') {
    return res.status(403).json({ error: 'Only the super admin can do this' })
  }

  // 3. Delete the requested logins
  const { uids } = req.body || {}
  if (!Array.isArray(uids) || uids.length === 0) {
    return res.status(400).json({ error: 'No user IDs provided' })
  }

  const results = []
  for (const uid of uids) {
    try {
      await admin.auth().deleteUser(uid)
      results.push({ uid, deleted: true })
    } catch (err) {
      // Already gone, or never existed — not a failure from the caller's perspective
      results.push({ uid, deleted: err.code === 'auth/user-not-found', error: err.code })
    }
  }

  return res.status(200).json({ results })
}
