import { useEffect, useState } from 'react'
import { Search, UserPlus } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../lib/api'

type SubscriberRow = {
  id: number
  full_name: string
  pppoe_username: string
  mobile: string
  status: string
}

type InvoiceRow = {
  invoice_number: string
  amount: string
  subscriber_name: string
  date: string
  status: string
}

type AgentRow = {
  id: string
  full_name: string
  username: string
  role_label?: string
  role: string
}

type DeviceRow = {
  id: string
  name: string
  ip_address: string
}

export function SearchResults() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = (params.get('q') || '').trim()

  const [query, setQuery] = useState(q)
  const [loading, setLoading] = useState(false)
  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [nas, setNas] = useState<DeviceRow[]>([])
  const [olt, setOlt] = useState<DeviceRow[]>([])

  useEffect(() => {
    setQuery(q)
  }, [q])

  useEffect(() => {
    if (q.length < 2) {
      setSubscribers([])
      setInvoices([])
      setAgents([])
      setNas([])
      setOlt([])
      return
    }

    setLoading(true)
    Promise.all([
      api.get<{ data: SubscriberRow[] }>('/subscribers', { params: { search: q, limit: 50 } }),
      api.get<{ data: InvoiceRow[] }>('/billing/invoices', { params: { search: q, limit: 30 } }),
      api.get<AgentRow[]>('/agents'),
      api.get<DeviceRow[]>('/network/nas'),
      api.get<DeviceRow[]>('/network/olt'),
    ]).then(([s, i, a, n, o]) => {
      setSubscribers(s.data.data || [])
      setInvoices(i.data.data || [])
      setAgents((a.data || []).filter((row) => `${row.full_name} ${row.username}`.toLowerCase().includes(q.toLowerCase())))
      setNas((n.data || []).filter((row) => `${row.name} ${row.ip_address}`.toLowerCase().includes(q.toLowerCase())))
      setOlt((o.data || []).filter((row) => `${row.name} ${row.ip_address}`.toLowerCase().includes(q.toLowerCase())))
    }).finally(() => setLoading(false))
  }, [q])

  function submitSearch() {
    const value = query.trim()
    if (!value) return
    setParams({ q: value })
  }

  const total = subscribers.length + invoices.length + agents.length + nas.length + olt.length

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Search Results</h1>
          <p className="text-sm text-text-muted">Find subscribers, invoices, partners and network nodes in one place</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/subscribers?new=1')}>
          <UserPlus size={16} /> Add Client
        </button>
      </div>

      <div className="card p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={14} />
            <input
              className="input pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
              placeholder="Search by name, username, invoice, NAS, OLT..."
            />
          </div>
          <button className="btn-primary btn-sm" onClick={submitSearch}>Search</button>
        </div>
      </div>

      <div className="card p-3 text-sm text-text-muted">
        {q.length < 2 ? 'Type at least 2 characters to search.' : loading ? 'Searching...' : `${total} matches for "${q}"`}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="font-semibold text-text-primary mb-3">Subscribers ({subscribers.length})</h3>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {subscribers.map((row) => (
              <a key={row.id} href={`/subscribers/${encodeURIComponent(row.pppoe_username)}`} className="block border border-border rounded-lg px-3 py-2 hover:bg-bg-hover">
                <p className="text-sm font-medium text-text-primary">{row.full_name}</p>
                <p className="text-xs text-text-muted">{row.pppoe_username} · {row.mobile} · {row.status}</p>
              </a>
            ))}
            {subscribers.length === 0 && <p className="text-xs text-text-muted">No subscriber matches</p>}
          </div>
        </div>

        <div className="card p-4">
          <h3 className="font-semibold text-text-primary mb-3">Invoices ({invoices.length})</h3>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {invoices.map((row) => (
              <a key={row.invoice_number} href="/invoices" className="block border border-border rounded-lg px-3 py-2 hover:bg-bg-hover">
                <p className="text-sm font-medium text-text-primary">{row.invoice_number}</p>
                <p className="text-xs text-text-muted">{row.subscriber_name} · Rs. {Number(row.amount || 0).toLocaleString()} · {row.status}</p>
              </a>
            ))}
            {invoices.length === 0 && <p className="text-xs text-text-muted">No invoice matches</p>}
          </div>
        </div>

        <div className="card p-4">
          <h3 className="font-semibold text-text-primary mb-3">Partners ({agents.length})</h3>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {agents.map((row) => (
              <a key={row.id} href="/subdealers" className="block border border-border rounded-lg px-3 py-2 hover:bg-bg-hover">
                <p className="text-sm font-medium text-text-primary">{row.full_name}</p>
                <p className="text-xs text-text-muted">{row.username} · {row.role_label || row.role}</p>
              </a>
            ))}
            {agents.length === 0 && <p className="text-xs text-text-muted">No partner matches</p>}
          </div>
        </div>

        <div className="card p-4">
          <h3 className="font-semibold text-text-primary mb-3">Network Nodes ({nas.length + olt.length})</h3>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {nas.map((row) => (
              <a key={`nas-${row.id}`} href="/ip-manager" className="block border border-border rounded-lg px-3 py-2 hover:bg-bg-hover">
                <p className="text-sm font-medium text-text-primary">NAS: {row.name}</p>
                <p className="text-xs text-text-muted">{row.ip_address}</p>
              </a>
            ))}
            {olt.map((row) => (
              <a key={`olt-${row.id}`} href="/olt-manager" className="block border border-border rounded-lg px-3 py-2 hover:bg-bg-hover">
                <p className="text-sm font-medium text-text-primary">OLT: {row.name}</p>
                <p className="text-xs text-text-muted">{row.ip_address}</p>
              </a>
            ))}
            {nas.length + olt.length === 0 && <p className="text-xs text-text-muted">No node matches</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
