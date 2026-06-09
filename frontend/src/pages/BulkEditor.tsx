import { useState } from 'react'
import { Loader2, Play, Search } from 'lucide-react'
import api from '../lib/api'

type PreviewRow = {
  id: number
  full_name: string
  pppoe_username: string
  status: string
  expiration_date: string
  profile_name: string | null
  nas_name: string | null
  agent_username: string | null
}

export function BulkEditor() {
  const [filters, setFilters] = useState({ search: '', status: '', profile_id: '', agent_id: '' })
  const [updates, setUpdates] = useState({ status: '', profile_id: '', nas_id: '', agent_id: '', add_days: '' })
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState<PreviewRow[]>([])

  async function preview() {
    setLoading(true)
    try {
      const res = await api.post<{ total: number; data: PreviewRow[] }>('/subscribers/bulk/preview', filters)
      setTotal(res.data.total)
      setRows(res.data.data)
    } finally {
      setLoading(false)
    }
  }

  async function applyBulk() {
    setApplying(true)
    try {
      await api.post('/subscribers/bulk/apply', {
        ...filters,
        updates: {
          status: updates.status || undefined,
          profile_id: updates.profile_id || undefined,
          nas_id: updates.nas_id || undefined,
          agent_id: updates.agent_id || undefined,
          add_days: updates.add_days || undefined,
        },
      })
      await preview()
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Mass Editor (Bulk Update)</h1>
        <p className="text-sm text-text-muted">Preview matched subscribers and apply a single bulk operation</p>
      </div>

      <div className="card p-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="space-y-2">
          <h3 className="font-semibold text-text-primary">Audience Filter</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input className="input pl-8" placeholder="Search User or ID..." value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
            </div>
            <input className="input" placeholder="status" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} />
            <input className="input" placeholder="profile_id" value={filters.profile_id} onChange={(e) => setFilters((f) => ({ ...f, profile_id: e.target.value }))} />
            <input className="input" placeholder="agent_id" value={filters.agent_id} onChange={(e) => setFilters((f) => ({ ...f, agent_id: e.target.value }))} />
            <button className="btn-primary btn-sm col-span-2" onClick={() => void preview()} disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : 'Preview Set'}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold text-text-primary">Update Operation</h3>
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="New Status" value={updates.status} onChange={(e) => setUpdates((u) => ({ ...u, status: e.target.value }))} />
            <input className="input" placeholder="New Profile ID" value={updates.profile_id} onChange={(e) => setUpdates((u) => ({ ...u, profile_id: e.target.value }))} />
            <input className="input" placeholder="New NAS ID" value={updates.nas_id} onChange={(e) => setUpdates((u) => ({ ...u, nas_id: e.target.value }))} />
            <input className="input" placeholder="New Dealer UUID" value={updates.agent_id} onChange={(e) => setUpdates((u) => ({ ...u, agent_id: e.target.value }))} />
            <input className="input col-span-2" placeholder="Add Days (e.g. 30)" value={updates.add_days} onChange={(e) => setUpdates((u) => ({ ...u, add_days: e.target.value }))} />
            <button className="btn-primary col-span-2" onClick={() => void applyBulk()} disabled={applying || total === 0}>
              {applying ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} EXECUTE on {total}
            </button>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm text-text-muted">Preview ({rows.length} of {total})</div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>User Identity</th>
                <th>Status / Expiry</th>
                <th>Current Package</th>
                <th>Network (Dealer / NAS)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <p className="text-sm text-text-primary">{row.full_name}</p>
                    <p className="text-xs font-mono text-text-muted">{row.pppoe_username}</p>
                  </td>
                  <td className="text-xs text-text-secondary">{row.status} • {new Date(row.expiration_date).toLocaleDateString()}</td>
                  <td className="text-xs text-text-secondary">{row.profile_name || 'N/A'}</td>
                  <td className="text-xs text-text-secondary">{row.agent_username || 'No Dealer'} / {row.nas_name || 'No NAS'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
