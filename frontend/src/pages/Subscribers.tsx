import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Plus,
  Search,
  RefreshCw,
  Loader2,
  UserCheck,
  UserX,
  Wifi,
  WifiOff,
  Edit2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Filter,
  Trash2,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { NewSubscriberWizard } from '../components/subscribers/NewSubscriberWizard'
import { EditSubscriberDrawer } from '../components/subscribers/EditSubscriberDrawer'
import toast from 'react-hot-toast'

type Subscriber = {
  id: number
  full_name: string
  pppoe_username: string
  mobile: string
  zone_name: string
  profile_name: string
  retail_price: number
  download_speed: number
  upload_speed: number
  expiration_date: string
  days_remaining: number
  status: string
  nas_name: string
  agent_username: string
  agent_id?: string
  profile_id?: string
}

type SubscriberStats = {
  total: number
  active: number
  expired: number
  disabled: number
}

type AdminUser = {
  id: string
  username: string
  full_name: string
  role: string
  role_label?: string
}

type Profile = {
  id: number
  name: string
}

type Filters = {
  search: string
  agent_id: string
  status: string
  profile_id: string
  limit: string
}

type QuickActionConfirm = {
  type: 'renew' | 'status' | 'delete'
  title: string
  confirmLabel: string
  details: string[]
  subscriber: Subscriber
  nextStatus?: 'Active' | 'Disabled'
}

