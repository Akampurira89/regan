@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

:root {
  --brand: #1d4ed8;
  --bg: #f4f6f9;
}

html, body, #root { height: 100%; }
body {
  background: var(--bg);
  color: #111827;
}
.dark body { background: #0b1220; color: #e5e7eb; }

/* ---------- Screen: hide printable receipt ---------- */
.receipt-print-area { display: none; }

/* ---------- Print mode ---------- */
@media print {
  body * { visibility: hidden; }
  .receipt-print-area, .receipt-print-area * { visibility: visible; }
  .receipt-print-area {
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
  }
  .no-print { display: none !important; }
  @page { margin: 4mm; }
}

.receipt-80mm { width: 80mm; font-size: 11px; }
.receipt-58mm { width: 58mm; font-size: 9px; }
.receipt-a5 { width: 148mm; font-size: 13px; }
.receipt-a4 { width: 210mm; font-size: 14px; }

.scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
.scrollbar-thin::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
