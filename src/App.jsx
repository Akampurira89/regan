import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { SettingsProvider } from './context/SettingsContext'
import ProtectedRoute from './components/layout/ProtectedRoute'
import DashboardLayout from './components/layout/DashboardLayout'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Sales from './pages/Sales'
import Purchases from './pages/Purchases'
import Customers from './pages/Customers'
import Suppliers from './pages/Suppliers'
import Repairs from './pages/Repairs'
import Warranties from './pages/Warranties'
import Debts from './pages/Debts'
import Reports from './pages/Reports'
import Users from './pages/Users'
import Settings from './pages/Settings'
import AuditLog from './pages/AuditLog'
import BackupExport from './pages/BackupExport'
import ReceiptSettings from './pages/receipts/ReceiptSettings'
import ReceiptHistory from './pages/receipts/ReceiptHistory'

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="products" element={<ProtectedRoute pageKey="products"><Products /></ProtectedRoute>} />
              <Route path="sales" element={<ProtectedRoute pageKey="sales"><Sales /></ProtectedRoute>} />
              <Route path="sales/history" element={<ProtectedRoute pageKey="sales"><ReceiptHistory /></ProtectedRoute>} />
              <Route path="purchases" element={<ProtectedRoute pageKey="purchases"><Purchases /></ProtectedRoute>} />
              <Route path="customers" element={<ProtectedRoute pageKey="customers"><Customers /></ProtectedRoute>} />
              <Route path="suppliers" element={<ProtectedRoute pageKey="suppliers"><Suppliers /></ProtectedRoute>} />
              <Route path="repairs" element={<ProtectedRoute pageKey="repairs"><Repairs /></ProtectedRoute>} />
              <Route path="warranties" element={<ProtectedRoute pageKey="warranties"><Warranties /></ProtectedRoute>} />
              <Route path="debts" element={<ProtectedRoute pageKey="debts"><Debts /></ProtectedRoute>} />
              <Route path="reports" element={<ProtectedRoute pageKey="reports"><Reports /></ProtectedRoute>} />
              <Route path="users" element={<ProtectedRoute pageKey="admin"><Users /></ProtectedRoute>} />
              <Route path="settings" element={<ProtectedRoute pageKey="settings"><Settings /></ProtectedRoute>} />
              <Route path="settings/receipt" element={<ProtectedRoute pageKey="settings"><ReceiptSettings /></ProtectedRoute>} />
              <Route path="audit-log" element={<ProtectedRoute pageKey="audit"><AuditLog /></ProtectedRoute>} />
              <Route path="backup" element={<ProtectedRoute pageKey="backup"><BackupExport /></ProtectedRoute>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
  )
}
