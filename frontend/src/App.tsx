import { Routes, Route, Navigate } from 'react-router-dom'
import { DashboardLayout } from './layouts/DashboardLayout'
import { SubdealerLayout } from './layouts/SubdealerLayout'
import { LoginPage }       from './pages/Login'
import { Dashboard }       from './pages/Dashboard'
import { Subscribers }     from './pages/Subscribers'
import { SubscriberProfile } from './pages/SubscriberProfile'
import { Billing }         from './pages/Billing'
import { GenerateBills }   from './pages/GenerateBills'
import { RechargeCards }   from './pages/RechargeCards'
import { DataUsageReport } from './pages/DataUsageReport'
import { NetworkControl }  from './pages/NetworkControl'
import { WhatsAppCampaign }from './pages/WhatsAppCampaign'
import { WhatsAppServer }  from './pages/WhatsAppServer'
import { AgentPOS }        from './pages/AgentPOS'
import { Invoices }        from './pages/Invoices'
import { BulkEditor }      from './pages/BulkEditor'
import { ImportExport }    from './pages/ImportExport'
import { OnlineUsers }     from './pages/OnlineUsers'
import { OfficeExpense }   from './pages/OfficeExpense'
import { Settings }        from './pages/Settings'
import { UserManagement }  from './pages/UserManagement'
import { SubDealers }      from './pages/SubDealers'
import { PlansManager }    from './pages/PlansManager'
import { IPManager }       from './pages/IPManager'
import { OLTManager }      from './pages/OLTManager'
import { ZonesAreas }      from './pages/ZonesAreas'
import { SearchResults }   from './pages/SearchResults'
import { Reports }         from './pages/Reports'
import { AuditTrail }      from './pages/AuditTrail'
import { TicketingSLA }    from './pages/TicketingSLA'
import { OutageBroadcast } from './pages/OutageBroadcast'
import { Approvals }       from './pages/Approvals'
import { useAuth }         from './hooks/useAuth'
import { SubdealerWallet } from './pages/SubdealerWallet'
import { SubdealerProfileSettings } from './pages/SubdealerProfileSettings'
import { SubdealerDashboard } from './pages/SubdealerDashboard'

function AdminPortalRoute({ children }: { children: React.ReactNode }) {
  const { token, admin } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (admin?.role === 'Agent') return <Navigate to="/subdealer/dashboard" replace />
  return <>{children}</>
}

function SubdealerRoute({ children }: { children: React.ReactNode }) {
  const { token, admin } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (admin?.role !== 'Agent') return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={
        <AdminPortalRoute>
          <DashboardLayout />
        </AdminPortalRoute>
      }>
        <Route index                  element={<Dashboard />} />
        <Route path="subscribers"     element={<Subscribers />} />
        <Route path="subscribers/:username" element={<SubscriberProfile />} />
        <Route path="billing"         element={<Billing />} />
        <Route path="generate-bills"  element={<GenerateBills />} />
        <Route path="agent-pos"       element={<AgentPOS />} />
        <Route path="invoices"        element={<Invoices />} />
        <Route path="data-usage"      element={<DataUsageReport />} />
        <Route path="bulk-editor"     element={<BulkEditor />} />
        <Route path="import-export"   element={<ImportExport />} />
        <Route path="online-users"    element={<OnlineUsers />} />
        <Route path="recharge-cards"  element={<RechargeCards />} />
        <Route path="network-control" element={<NetworkControl />} />
        <Route path="whatsapp"        element={<Navigate to="/whatsapp-campaign" replace />} />
        <Route path="whatsapp-server" element={<WhatsAppServer />} />
        <Route path="whatsapp-campaign" element={<WhatsAppCampaign />} />
        <Route path="users"           element={<UserManagement />} />
        <Route path="subdealers"      element={<SubDealers />} />
        <Route path="plans"           element={<PlansManager />} />
        <Route path="ip-manager"      element={<IPManager />} />
        <Route path="olt-manager"     element={<OLTManager />} />
        <Route path="zones"           element={<ZonesAreas />} />
        <Route path="office-expense"  element={<OfficeExpense />} />
        <Route path="search"          element={<SearchResults />} />
        <Route path="reports"         element={<Reports />} />
        <Route path="audit"           element={<AuditTrail />} />
        <Route path="tickets"         element={<TicketingSLA />} />
        <Route path="outages"         element={<OutageBroadcast />} />
        <Route path="approvals"       element={<Approvals />} />
        <Route path="settings"        element={<Settings />} />
      </Route>
      <Route path="/subdealer" element={
        <SubdealerRoute>
          <SubdealerLayout />
        </SubdealerRoute>
      }>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<SubdealerDashboard />} />
        <Route path="generate-bills" element={<GenerateBills />} />
        <Route path="customers" element={<Subscribers />} />
        <Route path="customers/:username" element={<SubscriberProfile />} />
        <Route path="data-usage" element={<DataUsageReport />} />
        <Route path="online-users" element={<OnlineUsers />} />
        <Route path="wallet" element={<SubdealerWallet />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="profile-settings" element={<SubdealerProfileSettings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
