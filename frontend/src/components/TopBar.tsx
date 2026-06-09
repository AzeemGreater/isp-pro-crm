import { Menu, Bell, Search, LogOut, User, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

interface TopBarProps {
  onMenuToggle: () => void
  sidebarOpen: boolean
  settingsPath?: string
}

export function TopBar({ onMenuToggle, settingsPath = '/settings' }: TopBarProps) {
  const { admin, logout } = useAuth()
  const navigate          = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)
  const [searchVal, setSearchVal]     = useState('')

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const roleColor = {
    SuperAdmin: 'text-accent-cyan',
    Admin:      'text-accent-violet',
    Agent:      'text-status-active',
    Viewer:     'text-text-muted',
  }[admin?.role || 'Agent'] ?? 'text-text-muted'

  const displayRole = admin?.role === 'Agent' ? 'Subdealer' : (admin?.role || 'User')

  return (
    <header className="h-[72px] bg-bg-surface border-b border-border flex items-center px-6 gap-4 flex-shrink-0 z-30 sticky top-0">
      {/* Menu toggle */}
      <button onClick={onMenuToggle} className="text-text-secondary hover:text-text-primary transition-colors p-1 rounded-lg hover:bg-bg-hover">
        <Menu size={20} />
      </button>

      {/* Search */}
      <div className="flex-1 max-w-md relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
        <input
          id="global-search"
          type="text"
          placeholder="Search subscribers, PPPoE ID..."
          value={searchVal}
          onChange={e => setSearchVal(e.target.value)}
          className="input pl-9 h-9 text-sm"
        />
      </div>

      <div className="flex-1" />

      {/* Alerts bell */}
      <button className="relative text-text-secondary hover:text-text-primary transition-colors p-2 rounded-lg hover:bg-bg-hover">
        <Bell size={18} />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-status-expired rounded-full ring-2 ring-bg-surface animate-pulse" />
      </button>

      {/* Admin profile dropdown */}
      <div className="relative">
        <button
          id="profile-menu"
          onClick={() => setProfileOpen(o => !o)}
          className="flex items-center gap-3 pl-3 pr-2 py-1.5 rounded-lg hover:bg-bg-hover transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-cyan flex items-center justify-center flex-shrink-0">
            <User size={14} className="text-white" />
          </div>
          <div className="text-left hidden sm:block">
            <p className="text-xs font-semibold text-text-primary">{admin?.fullName || 'Admin'}</p>
            <p className={`text-[10px] ${roleColor}`}>{displayRole}</p>
          </div>
          <ChevronDown size={14} className="text-text-muted" />
        </button>

        <AnimatePresence>
          {profileOpen && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 w-56 card py-2 z-50"
            >
              <div className="px-3 py-2 border-b border-border mb-1">
                <p className="text-sm font-semibold text-text-primary">{admin?.fullName}</p>
                <p className="text-xs text-text-muted">@{admin?.username}</p>
                <p className="text-xs text-accent-cyan mt-0.5">
                  Balance: Rs. {admin?.walletBalance?.toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => { setProfileOpen(false); navigate(settingsPath) }}
                className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
              >
                Settings
              </button>
              <button
                onClick={handleLogout}
                className="w-full text-left px-3 py-2 text-sm text-status-expired hover:bg-bg-hover transition-colors flex items-center gap-2"
              >
                <LogOut size={14} /> Logout
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}
