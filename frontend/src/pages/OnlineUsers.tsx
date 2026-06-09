import { useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../hooks/useAuth'

type OnlineRow = {
  username: string
  full_name: string | null
  ip_address: string
  mac_address: string
  uptime: string
  download_gb: number
  upload_gb: number
  nas_ip: string
  nas_id: number | null
}

type Summary = {
  online_users: number
  total_download_gb: number
  total_upload_gb: number
  total_usage_gb: number
}

export function OnlineUsers() {
  const { admin } = useAuth()
  const isSubdealer = admin?.role === 'Agent'
  const [rows, setRows] = useState<OnlineRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<{ data: OnlineRow[]; summary: Summary }>('/nas/online-users')
      setRows(res.data.data)
      setSummary(res.data.summary)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function kick(row: OnlineRow) {
    await api.post('/nas/online-users/kick', { username: row.username, nas_id: row.nas_id, nas_ip: row.nas_ip })
    await load()
  }

  async function clearGhosts() {
    await api.post('/nas/online-users/clear-ghosts')
    await load()
  }

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase()
    if (!q) return true
    return `${r.username} ${r.full_name || ''} ${r.ip_address} ${r.nas_ip}`.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Network Activity Monitor</h1>
          <p className="text-sm text-text-muted">{isSubdealer ? 'Live sessions for your customer accounts' : 'Live sessions from RADIUS accounting'}</p>
        </div>
        <div className="flex gap-2">
          {!isSubdealer && <button className="btn-ghost btn-sm" onClick={() => void clearGhosts()}>Clear Ghosts</button>}
          <button className="btn-primary btn-sm" onClick={() => void load()}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="stat-card"><p className="text-xs text-text-muted">Online Users</p><p className="text-xl font-bold text-accent-cyan">{summary.online_users}</p></div>
          <div className="stat-card"><p className="text-xs text-text-muted">Download</p><p className="text-xl font-bold text-status-active">{summary.total_download_gb} GB</p></div>
          <div className="stat-card"><p className="text-xs text-text-muted">Upload</p><p className="text-xl font-bold text-status-warning">{summary.total_upload_gb} GB</p></div>
          <div className="stat-card"><p className="text-xs text-text-muted">Total Usage</p><p className="text-xl font-bold text-text-primary">{summary.total_usage_gb} GB</p></div>
        </div>
      )}

      <div className="card p-4">
        <input className="input" placeholder="Press Enter to search DB..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>User / Identity</th>
                <th>IP Address</th>
                <th>MAC Address</th>
                <th>Uptime</th>
                <th>Data (D/U)</th>
                <th>NAS IP</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={`${r.username}-${r.ip_address}-${r.nas_ip}`}>
                  <td>
                    <p className="text-sm text-text-primary">{r.full_name || r.username}</p>
                    <p className="text-xs font-mono text-text-muted">{r.username}</p>
                  </td>
                  <td className="text-xs text-text-secondary">{r.ip_address}</td>
                  <td className="text-xs text-text-secondary">{r.mac_address}</td>
                  <td className="text-xs text-text-secondary">{r.uptime}</td>
                  <td className="text-xs text-text-secondary">{r.download_gb} / {r.upload_gb} GB</td>
                  <td className="text-xs text-text-secondary">{r.nas_ip}</td>
                  <td>
                    {isSubdealer ? (
                      <span className="text-xs text-text-muted">View only</span>
                    ) : (
                      <button className="btn-danger btn-sm" onClick={() => void kick(r)}>KICK</button>
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
