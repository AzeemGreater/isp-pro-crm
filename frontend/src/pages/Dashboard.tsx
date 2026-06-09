import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Users, TrendingUp, AlertTriangle, WifiOff, Activity, RefreshCw, Wallet, UserCheck, MessageSquareWarning, Clock3, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts'
import api from '../lib/api'

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color, glowClass }:
  { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string; glowClass?: string }
) {
  return (
    <motion.div whileHover={{ y: -2 }} className={`stat-card ${glowClass}`}>
      <div className="glow-line" />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider">{label}</p>
          <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
          {sub && <p className="text-xs text-text-muted mt-1">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-xl bg-bg-hover`}>
          <Icon size={20} className={color} />
        </div>
      </div>
    </motion.div>
  )
}

// ─── Revenue Chart ────────────────────────────────────────────────────────────
function RevenueChart({ data }: { data: { date: string; revenue: number }[] }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-text-primary">Revenue Analytics</h3>
          <p className="text-xs text-text-muted mt-0.5">Daily collection — last 30 days</p>
        </div>
        <TrendingUp size={18} className="text-accent-cyan" />
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="rgb(var(--brand-blue))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="rgb(var(--brand-blue))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
          <XAxis dataKey="date" tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
          <Tooltip
            contentStyle={{ background: 'rgb(var(--bg-surface))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: 'rgb(var(--text-secondary))' }} itemStyle={{ color: 'rgb(var(--brand-blue))' }}
            formatter={(v: number) => [`Rs. ${v.toLocaleString()}`, 'Revenue']}
          />
          <Area type="monotone" dataKey="revenue" stroke="rgb(var(--brand-blue))" strokeWidth={2.5}
            fill="url(#revenueGrad)" dot={false} activeDot={{ r: 4, fill: 'rgb(var(--brand-blue))' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Subscriber Doughnut ──────────────────────────────────────────────────────
const DONUT_COLORS = ['rgb(var(--brand-green))', 'rgb(var(--brand-red))', 'rgb(var(--status-disabled))']
const DONUT_LABELS = ['Active', 'Expired', 'Disabled']

function SubscriberDoughnut({ stats }: { stats: Record<string, number> }) {
  const data = [
    { name: 'Active',   value: stats.active   || 0 },
    { name: 'Expired',  value: stats.expired  || 0 },
    { name: 'Disabled', value: stats.disabled || 0 },
  ]
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-text-primary">Subscriber Ecosystem</h3>
          <p className="text-xs text-text-muted mt-0.5">Status distribution</p>
        </div>
        <Users size={18} className="text-accent-violet" />
      </div>
      <div className="relative flex items-center justify-center">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={85}
              paddingAngle={3} dataKey="value" strokeWidth={0}>
              {data.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i]} />)}
            </Pie>
            <Tooltip contentStyle={{ background: 'rgb(var(--bg-surface))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center text overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-3xl font-bold text-text-primary">{total.toLocaleString()}</p>
          <p className="text-xs text-text-muted">Total</p>
        </div>
      </div>
      <div className="flex justify-center gap-4 mt-2">
        {DONUT_LABELS.map((l, i) => (
          <div key={l} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: DONUT_COLORS[i] }} />
            <span className="text-xs text-text-muted">{l} ({data[i].value})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Live Traffic Monitor ─────────────────────────────────────────────────────
const MAX_POINTS = 30

function TrafficMonitor() {
  const [traffic, setTraffic] = useState<{ time: string; rx: number; tx: number }[]>([])
  const [nasId, setNasId] = useState<string | null>(null)

  useEffect(() => {
    api.get<Array<{ id: number }>>('/nas/list')
      .then((res) => setNasId(res.data?.[0]?.id ? String(res.data[0].id) : null))
      .catch(() => setNasId(null))
  }, [])

  const fetchTraffic = useCallback(async () => {
    if (!nasId) {
      const point = {
        time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        rx: 0,
        tx: 0,
      }
      setTraffic(prev => [...prev.slice(-MAX_POINTS + 1), point])
      return
    }

    try {
      const res = await api.get<{ interfaces: { rx_mbps: number; tx_mbps: number }[] }>(`/nas/${nasId}/live-stats`)
      const iface = res.data?.interfaces?.[0]
      const point = {
        time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        rx: iface?.rx_mbps ?? 0,
        tx: iface?.tx_mbps ?? 0,
      }
      setTraffic(prev => [...prev.slice(-MAX_POINTS + 1), point])
    } catch {
      const point = {
        time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        rx: 0,
        tx: 0,
      }
      setTraffic(prev => [...prev.slice(-MAX_POINTS + 1), point])
    }
  }, [nasId])

  useEffect(() => {
    fetchTraffic()
    const id = setInterval(fetchTraffic, 1000)
    return () => clearInterval(id)
  }, [fetchTraffic])

  const chartData = useMemo(() => traffic, [traffic])

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <span className="w-2 h-2 bg-status-active rounded-full animate-pulse-slow" />
            Live Traffic Monitor
          </h3>
          <p className="text-xs text-text-muted mt-0.5">RX / TX — updates every 1s</p>
        </div>
        <Activity size={18} className="text-status-active" />
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
          <XAxis dataKey="time" tick={{ fill: 'rgb(var(--text-muted))', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}M`} />
          <Tooltip contentStyle={{ background: 'rgb(var(--bg-surface))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 12 }}
            formatter={(v: number, name: string) => [`${v.toFixed(2)} Mbps`, name === 'rx' ? '↓ Download' : '↑ Upload']} />
          <Legend formatter={v => <span className="text-xs text-text-muted">{v === 'rx' ? '↓ Download' : '↑ Upload'}</span>} />
          <Line type="monotone" dataKey="rx" stroke="rgb(var(--brand-blue))" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="tx" stroke="rgb(var(--brand-green))" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Record<string, number>>({})
  const [revenue, setRevenue] = useState<{ date: string; revenue: number }[]>([])
  const [agents, setAgents] = useState<Array<{ id: string; full_name: string; wallet_balance: string; role: string }>>([])
  const [waLogs, setWaLogs] = useState<Array<{ id: string; status: string; message_type: string }>>([])
  const [ledgerSummary, setLedgerSummary] = useState<{ total_credits: string; total_debits: string; net_balance: string } | null>(null)
  const [serverHealth, setServerHealth] = useState<{ status: string; uptime_seconds: number; memory_mb: number; database?: { connected?: boolean } } | null>(null)
  const [partnerRadar, setPartnerRadar] = useState<{ subdealers: number; users: number; online: number; expired: number }>({ subdealers: 0, users: 0, online: 0, expired: 0 })
  const [usageTop, setUsageTop] = useState<Array<{ full_name: string; username: string; total_gb: number; download_gb: number; upload_gb: number }>>([])
  const [expiringSoon, setExpiringSoon] = useState<Array<{
    id: number
    full_name: string
    pppoe_username: string
    zone_name: string | null
    profile_name: string | null
    days_remaining: number
  }>>([])
  const [loading, setLoading] = useState(true)
  const [globalQuery, setGlobalQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [globalResults, setGlobalResults] = useState<Array<{ type: string; label: string; sub?: string; path: string }>>([])

  const runGlobalSearch = useCallback(async (query: string) => {
    const q = query.trim()
    if (q.length < 2) {
      setGlobalResults([])
      return
    }

    setSearching(true)
    try {
      const [subRes, invRes, agentRes, nasRes, oltRes] = await Promise.all([
        api.get<{ data: Array<{ id: number; full_name: string; pppoe_username: string }> }>('/subscribers', { params: { search: q, limit: 4 } }),
        api.get<{ data: Array<{ invoice_number: string; amount: string; subscriber_name: string }> }>('/billing/invoices', { params: { search: q, limit: 4 } }),
        api.get<Array<{ id: string; full_name: string; username: string }>>('/agents'),
        api.get<Array<{ id: string; name: string; ip_address: string }>>('/network/nas'),
        api.get<Array<{ id: string; name: string; ip_address: string }>>('/network/olt'),
      ])

      const subItems = (subRes.data.data || []).map((s) => ({ type: 'Subscriber', label: s.full_name, sub: s.pppoe_username, path: '/subscribers' }))
      const invItems = (invRes.data.data || []).map((i) => ({ type: 'Invoice', label: i.invoice_number, sub: `${i.subscriber_name} · Rs. ${Number(i.amount || 0).toLocaleString()}`, path: '/invoices' }))
      const agentItems = (agentRes.data || [])
        .filter((a) => `${a.full_name} ${a.username}`.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 4)
        .map((a) => ({ type: 'Agent', label: a.full_name, sub: a.username, path: '/subdealers' }))
      const nasItems = (nasRes.data || [])
        .filter((n) => `${n.name} ${n.ip_address}`.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 3)
        .map((n) => ({ type: 'NAS', label: n.name, sub: n.ip_address, path: '/ip-manager' }))
      const oltItems = (oltRes.data || [])
        .filter((o) => `${o.name} ${o.ip_address}`.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 3)
        .map((o) => ({ type: 'OLT', label: o.name, sub: o.ip_address, path: '/olt-manager' }))

      setGlobalResults([...subItems, ...invItems, ...agentItems, ...nasItems, ...oltItems].slice(0, 12))
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      void runGlobalSearch(globalQuery)
    }, 300)
    return () => clearTimeout(t)
  }, [globalQuery, runGlobalSearch])

  function openSearchPage() {
    const value = globalQuery.trim()
    if (!value) return
    navigate(`/search?q=${encodeURIComponent(value)}`)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, revRes, expiringRes, agentsRes, waRes, ledgerRes, healthRes, subdealerRes, usageRes] = await Promise.all([
        api.get<Record<string, number>>('/subscribers/stats/overview'),
        api.get<{ date: string; revenue: number }[]>('/billing/revenue?days=30'),
        api.get<{ data: Array<{ id: number; full_name: string; pppoe_username: string; zone_name: string | null; profile_name: string | null; days_remaining: number }> }>('/subscribers/insights/expiring?days=7&limit=6'),
        api.get<Array<{ id: string; full_name: string; wallet_balance: string; role: string }>>('/agents'),
        api.get<Array<{ id: string; status: string; message_type: string }>>('/whatsapp/logs?limit=30'),
        api.get<{ summary: { total_credits: string; total_debits: string; net_balance: string } }>('/billing/ledger?page=1&limit=10'),
        api.get<{ status: string; uptime_seconds: number; memory_mb: number; database?: { connected?: boolean } }>('/health'),
        api.get<Array<{ total_users: number; online_users: number; expired_users: number }>>('/agents/subdealers/overview'),
        api.get<{ data: Array<{ full_name: string; username: string; total_gb: number; download_gb: number; upload_gb: number }> }>('/nas/usage-report?days=30'),
      ])
      setStats(statsRes.data)
      setRevenue(revRes.data)
      setExpiringSoon(expiringRes.data?.data || [])
      setAgents(agentsRes.data || [])
      setWaLogs(waRes.data || [])
      setLedgerSummary(ledgerRes.data?.summary || null)
      setServerHealth(healthRes.data)
      setPartnerRadar({
        subdealers: (subdealerRes.data || []).length,
        users: (subdealerRes.data || []).reduce((a, b) => a + Number(b.total_users || 0), 0),
        online: (subdealerRes.data || []).reduce((a, b) => a + Number(b.online_users || 0), 0),
        expired: (subdealerRes.data || []).reduce((a, b) => a + Number(b.expired_users || 0), 0),
      })
      setUsageTop((usageRes.data?.data || []).slice(0, 8))
    } catch { /* use empty data */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const todayIso = new Date().toISOString().slice(0, 10)
  const todayRevenue = revenue.filter((r) => r.date.slice(0, 10) === todayIso).reduce((s, r) => s + Number(r.revenue || 0), 0)
  const failedMessages = waLogs.filter((l) => l.status === 'failed').length
  const sentMessages = waLogs.filter((l) => l.status === 'sent').length
  const now = new Date()
  const date12h = now.toLocaleString('en-US', {
    hour12: true,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const topAgents = [...agents]
    .filter((a) => a.role === 'Agent' || a.role === 'Admin')
    .sort((a, b) => Number(b.wallet_balance || 0) - Number(a.wallet_balance || 0))
    .slice(0, 5)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Command Center</h1>
          <p className="text-sm text-text-muted mt-0.5">Real-time ISP operations overview</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-xs text-text-muted mb-1">Time & Date (12H)</p>
          <div className="flex items-center gap-2">
            <Clock3 size={16} className="text-accent-cyan" />
            <p className="text-sm font-semibold text-text-primary">{date12h}</p>
          </div>
        </div>

        <div className="card p-4">
          <p className="text-xs text-text-muted mb-1">Server Node Health</p>
          <div className="space-y-1 text-sm">
            <p className="text-text-primary">Status: <span className={serverHealth?.status === 'healthy' ? 'text-status-active' : 'text-status-expired'}>{serverHealth?.status || 'unknown'}</span></p>
            <p className="text-text-muted">DB: {serverHealth?.database?.connected ? 'Connected' : 'Unknown'}</p>
            <p className="text-text-muted">Uptime: {Math.floor((serverHealth?.uptime_seconds || 0) / 3600)}h</p>
            <p className="text-text-muted">Memory: {serverHealth?.memory_mb || 0} MB</p>
          </div>
        </div>

        <div className="card p-4">
          <p className="text-xs text-text-muted mb-1">Partner Network Radar</p>
          <div className="space-y-1 text-sm">
            <p className="text-text-muted">Subdealers: <span className="text-text-primary">{partnerRadar.subdealers}</span></p>
            <p className="text-text-muted">Users: <span className="text-text-primary">{partnerRadar.users}</span></p>
            <p className="text-text-muted">Online: <span className="text-status-active">{partnerRadar.online}</span></p>
            <p className="text-text-muted">Expired: <span className="text-status-warning">{partnerRadar.expired}</span></p>
          </div>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              className="input pl-8"
              value={globalQuery}
              onChange={(e) => setGlobalQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && openSearchPage()}
              placeholder="Search everywhere: subscriber, invoice, PPPoE, agent, NAS, OLT..."
            />
          </div>
          <button className="btn-primary btn-sm" onClick={openSearchPage}>Search</button>
          <button className="btn-primary btn-sm" onClick={() => navigate('/subscribers?new=1')}>Add User</button>
        </div>
        {globalQuery.trim().length >= 2 && (
          <div className="space-y-2">
            {searching ? <p className="text-xs text-text-muted">Searching...</p> : null}
            {!searching && globalResults.length === 0 ? <p className="text-xs text-text-muted">No matching records</p> : null}
            {globalResults.map((r, idx) => (
              <a key={`${r.type}-${idx}`} href={r.path} className="block rounded-lg border border-border p-2 hover:bg-bg-hover transition-colors">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-text-primary">{r.label}</p>
                  <span className="text-[10px] text-accent-cyan uppercase tracking-wide">{r.type}</span>
                </div>
                {r.sub ? <p className="text-xs text-text-muted mt-0.5">{r.sub}</p> : null}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Subscribers" value={parseInt(String(stats.total || 0)).toLocaleString()}
          sub={`${stats.expiring_3d || 0} expiring in 3 days`} icon={Users} color="text-accent-cyan" glowClass="hover:shadow-glow-cyan" />
        <KpiCard label="Active" value={stats.active || 0}
          sub="Currently online" icon={Activity} color="text-status-active" glowClass="hover:shadow-glow-green" />
        <KpiCard label="Expiring Today" value={stats.expiring_today || 0}
          sub="Require immediate renewal" icon={AlertTriangle} color="text-status-warning" />
        <KpiCard label="Expired" value={stats.expired || 0}
          sub="RADIUS access blocked" icon={WifiOff} color="text-status-expired" glowClass="hover:shadow-glow-red" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2"><RevenueChart data={revenue} /></div>
        <SubscriberDoughnut stats={stats} />
      </div>

      {/* Live traffic */}
      <TrafficMonitor />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-text-primary">Revenue & Quick Controls</h3>
            <Wallet size={16} className="text-accent-cyan" />
          </div>
          <div className="space-y-2 text-sm mb-4">
            <div className="flex justify-between"><span className="text-text-muted">Collected Today</span><span className="font-medium text-brand-blue">Rs. {todayRevenue.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Net Balance</span><span className="font-semibold text-status-active">Rs. {Number(ledgerSummary?.net_balance || 0).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Total Debits</span><span className="text-text-primary">Rs. {Number(ledgerSummary?.total_debits || 0).toLocaleString()}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <a href="/generate-bills" className="btn-primary btn-sm justify-center">Generate Bills</a>
            <a href="/agent-pos" className="btn-primary btn-sm justify-center">Agent POS</a>
            <a href="/invoices" className="btn-ghost btn-sm justify-center">Invoices</a>
            <a href="/office-expense" className="btn-ghost btn-sm justify-center">Office Expense</a>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-text-primary">Network Traffic Intelligence Center</h3>
            <Activity size={16} className="text-status-active" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted border-b border-border">
                  <th className="py-2">Subscriber</th>
                  <th className="py-2">Down GB</th>
                  <th className="py-2">Up GB</th>
                  <th className="py-2">Total GB</th>
                </tr>
              </thead>
              <tbody>
                {usageTop.map((u, idx) => (
                  <tr key={`${u.username}-${idx}`} className="border-b border-border/40">
                    <td className="py-2">
                      <p className="text-text-primary text-xs font-medium">{u.full_name}</p>
                      <p className="text-text-muted text-[10px] font-mono">{u.username}</p>
                    </td>
                    <td className="py-2 text-text-muted">{Number(u.download_gb || 0).toFixed(2)}</td>
                    <td className="py-2 text-text-muted">{Number(u.upload_gb || 0).toFixed(2)}</td>
                    <td className="py-2 text-text-primary font-medium">{Number(u.total_gb || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {usageTop.length === 0 ? <p className="text-xs text-text-muted py-2">No usage data yet.</p> : null}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-text-primary">Expiring In Next 7 Days</h3>
          <span className="text-xs text-text-muted">{expiringSoon.length} subscribers</span>
        </div>
        {expiringSoon.length === 0 ? (
          <p className="text-sm text-text-muted">No renewals due in the next 7 days.</p>
        ) : (
          <div className="space-y-2">
            {expiringSoon.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border border-border/70 bg-bg-surface px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-text-primary">{item.full_name} <span className="text-text-muted">({item.pppoe_username})</span></p>
                  <p className="text-xs text-text-muted">{item.profile_name || 'N/A'} • {item.zone_name || 'No Zone'}</p>
                </div>
                <span className={`text-xs font-semibold ${item.days_remaining <= 0 ? 'text-status-expired' : item.days_remaining <= 3 ? 'text-status-warning' : 'text-brand-blue'}`}>
                  {item.days_remaining <= 0 ? 'Expired' : `${item.days_remaining}d left`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2 text-text-primary font-semibold"><Wallet size={16} /> Revenue Radar</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-text-muted">Collected Today</span><span className="font-medium text-brand-blue">Rs. {todayRevenue.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Total Credits</span><span className="text-text-primary">Rs. {Number(ledgerSummary?.total_credits || 0).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Total Debits</span><span className="text-text-primary">Rs. {Number(ledgerSummary?.total_debits || 0).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Net Balance</span><span className="font-semibold text-status-active">Rs. {Number(ledgerSummary?.net_balance || 0).toLocaleString()}</span></div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2 text-text-primary font-semibold"><UserCheck size={16} /> Agent Leaderboard</div>
          <div className="space-y-2">
            {topAgents.map((a, idx) => (
              <div key={a.id} className="flex items-center justify-between text-sm border-b border-border/40 pb-1">
                <span className="text-text-primary">{idx + 1}. {a.full_name}</span>
                <span className="text-text-muted">Rs. {Number(a.wallet_balance || 0).toLocaleString()}</span>
              </div>
            ))}
            {topAgents.length === 0 && <p className="text-sm text-text-muted">No agent data available.</p>}
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2 text-text-primary font-semibold"><MessageSquareWarning size={16} /> Campaign & Queue</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-text-muted">Messages Sent</span><span className="text-status-active">{sentMessages}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Messages Failed</span><span className="text-status-expired">{failedMessages}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Renewals Due (7d)</span><span className="text-status-warning">{expiringSoon.length}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Queue Health</span><span className={failedMessages > 0 ? 'text-status-warning' : 'text-status-active'}>{failedMessages > 0 ? 'Attention Needed' : 'Healthy'}</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}
