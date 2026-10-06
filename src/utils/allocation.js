// Pure money helpers (no imports) so they can be tested on their own.

// Spread payments over a supplier's purchases, oldest first.
// purchases: [{ id, total, amount_paid, created_secs }]  (amount_paid = money paid when the order was recorded)
// Returns the per-purchase result, what is still owed, and any payments beyond what was owed.
export function allocatePaymentsFIFO(purchases, totalPayments) {
  let remaining = Math.max(0, Number(totalPayments) || 0)
  const rows = [...purchases]
    .sort((a, b) => (a.created_secs || 0) - (b.created_secs || 0))
    .map((p) => {
      const baseDue = Math.max(0, (Number(p.total) || 0) - (Number(p.amount_paid) || 0))
      const viaPayments = Math.min(baseDue, remaining)
      remaining -= viaPayments
      return { id: p.id, paid_via_payments: viaPayments, balance_due: baseDue - viaPayments }
    })
  const owed = rows.reduce((s, r) => s + r.balance_due, 0)
  return { rows, owed, overpaid: remaining }
}

// Apply ONE new payment to a supplier's open purchases, oldest first.
// open: [{ ref, balance_due, paid_via_payments }] sorted oldest first
export function allocateToPurchases(open, amount) {
  let remaining = Number(amount) || 0
  const updates = []
  for (const p of open) {
    if (remaining <= 0) break
    const take = Math.min(p.balance_due, remaining)
    if (take <= 0) continue
    remaining -= take
    updates.push({ ...p, paid_via_payments: p.paid_via_payments + take, balance_due: p.balance_due - take })
  }
  return { updates, leftover: remaining }
}
