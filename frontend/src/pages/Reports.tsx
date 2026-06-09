import { useEffect, useMemo, useState } from 'react'
import { FileBarChart2, Download } from 'lucide-react'
import api from '../lib/api'

type SubscriberStats = { total: number; active: number; expired: number; disabled: number; expiring_today: number; expiring_3d: number }
type RevenueRow = { date: string; revenue: string }
type Agent = { id: string; full_name: string; role: string; wallet_balance: string }

function toCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = rows.map((row) => headers.map((h) => JSON.stringify(row[h] ?? '')).join(','))
  return [headers.join(','), ...lines].join('\n')
}

export function Reports() {
  const [stats, setStats] = useState<SubscriberStats | null>(null)
  const [revenue, setRevenue] = useState<RevenueRow[]>([])
  const [agents, setAgents] = useState<Agent[]>([])

  async function load() {
    const [s, r, a] = await Promise.all([
      api.get<SubscriberStats>('/subscribers/stats/overview'),
      api.get<RevenueRow[]>('/billing/revenue?days=30'),
      api.get<Agent[]>('/agents'),
    ])
    setStats(s.data)
    setRevenue(r.data)
    setAgents(a.data)
  }

  useEffect(() => {
    load().catch(() => undefined)
  }, [])

  const totalRevenue30d = useMemo(() => revenue.reduce((sum, row) => sum + Number(row.revenue || 0), 0), [revenue])

  function exportRevenue() {
    const csv = toCsv(revenue.map((r) => ({ date: r.date, revenue: Number(r.revenue || 0) })))
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'revenue_30d.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Reports Center</h1>
          <p className="text-sm text-text-muted">Executive KPIs, revenue and team performance exports</p>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => load()}>Refresh</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card"><p className="text-xs text-text-muted">Subscribers</p><p className="text-2xl font-bold text-text-primary">{stats?.total || 0}</p></div>
        <div className="stat-card"><p className="text-xs text-text-muted">Active</p><p className="text-2xl font-bold text-status-active">{stats?.active || 0}</p></div>
        <div className="stat-card"><p className="text-xs text-text-muted">Expired</p><p className="text-2xl font-bold text-status-expired">{stats?.expired || 0}</p></div>
        <div className="stat-card"><p className="text-xs text-text-muted">30D Revenue</p><p className="text-2xl font-bold text-brand-blue">Rs. {totalRevenue30d.toLocaleString()}</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-text-primary flex items-center gap-2"><FileBarChart2 size={16} /> Revenue (30 days)</div>
            <button className="btn-ghost btn-sm" onClick={exportRevenue}><Download size={14} /> CSV</button>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {revenue.map((r) => (
              <div key={r.date} className="flex justify-between text-sm border-b border-border/40 pb-1">
                <span className="text-text-muted">{new Date(r.date).toLocaleDateString()}</span>
                <span className="text-text-primary font-medium">Rs. {Number(r.revenue || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <div className="font-semibold text-text-primary mb-3">Agent Wallet & Roles</div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {agents.map((a) => (
              <div key={a.id} className="flex items-center justify-between border-b border-border/40 pb-1 text-sm">
                <div>
                  <p className="text-text-primary font-medium">{a.full_name}</p>
                  <p className="text-xs text-text-muted">{a.role}</p>
                </div>
                <p className="text-text-primary">Rs. {Number(a.wallet_balance || 0).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
