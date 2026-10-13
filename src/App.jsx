import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { SettingsProvider } from './context/SettingsContext'
import ProtectedRoute from './components/layout/ProtectedRoute'
import DashboardLayout from './components/layout/DashboardLayout'

import Login from './pages/Login'
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Products = lazy(() => import('./pages/Products'))
const Sales = lazy(() => import('./pages/Sales'))
const Purchases = lazy(() => import('./pages/Purchases'))
const Customers = lazy(() => import('./pages/Customers'))
const Suppliers = lazy(() => import('./pages/Suppliers'))
const Debts = lazy(() => import('./pages/Debts'))
const Consignment = lazy(() => import('./pages/Consignment'))
const CashBank = lazy(() => import('./pages/CashBank'))
const Reports = lazy(() => import('./pages/Reports'))
const Users = lazy(() => import('./pages/Users'))
const Settings = lazy(() => import('./pages/Settings'))
const AuditLog = lazy(() => import('./pages/AuditLog'))
const BackupExport = lazy(() => import('./pages/BackupExport'))
const ReceiptSettings = lazy(() => import('./pages/receipts/ReceiptSettings'))
const ReceiptHistory = lazy(() => import('./pages/receipts/ReceiptHistory'))
const SuperAdminDashboard = lazy(() => import('./pages/SuperAdminDashboard'))
const TenantDetail = lazy(() => import('./pages/TenantDetail'))
const ErrorReports = lazy(() => import('./pages/ErrorReports'))

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
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Loading...</div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={<SuperAdminRoute><SuperAdminDashboard /></SuperAdminRoute>} />
            <Route path="/admin/errors" element={<SuperAdminRoute><ErrorReports /></SuperAdminRoute>} />
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
          </Suspense>
        </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
  )
}
