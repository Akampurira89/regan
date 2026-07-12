import { Download } from 'lucide-react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Card, Button } from '../components/ui/ui'
import { exportToCSV } from '../utils/helpers'

const EXPORTS = [
  { name: 'products', label: 'Products / Inventory' },
  { name: 'customers', label: 'Customers' },
  { name: 'suppliers', label: 'Suppliers' },
  { name: 'sales', label: 'Sales' },
  { name: 'purchases', label: 'Purchases' },
  { name: 'repairs', label: 'Repairs' },
  { name: 'warranties', label: 'Warranties' },
  { name: 'debts', label: 'Debts' },
  { name: 'consignmentItems', label: 'Consignment / Borrowed Items' },
  { name: 'expenses', label: 'Expenses' },
  { name: 'auditLogs', label: 'Audit Log' },
]

export default function BackupExport() {
  const runExport = async (name) => {
    const snap = await getDocs(collection(db, name))
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    if (rows.length === 0) { alert('No data to export for this collection.'); return }
    exportToCSV(`${name}_backup_${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  const exportAll = async () => {
    for (const item of EXPORTS) {
      // eslint-disable-next-line no-await-in-loop
      await runExport(item.name)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Backup / Export</h1>
        <p className="text-sm text-gray-400">Download CSV backups of your shop data. Firebase also keeps automatic backups on the Blaze plan.</p>
      </div>

      <Card>
        <div className="flex justify-end mb-3">
          <Button onClick={exportAll}><Download size={15} className="inline mr-1" /> Export All Collections</Button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {EXPORTS.map((item) => (
            <div key={item.name} className="flex items-center justify-between border border-gray-100 dark:border-gray-800 rounded-lg p-3">
              <span className="text-sm font-medium">{item.label}</span>
              <Button variant="secondary" onClick={() => runExport(item.name)}><Download size={14} className="inline mr-1" /> CSV</Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
