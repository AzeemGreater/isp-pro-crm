import { NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, Receipt, Users, Database, Download, Wallet, FileText, Settings, ChevronLeft, Globe,
} from 'lucide-react'
import { getStoredBranding, loadCurrentBranding } from '../lib/branding'

const navItems = [
  { to: '/subdealer/dashboard',      icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/subdealer/generate-bills', icon: Receipt,         label: 'Generate Bills' },
  { to: '/subdealer/customers',      icon: Users,           label: 'All Customers' },
  { to: '/subdealer/data-usage',     icon: Database,        label: 'Data Usage' },
  { to: '/subdealer/online-users',   icon: Download,        label: 'Online Users' },
  { to: '/subdealer/wallet',         icon: Wallet,          label: 'My Wallet' },
  { to: '/subdealer/invoices',       icon: FileText,        label: 'Invoices / Bills' },
  { to: '/subdealer/profile-settings', icon: Settings,      label: 'Profile Settings' },
]

interface SubdealerSidebarProps {
  isOpen: boolean
  onToggle: () => void
}

export function SubdealerSidebar({ isOpen, onToggle }: SubdealerSidebarProps) {
  const [branding, setBranding] = useState(() => getStoredBranding())

  useEffect(() => {
    loadCurrentBranding().then((data) => {
      if (data) setBranding(data)
    }).catch(() => undefined)
  }, [])

  return (
    <motion.aside
      animate={{ width: isOpen ? 256 : 64 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="fixed left-0 top-0 h-screen bg-bg-surface border-r border-border z-40 flex flex-col overflow-hidden sidebar-custom"
    >
      <div className="border-b border-border min-h-[72px]">
        <NavLink to="/subdealer/dashboard" end className="flex items-center gap-3 px-4 py-5 hover:bg-bg-hover/40 transition-colors">
          <div className="w-9 h-9 rounded-lg bg-gradient-cyan flex items-center justify-center flex-shrink-0 shadow-glow-cyan">
            <Globe className="w-5 h-5 text-white" />
          </div>
          <AnimatePresence>
            {isOpen && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <p className="font-bold text-text-primary text-sm leading-tight">{branding?.app_name || 'ISP CRM Pro'}</p>
                <p className="text-[10px] text-text-muted">Subdealer Portal</p>
              </motion.div>
            )}
          </AnimatePresence>
        </NavLink>
      </div>

      <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto no-scrollbar">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end}>
            {({ isActive }) => (
              <div className={isActive ? 'nav-item-active' : 'nav-item'} title={!isOpen ? label : undefined}>
                <Icon className="w-4.5 h-4.5 flex-shrink-0" size={18} />
                <AnimatePresence>
                  {isOpen && (
                    <motion.span
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="truncate"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border p-2">
        <button
          onClick={onToggle}
          className="nav-item w-full justify-center"
          title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <motion.div animate={{ rotate: isOpen ? 0 : 180 }} transition={{ duration: 0.25 }}>
            <ChevronLeft size={18} />
          </motion.div>
          <AnimatePresence>
            {isOpen && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs">
                Collapse
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  )
}
