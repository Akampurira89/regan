import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Package, ShoppingCart, Truck, Users, Building2, Wrench,
  ShieldCheck, Wallet, BarChart3, UserCog, Settings as SettingsIcon, ClipboardList,
  Database, Menu, X, LogOut, Moon, Sun, Receipt,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useSettings } from '../../context/SettingsContext'

const NAV = [
  { key: 'dashboard', to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'products', to: '/products', label: 'Products / Inventory', icon: Package },
  { key: 'sales', to: '/sales', label: 'Sales / POS', icon: ShoppingCart },
  { key: 'purchases', to: '/purchases', label: 'Purchases', icon: Truck },
  { key: 'customers', to: '/customers', label: 'Customers', icon: Users },
  { key: 'suppliers', to: '/suppliers', label: 'Suppliers', icon: Building2 },
  { key: 'repairs', to: '/repairs', label: 'Repairs', icon: Wrench },
  { key: 'warranties', to: '/warranties', label: 'Warranties', icon: ShieldCheck },
  { key: 'debts', to: '/debts', label: 'Debts / Credit', icon: Wallet },
  { key: 'reports', to: '/reports', label: 'Reports', icon: BarChart3 },
  { key: 'settings', to: '/settings/receipt', label: 'Receipt Template', icon: Receipt },
  { key: 'settings', to: '/settings', label: 'Settings', icon: SettingsIcon },
  { key: 'admin', to: '/users', label: 'Staff / Roles', icon: UserCog, adminOnly: true },
  { key: 'audit', to: '/audit-log', label: 'Audit Log', icon: ClipboardList },
  { key: 'backup', to: '/backup', label: 'Backup / Export', icon: Database },
]

export default function DashboardLayout() {
  const [open, setOpen] = useState(false)
  const { profile, logout, can } = useAuth()
  const { template, darkMode, setDarkMode } = useSettings()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const visibleNav = NAV.filter((item) => (item.adminOnly ? profile?.role === 'admin' : can(item.key)))

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <aside
        className={`fixed lg:static z-40 inset-y-0 left-0 w-64 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 transform transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 flex items-center gap-2 px-4 border-b border-gray-100 dark:border-gray-800">
          {template.logo_url ? (
            <img src={template.logo_url} alt="logo" className="w-8 h-8 rounded object-cover" />
          ) : (
            <div className="w-8 h-8 rounded bg-blue-600 text-white flex items-center justify-center font-bold">E</div>
          )}
          <div className="leading-tight">
            <p className="font-bold text-sm text-gray-800 dark:text-gray-100">{template.shop_name}</p>
            <p className="text-[11px] text-gray-400">Shop Management</p>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <nav className="p-2 space-y-0.5 overflow-y-auto scrollbar-thin" style={{ height: 'calc(100vh - 4rem)' }}>
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`
              }
            >
              <item.icon size={17} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {open && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex items-center px-4 gap-3 sticky top-0 z-20">
          <button className="lg:hidden" onClick={() => setOpen(true)}><Menu size={20} /></button>
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              title="Toggle dark mode"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{profile?.full_name}</p>
              <p className="text-xs text-gray-400 capitalize">{profile?.role}</p>
            </div>
            <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="Log out">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