function LifecycleBar({ days, validity = 30 }: { days: number; validity?: number }) {
  const pct = Math.max(0, Math.min(100, (days / validity) * 100))
  const color = pct > 50 ? 'bg-status-active' : pct > 20 ? 'bg-status-warning' : 'bg-status-expired'
  return (
    <div className="w-full">
      <div className="flex justify-between text-[10px] text-text-muted mb-1">
        <span>{days > 0 ? `${days} days left` : 'Expired'}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 bg-bg-hover rounded-full overflow-hidden">
        <motion.div className={`h-full rounded-full ${color}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7 }} />
      </div>
    </div>
  )
}

function speedText(kbps?: number) {
  if (!kbps) return '0 Mbps'
  const mbps = kbps / 1024
  return `${mbps.toFixed(mbps >= 10 ? 0 : 1)} Mbps`
}

export function Subscribers() {
  const { admin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isSubdealer = admin?.role === 'Agent' || location.pathname.startsWith('/subdealer')
  const [data, setData] = useState<Subscriber[]>([])
  const [stats, setStats] = useState<SubscriberStats>({ total: 0, active: 0, expired: 0, disabled: 0 })
  const [agents, setAgents] = useState<AdminUser[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editingSub, setEditingSub] = useState<Subscriber | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [quickActionConfirm, setQuickActionConfirm] = useState<QuickActionConfirm | null>(null)
  const [quickActionLoading, setQuickActionLoading] = useState(false)
  const [walletBalance, setWalletBalance] = useState<number>(Number(admin?.walletBalance || 0))

  const [draftFilters, setDraftFilters] = useState<Filters>({
    search: '',
    agent_id: '',
    status: '',
    profile_id: '',
    limit: '20',
  })
  const [appliedFilters, setAppliedFilters] = useState<Filters>({
    search: '',
    agent_id: '',
    status: '',
    profile_id: '',
    limit: '20',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: appliedFilters.limit,
      })
      if (appliedFilters.search) params.set('search', appliedFilters.search)
      if (appliedFilters.agent_id) params.set('agent_id', appliedFilters.agent_id)
      if (appliedFilters.status) params.set('status', appliedFilters.status)
      if (appliedFilters.profile_id) params.set('profile_id', appliedFilters.profile_id)

      const [subsRes, statsRes] = await Promise.all([
        api.get<{ data: Subscriber[]; pagination: { total: number; pages: number } }>(`/subscribers?${params.toString()}`),
        api.get<SubscriberStats>('/subscribers/stats/overview'),
      ])

      setData(subsRes.data.data)
      setTotal(subsRes.data.pagination.total)
      setPages(subsRes.data.pagination.pages)
      setStats({
        total: Number(statsRes.data.total || 0),
        active: Number(statsRes.data.active || 0),
        expired: Number(statsRes.data.expired || 0),
        disabled: Number(statsRes.data.disabled || 0),
      })

      if (isSubdealer && admin?.id) {
        const walletRes = await api.get<{ wallet_balance: string | number }>(`/agents/${admin.id}/wallet`)
        setWalletBalance(Number(walletRes.data.wallet_balance || 0))
      }

      setSelected(new Set())
    } finally {
      setLoading(false)
    }
  }, [admin?.id, appliedFilters, isSubdealer, page])

  useEffect(() => {
    load().catch(() => undefined)
  }, [load])

  useEffect(() => {
    if (isSubdealer) {
      api.get<Array<{ id: number; name: string }>>('/network/profiles').then((p) => {
        setProfiles(p.data)
      }).catch(() => undefined)
      return
    }

    Promise.all([
      api.get<AdminUser[]>('/agents'),
      api.get<Array<{ id: number; name: string }>>('/network/profiles'),
    ]).then(([a, p]) => {
      setAgents(a.data)
      setProfiles(p.data)
    }).catch(() => undefined)
  }, [isSubdealer])

  useEffect(() => {
    const sp = new URLSearchParams(location.search)
    if (sp.get('new') === '1') {
      setWizardOpen(true)
      sp.delete('new')
      const next = sp.toString()
      const base = location.pathname.startsWith('/subdealer') ? '/subdealer/customers' : '/subscribers'
      navigate(next ? `${base}?${next}` : base, { replace: true })
    }
  }, [location.pathname, location.search, navigate])

  function openSearchPageFromSubscribers() {
    const value = draftFilters.search.trim()
    if (!value) return
    navigate(`/search?q=${encodeURIComponent(value)}`)
  }

  function openUserPage(username: string) {
    const value = String(username || '').trim()
    if (!value) return
    const base = location.pathname.startsWith('/subdealer') ? '/subdealer/customers' : '/subscribers'
    navigate(`${base}/${encodeURIComponent(value)}`)
  }

  function applyFilters() {
    setAppliedFilters(draftFilters)
    setPage(1)
  }

  async function handleStatusChange(id: number, status: string) {
    await api.patch(`/subscribers/${id}/status`, { status })
    toast.success(`Subscriber status changed to ${status}`)
    await load()
  }

  async function handleRenew(id: number) {
    await api.post(`/subscribers/${id}/renew`, { payment_method: isSubdealer ? 'Wallet' : 'Cash' })
    toast.success(isSubdealer ? 'Subscriber renewed from wallet balance' : 'Subscriber renewed successfully')
    await load()
  }

  async function handleDelete(id: number) {
    await api.delete(`/subscribers/${id}`)
    toast.success('Subscriber deleted')
    await load()
  }

  function openRenewConfirm(sub: Subscriber) {
    setQuickActionConfirm({
      type: 'renew',
      title: 'Confirm Renewal',
      confirmLabel: 'Confirm Renew',
      subscriber: sub,
      details: [
        `User: ${sub.full_name}`,
        `Username: ${sub.pppoe_username}`,
        `Package: ${sub.profile_name || 'N/A'} (Rs. ${Number(sub.retail_price || 0).toLocaleString()})`,
        `Current Expiry: ${sub.expiration_date}`,
        `Payment Method: ${isSubdealer ? 'Wallet Balance' : 'Cash'}`,
        ...(isSubdealer ? [`Available Wallet: Rs. ${Number(walletBalance || 0).toLocaleString()}`] : []),
      ],
    })
  }

  function openStatusConfirm(sub: Subscriber) {
    const nextStatus: 'Active' | 'Disabled' = sub.status === 'Active' ? 'Disabled' : 'Active'
    setQuickActionConfirm({
      type: 'status',
      title: `Confirm ${nextStatus}`,
      confirmLabel: `Set ${nextStatus}`,
      subscriber: sub,
      nextStatus,
      details: [
        `User: ${sub.full_name}`,
        `Username: ${sub.pppoe_username}`,
        `Current Status: ${sub.status}`,
        `New Status: ${nextStatus}`,
      ],
    })
  }

  function openDeleteConfirm(sub: Subscriber) {
    setQuickActionConfirm({
      type: 'delete',
      title: 'Confirm Permanent Delete',
      confirmLabel: 'Delete Permanently',
      subscriber: sub,
      details: [
        `User: ${sub.full_name}`,
        `Username: ${sub.pppoe_username}`,
        `Mobile: ${sub.mobile}`,
        'This action is irreversible and will remove subscriber records.',
      ],
    })
  }

  async function runQuickActionConfirm() {
    if (!quickActionConfirm) return
    setQuickActionLoading(true)
    try {
      if (quickActionConfirm.type === 'renew') {
        if (isSubdealer) {
          const required = Number(quickActionConfirm.subscriber.retail_price || 0)
          const available = Number(walletBalance || 0)
          if (available < required) {
            toast.error(`Insufficient wallet balance. Required Rs. ${required.toLocaleString()}, available Rs. ${available.toLocaleString()}`)
            return
          }
        }
        await handleRenew(quickActionConfirm.subscriber.id)
      } else if (quickActionConfirm.type === 'status') {
        await handleStatusChange(quickActionConfirm.subscriber.id, quickActionConfirm.nextStatus || 'Disabled')
      } else if (quickActionConfirm.type === 'delete') {
        await handleDelete(quickActionConfirm.subscriber.id)
      }
      setQuickActionConfirm(null)
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Action failed. Please try again.'
      toast.error(message)
    } finally {
      setQuickActionLoading(false)
    }
  }

  async function bulkSetStatus(status: 'Active' | 'Disabled') {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    await api.post('/subscribers/bulk/apply', { ids, updates: { status } })
    toast.success(`${ids.length} subscribers set to ${status}`)
    await load()
  }

  async function bulkRenew() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    await api.post('/subscribers/bulk/renew', { ids })
    toast.success(`Renewal processed for ${ids.length} subscribers`)
    await load()
  }

  async function bulkDelete() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (!window.confirm(`Delete ${ids.length} selected subscribers?`)) return
    await api.post('/subscribers/bulk/delete', { ids })
    toast.success(`Deleted ${ids.length} subscribers`)
    await load()
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllCurrentPage() {
    const allIds = data.map((d) => d.id)
    const allSelected = allIds.every((id) => selected.has(id))
    setSelected(() => {
      if (allSelected) return new Set<number>()
      return new Set<number>(allIds)
    })
  }

  const totalForChart = Math.max(1, stats.total)
  const activePct = Math.round((stats.active / totalForChart) * 100)
  const expiredPct = Math.round((stats.expired / totalForChart) * 100)
  const disabledPct = Math.max(0, 100 - activePct - expiredPct)

  const chartStroke = 2 * Math.PI * 52
  const activeStroke = (activePct / 100) * chartStroke
  const expiredStroke = (expiredPct / 100) * chartStroke
  const disabledStroke = (disabledPct / 100) * chartStroke

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="card p-4 xl:col-span-1">
          <div className="text-sm font-semibold text-text-primary mb-3">Network Overview</div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
                <circle cx="70" cy="70" r="52" stroke="rgb(var(--border))" strokeWidth="14" fill="none" />
                <circle cx="70" cy="70" r="52" stroke="rgb(var(--status-active))" strokeWidth="14" fill="none" strokeDasharray={`${activeStroke} ${chartStroke}`} strokeLinecap="round" />
                <circle cx="70" cy="70" r="52" stroke="rgb(var(--status-warning))" strokeWidth="14" fill="none" strokeDasharray={`${expiredStroke} ${chartStroke}`} strokeDashoffset={-activeStroke} strokeLinecap="round" />
                <circle cx="70" cy="70" r="52" stroke="rgb(var(--status-expired))" strokeWidth="14" fill="none" strokeDasharray={`${disabledStroke} ${chartStroke}`} strokeDashoffset={-(activeStroke + expiredStroke)} strokeLinecap="round" />
              </svg>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-status-active" /> Active Now ({stats.active})</div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-status-warning" /> Expired ({stats.expired})</div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-status-expired" /> Disabled ({stats.disabled})</div>
            </div>
          </div>
        </div>

        <div className="xl:col-span-2 grid grid-cols-2 gap-3">
          <div className="card p-4"><div className="text-3xl font-bold text-accent-cyan">{stats.total}</div><div className="text-xs text-text-muted">Total Clients</div></div>
          <div className="card p-4"><div className="text-3xl font-bold text-status-active">{stats.active}</div><div className="text-xs text-text-muted">Active Now</div></div>
          <div className="card p-4"><div className="text-3xl font-bold text-status-warning">{stats.expired}</div><div className="text-xs text-text-muted">Expired</div></div>
          <div className="card p-4"><div className="text-3xl font-bold text-status-expired">{stats.disabled}</div><div className="text-xs text-text-muted">Disabled</div></div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Network Subscribers</h1>
        <button onClick={() => setWizardOpen(true)} className="btn-primary hidden md:inline-flex">
          <Plus size={16} /> Add Client
        </button>
      </div>

      <div className="card p-3 grid grid-cols-1 md:grid-cols-6 gap-2 items-center">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={14} />
          <input
            value={draftFilters.search}
            onChange={(e) => setDraftFilters((f) => ({ ...f, search: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && openSearchPageFromSubscribers()}
            placeholder="Search ID Card, Name, Phone..."
            className="input pl-8 h-9 text-sm"
          />
        </div>

        <button onClick={() => setWizardOpen(true)} className="btn-primary btn-sm md:hidden">
          <Plus size={14} /> Add Client
        </button>

        {!isSubdealer && (
          <select className="select h-9 text-sm" value={draftFilters.agent_id} onChange={(e) => setDraftFilters((f) => ({ ...f, agent_id: e.target.value }))}>
            <option value="">All Dealers</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.full_name}</option>
            ))}
          </select>
        )}

        <select className="select h-9 text-sm" value={draftFilters.status} onChange={(e) => setDraftFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Expired">Expired</option>
          <option value="Disabled">Disabled</option>
          <option value="Suspended">Suspended</option>
        </select>

        <select className="select h-9 text-sm" value={draftFilters.profile_id} onChange={(e) => setDraftFilters((f) => ({ ...f, profile_id: e.target.value }))}>
          <option value="">All Packages</option>
          {profiles.map((p) => (
            <option key={p.id} value={String(p.id)}>{p.name}</option>
          ))}
        </select>

        <div className="flex gap-2">
          <button onClick={openSearchPageFromSubscribers} className="btn-primary btn-sm" title="Open full search results">
            <Search size={14} /> Search
          </button>
          <select className="select h-9 text-sm" value={draftFilters.limit} onChange={(e) => setDraftFilters((f) => ({ ...f, limit: e.target.value }))}>
            <option value="10">10 Per Page</option>
            <option value="20">20 Per Page</option>
            <option value="50">50 Per Page</option>
          </select>
          <button onClick={applyFilters} className="btn-primary btn-sm">
            <Filter size={14} /> Filter
          </button>
          <button onClick={() => load()} className="btn-ghost btn-sm" title="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {!isSubdealer && (
        <div className="card p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-muted mr-2">Bulk actions on selected: {selected.size}</span>
          <button className="btn-ghost btn-sm" disabled={selected.size === 0} onClick={() => void bulkSetStatus('Active')}>Enable</button>
          <button className="btn-ghost btn-sm" disabled={selected.size === 0} onClick={() => void bulkSetStatus('Disabled')}>Disable</button>
          <button className="btn-primary btn-sm" disabled={selected.size === 0} onClick={() => void bulkRenew()}>Process Renewal</button>
          <button className="btn-danger btn-sm" disabled={selected.size === 0} onClick={() => void bulkDelete()}>Fast Delete</button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th><input type="checkbox" checked={data.length > 0 && data.every((d) => selected.has(d.id))} onChange={toggleAllCurrentPage} /></th>
                <th>#ID</th>
                <th>Customer Identity</th>
                <th>Network / Owner</th>
                <th>Subscribed Plan</th>
                <th>Life Cycle</th>
                <th>Connection</th>
                <th>Operations</th>
              </tr>
            </thead>
            <tbody>
              {loading && data.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-text-muted">Loading...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-text-muted">No subscribers found</td></tr>
              ) : data.map((sub) => {
                const isLive = sub.status === 'Active'
                return (
                  <motion.tr key={sub.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <td><input type="checkbox" checked={selected.has(sub.id)} onChange={() => toggleOne(sub.id)} /></td>
                    <td className="font-mono text-accent-cyan">#{sub.id}</td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center text-accent-cyan font-bold text-xs flex-shrink-0">
                          {sub.full_name.charAt(0).toUpperCase()}
                        </div>
                        <button type="button" onClick={() => openUserPage(sub.pppoe_username)} className="text-left">
                          <p className="font-medium text-text-primary text-sm hover:text-accent-cyan transition-colors">{sub.full_name}</p>
                          <p className="text-xs text-text-muted hover:text-text-primary transition-colors">{sub.pppoe_username}</p>
                        </button>
                      </div>
                    </td>
                    <td>
                      <p className="text-sm font-semibold text-text-primary">{sub.nas_name || 'Unassigned NAS'}</p>
                      <p className="text-xs text-status-warning">{sub.agent_username || 'No Dealer'}</p>
                    </td>
                    <td>
                      <p className="text-sm font-medium">{sub.profile_name}</p>
                      <p className="text-xs text-text-muted">{speedText(sub.download_speed)} / {speedText(sub.upload_speed)}</p>
                      <p className="text-xs text-text-secondary">Rs. {Number(sub.retail_price || 0).toLocaleString()}</p>
                    </td>
                    <td className="w-44">
                      <p className="text-sm text-text-primary">{sub.expiration_date}</p>
                      <LifecycleBar days={sub.days_remaining} />
                    </td>
                    <td>
                      <span className={`badge ${isLive ? 'badge-active' : 'badge-disabled'}`}>
                        {isLive ? <Wifi size={10} /> : <WifiOff size={10} />} {isLive ? 'LIVE' : 'OFFLINE'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button title="Edit" onClick={() => setEditingSub(sub)} className="p-1.5 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors">
                          <Edit2 size={13} />
                        </button>
                        <button title="Renew" onClick={() => openRenewConfirm(sub)} className="p-1.5 rounded hover:bg-status-active/20 text-status-active transition-colors">
                          <RotateCcw size={13} />
                        </button>
                        <button
                          title={sub.status === 'Active' ? 'Disable' : 'Enable'}
                          onClick={() => openStatusConfirm(sub)}
                          className="p-1.5 rounded hover:bg-status-warning/20 text-status-warning transition-colors"
                        >
                          {sub.status === 'Active' ? <UserX size={13} /> : <UserCheck size={13} />}
                        </button>
                        {!isSubdealer && (
                          <button title="Delete" onClick={() => openDeleteConfirm(sub)} className="p-1.5 rounded hover:bg-status-expired/20 text-status-expired transition-colors">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <p className="text-xs text-text-muted">Page {page} of {pages} · {total} records · {selected.size} selected</p>
          <div className="flex gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost btn-sm"><ChevronLeft size={14} /></button>
            <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="btn-ghost btn-sm"><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {wizardOpen && (
          <NewSubscriberWizard onClose={() => setWizardOpen(false)} onSuccess={() => { setWizardOpen(false); load().catch(() => undefined) }} />
        )}
        {editingSub && (
          <EditSubscriberDrawer subId={editingSub.id} onClose={() => setEditingSub(null)} onSuccess={() => { setEditingSub(null); load().catch(() => undefined) }} />
        )}
      </AnimatePresence>

      {quickActionConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="card w-full max-w-lg p-5 space-y-4">
            <h3 className="text-lg font-semibold text-text-primary">{quickActionConfirm.title}</h3>
            <div className="space-y-2">
              {quickActionConfirm.details.map((item, idx) => (
                <p key={idx} className="text-sm text-text-muted">- {item}</p>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setQuickActionConfirm(null)}
                disabled={quickActionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className={quickActionConfirm.type === 'delete' ? 'btn-danger btn-sm' : 'btn-primary btn-sm'}
                onClick={runQuickActionConfirm}
                disabled={quickActionLoading}
              >
                {quickActionLoading ? <Loader2 size={14} className="animate-spin" /> : null} {quickActionConfirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
