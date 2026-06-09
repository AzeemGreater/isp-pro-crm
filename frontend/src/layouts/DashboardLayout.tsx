import { Outlet } from 'react-router-dom'
import { Sidebar }  from '../components/Sidebar'
import { TopBar }   from '../components/TopBar'
import { useState } from 'react'

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="flex h-screen bg-bg-base overflow-hidden">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />

      {/* Main area */}
      <div className={`flex flex-col flex-1 transition-all duration-300 min-w-0 ${sidebarOpen ? 'ml-64' : 'ml-16'}`}>
        <TopBar onMenuToggle={() => setSidebarOpen(o => !o)} sidebarOpen={sidebarOpen} />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
