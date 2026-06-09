import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FileText, Loader2, RefreshCw, Search } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../hooks/useAuth'

interface GenerateStats {
  total_customers: number
  active_customers: number
  expired_customers: number
  pending_customers: number
  projected_collection: number
}

interface CustomerRow {
  id: number
  full_name: string
  pppoe_username: string
  mobile: string
  zone_name: string | null
  profile_name: string
  retail_price: number
  status: string
  billed_this_month: boolean
}

export function GenerateBills() {
  const { admin } = useAuth()
  const isSubdealer = admin?.role === 'Agent'
  const [search, setSearch] = useState('')
  const [onlyPending, setOnlyPending] = useState(true)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [stats, setStats] = useState<GenerateStats | null>(null)
  const [rows, setRows] = useState<CustomerRow[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<{ stats: GenerateStats; data: CustomerRow[] }>('/billing/wasooli/generate/overview', {
        params: { search, only_pending: onlyPending },
      })
      setStats(res.data.stats)
      setRows(res.data.data)
      setSelectedIds((prev) => prev.filter((id) => res.data.data.some((row) => row.id === id)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pendingRows = useMemo(() => rows.filter((r) => !r.billed_this_month), [rows])

  function toggleSelect(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function selectAllPending() {
    setSelectedIds(pendingRows.map((r) => r.id))
  }

  async function generateSelected() {
    if (selectedIds.length === 0) return
    setSubmitting(true)
    try {
      await api.post('/billing/wasooli/generate/selected', { subscriber_ids: selectedIds })
      setSelectedIds([])
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  const fmt = (n: number) => `Rs. ${Number(n || 0).toLocaleString('en-PK')}`

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Generate Bills</h1>
          <p className="text-sm text-text-muted">{isSubdealer ? 'Generate monthly bills for your customers only' : 'Bulk monthly bill generation with pending filter'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost btn-sm" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={generateSelected} className="btn-primary" disabled={submitting || selectedIds.length === 0}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} {isSubdealer ? 'Generate Selected' : 'Bill Selected'} ({selectedIds.length})
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="stat-card"><p className="text-xs text-text-muted">Total</p><p className="text-xl font-bold text-text-primary">{stats.total_customers}</p></div>
          <div className="stat-card"><p className="text-xs text-text-muted">Active</p><p className="text-xl font-bold text-status-active">{stats.active_customers}</p></div>
          <div className="stat-card"><p className="text-xs text-text-muted">Expired</p><p className="text-xl font-bold text-status-expired">{stats.expired_customers}</p></div>
          <div className="stat-card"><p className="text-xs text-text-muted">Pending</p><p className="text-xl font-bold text-status-warning">{stats.pending_customers}</p></div>
          <div className="stat-card"><p className="text-xs text-text-muted">Projected</p><p className="text-xl font-bold text-accent-cyan">{fmt(stats.projected_collection)}</p></div>
        </div>
      )}

      <div className="card p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void load()}
              className="input pl-8"
              placeholder="Search Area or Name..."
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-text-secondary px-2">
            <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
            Pending only
          </label>
          <button className="btn-ghost btn-sm" onClick={selectAllPending}>Select Pending</button>
          <button className="btn-primary btn-sm" onClick={() => void load()}>Apply</button>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Select</th>
                <th>Customer</th>
                <th>Area</th>
                <th>Package</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Invoice State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(row.id)}
                      disabled={row.billed_this_month}
                      onChange={() => toggleSelect(row.id)}
                    />
                  </td>
                  <td>
                    <p className="text-sm text-text-primary">{row.full_name}</p>
                    <p className="text-xs font-mono text-text-muted">{row.pppoe_username}</p>
                  </td>
                  <td className="text-xs text-text-muted">{row.zone_name || 'N/A'}</td>
                  <td className="text-xs text-text-secondary">{row.profile_name}</td>
                  <td>
                    <span className={`badge ${row.status === 'Active' ? 'badge-active' : 'badge-expired'}`}>{row.status}</span>
                  </td>
                  <td className="text-sm font-semibold text-text-primary">{fmt(row.retail_price)}</td>
                  <td>
                    {row.billed_this_month ? (
                      <span className="inline-flex items-center gap-1 text-xs text-status-active"><CheckCircle2 size={12} /> Billed</span>
                    ) : (
                      <span className="text-xs text-status-warning">Pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
