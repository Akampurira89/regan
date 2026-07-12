import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, Trash2, Download, PackagePlus, ScanLine, Tags, X } from 'lucide-react'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Button, Card, Input, Select, Modal, Badge, EmptyState, Checkbox } from '../components/ui/ui'
import BarcodeScannerModal from '../components/ui/BarcodeScannerModal'
import { formatMoney, exportToCSV, logAudit } from '../utils/helpers'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'

const emptyForm = {
  name: '', sku: '', barcode: '', category_id: '', brand: '', model: '', description: '',
  buying_price: '', selling_price: '', stock_qty: '0', low_stock_threshold: '3',
  unit: 'pcs', has_serial: false, is_active: true, negotiable: true,
}

export default function Products() {
  const { profile } = useAuth()
  const { company } = useSettings()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [adjustModal, setAdjustModal] = useState(null)
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustReason, setAdjustReason] = useState('adjustment')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [pSnap, cSnap] = await Promise.all([getDocs(collection(db, 'products')), getDocs(collection(db, 'categories'))])
    const cats = cSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]))
    setProducts(pSnap.docs.map((d) => ({ id: d.id, ...d.data(), categoryName: catMap[d.data().category_id] })).sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0)))
    setCategories(cats)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = products.filter((p) => {
    const q = search.toLowerCase()
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q)
    const matchesCat = !categoryFilter || p.category_id === categoryFilter
    return matchesSearch && matchesCat
  })

  const openNew = () => { setEditing(null); setForm(emptyForm); setModalOpen(true) }
  const openEdit = (p) => {
    setEditing(p)
    setForm({
      ...emptyForm, ...p, category_id: p.category_id || '', negotiable: p.negotiable !== false,
      buying_price: String(p.buying_price), selling_price: String(p.selling_price),
      stock_qty: String(p.stock_qty), low_stock_threshold: String(p.low_stock_threshold ?? 3),
    })
    setModalOpen(true)
  }

  const save = async (e) => {
    e.preventDefault()
    const payload = {
      name: form.name, sku: form.sku || null, barcode: form.barcode || null,
      category_id: form.category_id || null, brand: form.brand, model: form.model, description: form.description,
      buying_price: Number(form.buying_price) || 0, selling_price: Number(form.selling_price) || 0,
      low_stock_threshold: Number(form.low_stock_threshold) || 3,
      unit: form.unit, has_serial: form.has_serial, is_active: form.is_active, negotiable: form.negotiable,
    }
    if (editing) {
      await updateDoc(doc(db, 'products', editing.id), { ...payload, updated_at: serverTimestamp() })
      await logAudit({ userId: profile?.id, action: 'update', entityType: 'products', entityId: editing.id, newValues: payload })
    } else {
      payload.stock_qty = Number(form.stock_qty) || 0
      const ref = await addDoc(collection(db, 'products'), { ...payload, updated_at: serverTimestamp() })
      await logAudit({ userId: profile?.id, action: 'create', entityType: 'products', entityId: ref.id, newValues: payload })
    }
    setModalOpen(false)
    load()
  }

  const remove = async (p) => {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return
    await deleteDoc(doc(db, 'products', p.id))
    await logAudit({ userId: profile?.id, action: 'delete', entityType: 'products', entityId: p.id, oldValues: p })
    load()
  }

  const submitAdjustment = async (e) => {
    e.preventDefault()
    const qty = Number(adjustQty)
    if (!qty) return
    const product = adjustModal
    await updateDoc(doc(db, 'products', product.id), { stock_qty: product.stock_qty + qty })
    await addDoc(collection(db, 'stockMovements'), {
      product_id: product.id, change_qty: qty, reason: adjustReason, created_by: profile?.id,
      notes: 'Manual adjustment via Products page', created_at: serverTimestamp(),
    })
    await logAudit({ userId: profile?.id, action: 'stock_adjustment', entityType: 'products', entityId: product.id, newValues: { change_qty: qty, reason: adjustReason } })
    setAdjustModal(null); setAdjustQty('')
    load()
  }

  const addCategory = async () => {
    if (!newCategoryName.trim()) return
    await addDoc(collection(db, 'categories'), { name: newCategoryName.trim() })
    setNewCategoryName('')
    load()
  }

  const deleteCategory = async (cat) => {
    if (products.some((p) => p.category_id === cat.id)) {
      alert(`"${cat.name}" still has products assigned to it. Move or delete those products first.`)
      return
    }
    if (!confirm(`Delete category "${cat.name}"?`)) return
    await deleteDoc(doc(db, 'categories', cat.id))
    load()
  }

  const doExport = () => {
    exportToCSV('products.csv', filtered.map((p) => ({
      name: p.name, sku: p.sku, barcode: p.barcode, category: p.categoryName,
      brand: p.brand, model: p.model, cost_price: p.buying_price, selling_price: p.selling_price,
      stock_qty: p.stock_qty, min_stock: p.low_stock_threshold, negotiable: p.negotiable !== false,
    })))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Products / Inventory</h1>
          <p className="text-sm text-gray-400">{products.length} products total</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setCategoryModalOpen(true)}><Tags size={15} className="inline mr-1" /> Categories</Button>
          <Button variant="secondary" onClick={doExport}><Download size={15} className="inline mr-1" /> Export</Button>
          <Button onClick={openNew}><Plus size={15} className="inline mr-1" /> Add Product</Button>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              className="w-full pl-9 pr-9 py-2 rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 text-sm"
              placeholder="Search by name, SKU, or barcode..."
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
            <button onClick={() => setScannerOpen(true)} className="absolute right-2 top-2 text-gray-400 hover:text-brand" title="Scan barcode">
              <ScanLine size={16} />
            </button>
          </div>
          <select
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 text-sm"
            value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {loading ? <p className="text-sm text-gray-400">Loading...</p> : filtered.length === 0 ? <EmptyState message="No products found." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <th className="py-2 pr-3">Product</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Cost Price</th>
                  <th className="py-2 pr-3">Sell Price</th>
                  <th className="py-2 pr-3">Stock</th>
                  <th className="py-2 pr-3">Min Stock</th>
                  <th className="py-2 pr-3">Negotiable</th>
                  <th className="py-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 dark:border-gray-800/50">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-gray-800 dark:text-gray-100">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.brand} {p.model} {p.sku ? `· ${p.sku}` : ''}</p>
                    </td>
                    <td className="py-2 pr-3 text-gray-500">{p.categoryName || '-'}</td>
                    <td className="py-2 pr-3 text-gray-500">{formatMoney(p.buying_price, company.currency)}</td>
                    <td className="py-2 pr-3 font-medium">{formatMoney(p.selling_price, company.currency)}</td>
                    <td className="py-2 pr-3">
                      <Badge color={p.stock_qty === 0 ? 'red' : p.stock_qty <= (p.low_stock_threshold ?? 3) ? 'yellow' : 'green'}>
                        {p.stock_qty} {p.unit}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-gray-500">{p.low_stock_threshold ?? 3}</td>
                    <td className="py-2 pr-3">{p.negotiable !== false ? <Badge color="blue">Yes</Badge> : <Badge color="gray">No</Badge>}</td>
                    <td className="py-2 pr-3">
                      <div className="flex justify-end gap-1">
                        <button title="Adjust stock" onClick={() => setAdjustModal(p)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><PackagePlus size={15} /></button>
                        <button title="Edit" onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><Pencil size={15} /></button>
                        <button title="Delete" onClick={() => remove(p)} className="p-1.5 rounded hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Product' : 'Add Product'} wide>
        <form onSubmit={save} className="grid sm:grid-cols-2 gap-x-4">
          <Input label="Product Name *" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div>
            <Select label="Category" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">Uncategorized</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <button type="button" onClick={() => setCategoryModalOpen(true)} className="text-xs text-brand -mt-2">+ Add a new category</button>
          </div>
          <Input label="Brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          <Input label="Model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          <Input label="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          <div className="relative">
            <Input label="Barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            <button type="button" onClick={() => setScannerOpen(true)} className="absolute right-2 top-8 text-gray-400 hover:text-brand" title="Scan barcode"><ScanLine size={16} /></button>
          </div>
          <Input label="Cost / Buying Price (UGX) *" type="number" required value={form.buying_price} onChange={(e) => setForm({ ...form, buying_price: e.target.value })} />
          <Input label="Selling Price (UGX) *" type="number" required value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} />
          {!editing && <Input label="Opening Stock Qty" type="number" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: e.target.value })} />}
          <Input label="Minimum Stock Level (low-stock alert)" type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} />
          <Input label="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          <div className="sm:col-span-2">
            <Checkbox label="Track individual serial numbers / IMEI for this product" checked={form.has_serial} onChange={(e) => setForm({ ...form, has_serial: e.target.checked })} />
            <Checkbox label="Price is negotiable — cashiers can adjust it at checkout" checked={form.negotiable} onChange={(e) => setForm({ ...form, negotiable: e.target.checked })} />
            <Checkbox label="Active (visible in POS)" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2 mt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit">{editing ? 'Save Changes' : 'Add Product'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!adjustModal} onClose={() => setAdjustModal(null)} title={`Adjust Stock: ${adjustModal?.name || ''}`}>
        <form onSubmit={submitAdjustment}>
          <p className="text-sm text-gray-500 mb-3">Current stock: <strong>{adjustModal?.stock_qty}</strong> {adjustModal?.unit}</p>
          <Input label="Quantity change (use negative to remove, e.g. -2)" type="number" required value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} />
          <Select label="Reason" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)}>
            <option value="adjustment">Manual adjustment</option>
            <option value="damage">Damaged / written off</option>
            <option value="return">Customer return</option>
            <option value="recount">Stock recount</option>
          </Select>
          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="secondary" onClick={() => setAdjustModal(null)}>Cancel</Button>
            <Button type="submit">Apply Adjustment</Button>
          </div>
        </form>
      </Modal>

      <Modal open={categoryModalOpen} onClose={() => setCategoryModalOpen(false)} title="Manage Categories">
        <div className="flex gap-2 mb-4">
          <input
            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-sm"
            placeholder="New category name..."
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCategory())}
          />
          <Button onClick={addCategory}>Add</Button>
        </div>
        {categories.length === 0 ? <EmptyState message="No categories yet." /> : (
          <div className="space-y-1">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-sm">
                <span>{c.name}</span>
                <button onClick={() => deleteCategory(c)} className="text-red-500 p-1"><X size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <BarcodeScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={(code) => { setForm((f) => ({ ...f, barcode: code })); setSearch(code) }} />
    </div>
  )
}
