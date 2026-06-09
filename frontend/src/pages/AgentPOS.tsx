import { useEffect, useState } from 'react'
import { Search, Wallet, Loader2, RefreshCw } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../hooks/useAuth'

interface PosRow {
  id: number
  full_name: string
  pppoe_username: string
  area_name: string | null
  profile_name: string
  retail_price: number
  status: string
  expiration_date: string
  days_remaining: number
}

export function AgentPOS() {
  const { admin } = useAuth()
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<PosRow[]>([])
  const [loading, setLoading] = useState(false)
  const [processingId, setProcessingId] = useState<number | null>(null)

  async function loadQueue() {
    setLoading(true)
    try {
      const res = await api.get<{ data: PosRow[] }>('/billing/pos/queue', { params: { search } })
      setRows(res.data.data)
    } finally {
      setLoading(false)
    }
  }

  async function collect(subscriberId: number) {
    setProcessingId(subscriberId)
    try {
      await api.post('/billing/pos/collect', { subscriber_id: subscriberId })
      await loadQueue()
    } finally {
      setProcessingId(null)
    }
  }

  useEffect(() => {
    void loadQueue()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fmt = (n: number) => `Rs. ${Number(n || 0).toLocaleString('en-PK')}`

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Agent POS</h1>
          <p className="text-sm text-text-muted">Search and collect monthly renewals quickly</p>
        </div>
        <div className="card px-4 py-3 flex items-center gap-3">
          <Wallet size={16} className="text-accent-cyan" />
          <div>
            <p className="text-xs text-text-muted">Wallet Balance</p>
            <p className="text-sm font-bold text-accent-cyan">{fmt(admin?.walletBalance || 0)}</p>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-col lg:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={14} />
            <input
              className="input pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void loadQueue()}
              placeholder="Search customer name or area..."
            />
          </div>
          <button onClick={() => void loadQueue()} disabled={loading} className="btn-primary btn-sm">
            <Search size={14} /> Search
          </button>
          <button onClick={() => void loadQueue()} disabled={loading} className="btn-ghost btn-sm">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Area</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Expiry</th>
                <th>Amount</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const notEnough = (admin?.walletBalance || 0) < Number(row.retail_price)
                return (
                  <tr key={row.id}>
                    <td>
                      <p className="text-sm text-text-primary">{row.full_name}</p>
                      <p className="text-xs font-mono text-text-muted">{row.pppoe_username}</p>
                    </td>
                    <td className="text-xs text-text-muted">{row.area_name || 'N/A'}</td>
                    <td className="text-xs text-text-secondary">{row.profile_name}</td>
                    <td><span className={`badge ${row.status === 'Active' ? 'badge-active' : 'badge-expired'}`}>{row.status}</span></td>
                    <td className="text-xs text-text-muted">{new Date(row.expiration_date).toLocaleDateString()}</td>
                    <td className="text-sm font-semibold">{fmt(row.retail_price)}</td>
                    <td>
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => void collect(row.id)}
                        disabled={processingId === row.id || notEnough}
                      >
                        {processingId === row.id ? <Loader2 size={14} className="animate-spin" /> : 'Receive'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
