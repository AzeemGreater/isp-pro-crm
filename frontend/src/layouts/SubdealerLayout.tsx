import { Outlet } from 'react-router-dom'
import { useState } from 'react'
import { TopBar } from '../components/TopBar'
import { SubdealerSidebar } from '../components/SubdealerSidebar'

export function SubdealerLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="flex h-screen bg-bg-base overflow-hidden">
      <SubdealerSidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen((o) => !o)} />

      <div className={`flex flex-col flex-1 transition-all duration-300 min-w-0 ${sidebarOpen ? 'ml-64' : 'ml-16'}`}>
        <TopBar onMenuToggle={() => setSidebarOpen((o) => !o)} sidebarOpen={sidebarOpen} settingsPath="/subdealer/profile-settings" />

        <main className="flex-1 overflow-y-auto p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
