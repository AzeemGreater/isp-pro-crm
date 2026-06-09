import { useEffect, useMemo, useState } from 'react'
import { Users, Wallet, Activity, AlertTriangle, RefreshCw } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../hooks/useAuth'

type Stats = {
  total: number
  active: number
  expired: number
  disabled: number
}

type LedgerSummary = {
  total_credits: number
  total_debits: number
  net_balance: number
}

type RevenuePoint = {
  date: string
  revenue: number
}

type ExpiringRow = {
  id: number
  full_name: string
  pppoe_username: string
  profile_name: string | null
  days_remaining: number
}

type OnlineSummary = {
  online_users: number
  total_download_gb: number
  total_upload_gb: number
  total_usage_gb: number
}

type WalletMeta = {
  wallet_balance: string | number
  customer_limit: number | null
  customers_used: number
  customers_remaining: number | null
}

export function SubdealerDashboard() {
  const { admin } = useAuth()
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, expired: 0, disabled: 0 })
  const [ledger, setLedger] = useState<LedgerSummary>({ total_credits: 0, total_debits: 0, net_balance: 0 })
  const [walletBalance, setWalletBalance] = useState(0)
  const [customerLimit, setCustomerLimit] = useState<number | null>(null)
  const [customersUsed, setCustomersUsed] = useState(0)
  const [customersRemaining, setCustomersRemaining] = useState<number | null>(null)
  const [revenue, setRevenue] = useState<RevenuePoint[]>([])
  const [expiring, setExpiring] = useState<ExpiringRow[]>([])
  const [online, setOnline] = useState<OnlineSummary>({ online_users: 0, total_download_gb: 0, total_upload_gb: 0, total_usage_gb: 0 })

  async function load() {
    setLoading(true)
    try {
      const [statsRes, ledgerRes, revRes, expRes, onlineRes, walletRes] = await Promise.allSettled([
        api.get<Stats>('/subscribers/stats/overview'),
        api.get<{ summary: LedgerSummary }>('/billing/ledger?page=1&limit=10'),
        api.get<RevenuePoint[]>('/billing/revenue?days=30'),
        api.get<{ data: ExpiringRow[] }>('/subscribers/insights/expiring?days=7&limit=5'),
        api.get<{ summary: OnlineSummary }>('/nas/online-users'),
        admin?.id ? api.get<WalletMeta>(`/agents/${admin.id}/wallet`) : Promise.reject(new Error('Missing admin id')),
      ])

      if (statsRes.status === 'fulfilled') {
        setStats({
          total: Number(statsRes.value.data.total || 0),
          active: Number(statsRes.value.data.active || 0),
          expired: Number(statsRes.value.data.expired || 0),
          disabled: Number(statsRes.value.data.disabled || 0),
        })
      }

      if (ledgerRes.status === 'fulfilled') {
        setLedger({
          total_credits: Number(ledgerRes.value.data.summary?.total_credits || 0),
          total_debits: Number(ledgerRes.value.data.summary?.total_debits || 0),
          net_balance: Number(ledgerRes.value.data.summary?.net_balance || 0),
        })
      }

      if (revRes.status === 'fulfilled') {
        setRevenue((revRes.value.data || []).map((x) => ({ date: x.date, revenue: Number(x.revenue || 0) })))
      }

      if (expRes.status === 'fulfilled') {
        setExpiring(expRes.value.data.data || [])
      }

      if (onlineRes.status === 'fulfilled') {
        setOnline({
          online_users: Number(onlineRes.value.data.summary?.online_users || 0),
          total_download_gb: Number(onlineRes.value.data.summary?.total_download_gb || 0),
          total_upload_gb: Number(onlineRes.value.data.summary?.total_upload_gb || 0),
          total_usage_gb: Number(onlineRes.value.data.summary?.total_usage_gb || 0),
        })
      }

      if (walletRes.status === 'fulfilled') {
        setWalletBalance(Number(walletRes.value.data.wallet_balance || 0))
        setCustomerLimit(walletRes.value.data.customer_limit)
        setCustomersUsed(Number(walletRes.value.data.customers_used || 0))
        setCustomersRemaining(
          walletRes.value.data.customers_remaining === null || walletRes.value.data.customers_remaining === undefined
            ? null
            : Number(walletRes.value.data.customers_remaining)
        )
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load().catch(() => undefined)
  }, [admin?.id])

  const monthRevenue = useMemo(() => revenue.reduce((sum, r) => sum + Number(r.revenue || 0), 0), [revenue])
  const fmt = (n: number) => `Rs. ${Number(n).toLocaleString('en-PK')}`

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Subdealer Dashboard</h1>
          <p className="text-sm text-text-muted">Your customer network, billing and usage overview</p>
        </div>
        <button onClick={() => load()} className="btn-ghost btn-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="stat-card"><p className="text-xs text-text-muted">Total Customers</p><p className="text-2xl font-bold text-accent-cyan">{stats.total}</p></div>
        <div className="stat-card"><p className="text-xs text-text-muted">Active</p><p className="text-2xl font-bold text-status-active">{stats.active}</p></div>
        <div className="stat-card"><p className="text-xs text-text-muted">Expired</p><p className="text-2xl font-bold text-status-warning">{stats.expired}</p></div>
        <div className="stat-card"><p className="text-xs text-text-muted">Disabled</p><p className="text-2xl font-bold text-status-expired">{stats.disabled}</p></div>
        <div className="stat-card">
          <p className="text-xs text-text-muted">Customer Limit</p>
          <p className="text-2xl font-bold text-brand-blue">
            {customerLimit === null ? 'Unlimited' : `${customersUsed}/${customerLimit}`}
          </p>
          <p className="text-xs text-text-muted mt-1">
            Remaining: {customersRemaining === null ? 'Unlimited' : customersRemaining}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-muted">Wallet Balance</p>
            <Wallet size={16} className="text-accent-cyan" />
          </div>
          <p className="text-2xl font-bold text-accent-cyan mt-1">{fmt(walletBalance)}</p>
          <p className="text-xs text-text-muted mt-1">Credits {fmt(ledger.total_credits)} · Debits {fmt(ledger.total_debits)}</p>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-muted">Revenue (30d)</p>
            <Users size={16} className="text-status-active" />
          </div>
          <p className="text-2xl font-bold text-status-active mt-1">{fmt(monthRevenue)}</p>
          <p className="text-xs text-text-muted mt-1">From your scoped billing records</p>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-muted">Online Users</p>
            <Activity size={16} className="text-brand-blue" />
          </div>
          <p className="text-2xl font-bold text-brand-blue mt-1">{online.online_users}</p>
          <p className="text-xs text-text-muted mt-1">Usage {online.total_usage_gb} GB</p>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={16} className="text-status-warning" />
          <h3 className="font-semibold text-text-primary">Expiring Soon (7 days)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Username</th>
                <th>Package</th>
                <th>Days Left</th>
              </tr>
            </thead>
            <tbody>
              {expiring.map((row) => (
                <tr key={row.id}>
                  <td>{row.full_name}</td>
                  <td className="font-mono text-xs">{row.pppoe_username}</td>
                  <td>{row.profile_name || 'N/A'}</td>
                  <td className={row.days_remaining <= 1 ? 'text-status-expired' : 'text-status-warning'}>{row.days_remaining}</td>
                </tr>
              ))}
              {expiring.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-text-muted">No expiring subscribers in the selected window.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
