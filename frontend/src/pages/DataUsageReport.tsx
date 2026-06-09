import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import api from '../lib/api'

type UsageRow = {
  subscriber_id: number
  full_name: string
  username: string
  download_gb: number
  upload_gb: number
  total_gb: number
  last_seen: string | null
}

export function DataUsageReport() {
  const [days, setDays] = useState(30)
  const [rows, setRows] = useState<UsageRow[]>([])
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<{ data: UsageRow[] }>('/nas/usage-report', { params: { days } })
      setRows(res.data.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Data Usage Report</h1>
          <p className="text-sm text-text-muted">Aggregated usage from RADIUS accounting records</p>
        </div>
        <div className="flex gap-2 items-center">
          <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
          </select>
          <button className="btn-primary btn-sm" onClick={() => void load()}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Username</th>
                <th>Download</th>
                <th>Upload</th>
                <th>Total</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.username}-${r.subscriber_id}`}>
                  <td className="text-sm text-text-primary">{r.full_name}</td>
                  <td className="text-xs font-mono text-text-muted">{r.username}</td>
                  <td className="text-xs text-text-secondary">{r.download_gb} GB</td>
                  <td className="text-xs text-text-secondary">{r.upload_gb} GB</td>
                  <td className="text-sm font-semibold text-accent-cyan">{r.total_gb} GB</td>
                  <td className="text-xs text-text-secondary">{r.last_seen ? new Date(r.last_seen).toLocaleString() : 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
