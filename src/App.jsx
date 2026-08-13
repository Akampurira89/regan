import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
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
import Debts from './pages/Debts'
import Consignment from './pages/Consignment'
import CashBank from './pages/CashBank'
import Reports from './pages/Reports'
import Users from './pages/Users'
import Settings from './pages/Settings'
import AuditLog from './pages/AuditLog'
import BackupExport from './pages/BackupExport'
import ReceiptSettings from './pages/receipts/ReceiptSettings'
import ReceiptHistory from './pages/receipts/ReceiptHistory'
import SuperAdminDashboard from './pages/SuperAdminDashboard'
import TenantDetail from './pages/TenantDetail'

function SuperAdminRoute({ children }) {
  const { session, profile, loading } = useAuth()
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Loading...</div>
  }
  if (!session) return <Navigate to="/login" replace />
  if (profile?.role !== 'super_admin') return <Navigate to="/" replace />
  return children
}

// A super admin only reaches the normal shop routes while actively "viewing
// as" a specific shop. Otherwise they're sent to Manage Clients.
function RootRedirect() {
  const { profile, viewingAs } = useAuth()
  if (profile?.role === 'super_admin' && !viewingAs) return <Navigate to="/admin" replace />
  return <DashboardLayout />
}

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={<SuperAdminRoute><SuperAdminDashboard /></SuperAdminRoute>} />
            <Route path="/admin/shop/:tenantId" element={<SuperAdminRoute><TenantDetail /></SuperAdminRoute>} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <RootRedirect />
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
              <Route path="debts" element={<ProtectedRoute pageKey="debts"><Debts /></ProtectedRoute>} />
              <Route path="consignment" element={<ProtectedRoute pageKey="consignment"><Consignment /></ProtectedRoute>} />
              <Route path="cash-bank" element={<ProtectedRoute pageKey="cashbank"><CashBank /></ProtectedRoute>} />
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
