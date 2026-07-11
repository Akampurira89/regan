# Eddy K. Electronics — Shop Management System (Firebase Edition)

Same system as the Supabase version, rebuilt on **Firebase**: Firestore (with offline
persistence) + Firebase Auth + Firebase Hosting or Vercel. Every module from the original
spec is here: Dashboard, Products/Inventory, Sales/POS, Purchases, Customers, Suppliers,
Repairs, Warranties, Debts, Reports, Staff/Roles, Receipt Template editor, Audit Log,
Backup/Export — plus the receipt is now built to match your actual printed receipt book
(La Grand Mall, Mbarara — shop name/address/dealers line/P.O Box/No./M/S/E&OE layout).

## What's different from the Supabase version (and why)

Firestore is a NoSQL document store — no joins, no server-side triggers. So instead of
Postgres triggers auto-reducing stock on sale, this version does it with a **Firestore
transaction** at checkout (`runTransaction` in `src/pages/Sales.jsx`): it re-reads each
product's stock, refuses to oversell, writes the sale + line items + stock decrement +
debt record atomically. Purchases work the same way in reverse. Line items live in
subcollections (`sales/{id}/items`, `purchases/{id}/purchase, repairs/{id}/notes`,
`warranties/{id}/claims`) rather than separate tables with foreign keys.

## 1. Set up Firebase

1. Create a project at https://console.firebase.google.com (Spark/free plan is enough —
   nothing here requires Cloud Functions or a paid plan).
2. **Build → Authentication → Get started → Email/Password** → enable it.
3. **Build → Firestore Database → Create database** → start in production mode.
4. Install the Firebase CLI locally if you don't have it: `npm install -g firebase-tools`,
   then `firebase login`.
5. From this project folder: `firebase init` → select **Firestore** (use existing
   `firestore.rules` / `firestore.indexes.json`) — or just deploy them directly:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes --project your-project-id
   ```
6. **Project settings → General → Your apps → Add app (Web)** → copy the config values
   into `.env` (copy `.env.example` first).
7. **Authentication → Users → Add user** (email + password) — this is your first admin
   login. Copy their **User UID**.
8. **Firestore Database → Start collection** → collection ID `profiles` → document ID =
   the UID you copied → fields: `full_name` (string), `role` (string) = `admin`,
   `is_active` (boolean) = `true`.

## 2. Run locally

```bash
npm install
npm run dev
```

## 3. Deploy

**Option A — Firebase Hosting:**
```bash
npm run build
firebase deploy --only hosting --project your-project-id
```

**Option B — Vercel:** push to GitHub, import into Vercel, framework preset Vite, add the
six `VITE_FIREBASE_*` env vars under Settings → Environment Variables.

## Adding more staff

Same pattern as the admin above: Authentication → Add user, then create a `profiles/{uid}`
document with `full_name` and `role` (`admin` / `manager` / `cashier` / `technician`).
They'll only see pages their role permits — see `ROLE_PERMISSIONS` in
`src/context/AuthContext.jsx` to change what each role can access.

## The receipt

Sidebar → **Receipt Template** — every field is editable with a live preview: shop name,
address, dealers line, email, phone, P.O Box/town, the boxed receipt title, the "M/S"
customer line, column headings, footer note, and the "Customer's Contact ....." line, plus
toggles for tax/discount/cashier/payment method/serial/warranty note and receipt size
(80mm/58mm/A5/A4). Defaults are already filled in to match your printed receipt book.

## Previously-stubbed features — what's now real, and what still needs your own account

Last time around, several "if possible" items were left as clear extension points instead
of faked. Here's what's now actually wired in, client-side, with no backend needed:

- ✅ **Offline mode** — Firestore's persistent local cache is enabled
  (`src/lib/firebase.js`). Sales/products/etc. keep working with no connection and sync
  automatically once you're back online. This is a genuine Firestore feature, not a stub.
- ✅ **Camera barcode/QR scanning** — `@zxing/browser` runs fully client-side (no API key).
  Available in Products (add/edit) and Sales (POS search) via the scan icon.
- ✅ **WhatsApp receipts & reminders** — `wa.me` deep links (zero setup, zero cost) open
  WhatsApp with a prefilled message. Used for: sending a receipt after checkout, debt
  payment reminders, and warranty-expiry reminders. This is a one-tap send, not a fully
  automated background message — true automation needs the paid WhatsApp Business API,
  which requires Meta business verification.
- ✅ **Direct thermal printing via Bluetooth** — `src/utils/thermalPrint.js` uses the Web
  Bluetooth API to send raw ESC/POS commands straight to a BLE thermal printer, no native
  app or SDK. Works in Chrome/Edge (desktop + Android); **not supported in Safari/iOS** —
  the regular browser print dialog remains the fallback there.
- ✅ **MoMo/Airtel "pay now" prompt** — a one-tap `tel:*165#` / `tel:*185#` link on the POS
  screen opens the phone dialer with the USSD payment menu, so the cashier can hand the
  customer's phone a ready-to-go prompt. This is not automated payment collection.
- 🔶 **Email receipts** — wired via EmailJS (`src/utils/notifications.js`), which is
  genuinely free-tier and needs no business registration — but it does need you to create
  a free EmailJS account and paste 3 keys into `.env`. Until you do, the feature is
  silently disabled rather than broken.
- 🔶 **SMS reminders** — wired as a thin fetch wrapper (`sendSMS()` in
  `src/utils/notifications.js`) pointed at a gateway URL you configure. This one genuinely
  cannot work without an account, because carriers block SMS from unregistered senders —
  sign up with e.g. Africa's Talking, drop the API URL/key into `.env`, done. Until then,
  the Debts page's SMS button tells the cashier it isn't configured and suggests WhatsApp.
- ❌ **Real-time MTN MoMo / Airtel Money payment verification API** — still not something
  that can be wired without your business being approved by an aggregator (Pegasus, Flutterwave,
  DPO, or a direct MTN/Airtel merchant integration). The manual transaction-ID field on
  each sale remains the practical option until you have that in place.

## Folder structure

```
src/
  components/layout/         Sidebar+topbar shell, protected route wrapper
  components/ui/             Shared Button/Card/Modal/Input, BarcodeScannerModal
  context/                   AuthContext (Firebase Auth + profile/role), SettingsContext (Firestore settings docs)
  lib/firebase.js            Firebase app/Firestore(offline cache)/Auth init
  lib/firestoreService.js    Generic Firestore CRUD helpers
  pages/                     One file per module
  pages/receipts/            Receipt template editor, receipt renderer (matches your paper receipt), reprint history
  utils/helpers.js           Formatting, CSV export, audit logging, sequence numbering
  utils/notifications.js     WhatsApp links, EmailJS wrapper, SMS gateway wrapper, MoMo/Airtel USSD links
  utils/thermalPrint.js      Web Bluetooth ESC/POS printing
firestore.rules              Security rules (role-based, mirrors the Supabase RLS policy)
firestore.indexes.json       Composite indexes for the range/status queries used in Reports/Debts/Repairs
firebase.json                Hosting + Firestore deploy config
```
