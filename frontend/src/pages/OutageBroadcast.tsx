import { useEffect, useState } from 'react'
import api from '../lib/api'

type Incident = {
  id: number
  title: string
  details: string | null
  severity: string
  status: string
  started_at: string
}

type BroadcastLog = {
  id: number
  incident_id: number
  recipients: number
  sent_at: string
}

type DeliveryLog = {
  id: number
  recipient_phone: string
  recipient_name: string | null
  status: string
  error_text: string | null
  created_at: string
}

export function OutageBroadcast() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [logs, setLogs] = useState<BroadcastLog[]>([])
  const [deliveryLogs, setDeliveryLogs] = useState<DeliveryLog[]>([])
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null)
  const [form, setForm] = useState({ title: '', details: '', severity: 'medium' })

  async function load() {
    const [i, l] = await Promise.all([
      api.get<Incident[]>('/outages'),
      api.get<BroadcastLog[]>('/outages/broadcast/logs'),
    ])
    setIncidents(i.data)
    setLogs(l.data)
  }

  useEffect(() => {
    load().catch(() => undefined)
  }, [])

  async function createIncident() {
    if (!form.title.trim()) return
    await api.post('/outages', form)
    setForm({ title: '', details: '', severity: 'medium' })
    await load()
  }

  async function broadcast(id: number) {
    await api.post(`/outages/${id}/broadcast`)
    setSelectedIncidentId(id)
    await loadDeliveryLogs(id)
    await load()
  }

  async function resolveIncident(id: number) {
    await api.patch(`/outages/${id}/resolve`)
    await load()
  }

  async function loadDeliveryLogs(incidentId: number) {
    const res = await api.get<DeliveryLog[]>(`/outages/broadcast/messages/${incidentId}`)
    setDeliveryLogs(res.data)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Outage Broadcast</h1>
          <p className="text-sm text-text-muted">Incident board with one-click affected-subscriber campaign</p>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => load()}>Refresh</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold text-text-primary">Create Incident</h3>
          <input className="input" placeholder="Incident title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <select className="select" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <textarea className="input min-h-24" placeholder="Details" value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
          <button className="btn-primary w-full justify-center" onClick={createIncident}>Create Incident</button>
        </div>

        <div className="card p-4 lg:col-span-2">
          <h3 className="font-semibold text-text-primary mb-3">Incidents</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {incidents.map((i) => (
              <div key={i.id} className="rounded-lg border border-border/70 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-text-primary">#{i.id} {i.title}</p>
                  <span className="text-xs text-text-muted">{i.severity} • {i.status}</span>
                </div>
                <p className="text-xs text-text-muted mt-1">{i.details || 'No details'} • {new Date(i.started_at).toLocaleString()}</p>
                <div className="mt-2 flex items-center gap-2">
                  <button className="btn-ghost btn-sm" onClick={() => broadcast(i.id)}>Broadcast</button>
                  <button className="btn-ghost btn-sm" onClick={() => { setSelectedIncidentId(i.id); loadDeliveryLogs(i.id).catch(() => undefined) }}>View Delivery</button>
                  {i.status !== 'resolved' && <button className="btn-ghost btn-sm" onClick={() => resolveIncident(i.id)}>Resolve</button>}
                </div>
              </div>
            ))}
            {incidents.length === 0 && <p className="text-sm text-text-muted">No incidents yet.</p>}
          </div>

          <h4 className="font-semibold text-text-primary mt-4 mb-2">Broadcast Logs</h4>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {logs.map((l) => (
              <p key={l.id} className="text-xs text-text-muted">Incident #{l.incident_id} • recipients {l.recipients} • {new Date(l.sent_at).toLocaleString()}</p>
            ))}
            {logs.length === 0 && <p className="text-xs text-text-muted">No broadcast logs yet.</p>}
          </div>

          <h4 className="font-semibold text-text-primary mt-4 mb-2">Delivery Details {selectedIncidentId ? `(Incident #${selectedIncidentId})` : ''}</h4>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {deliveryLogs.map((l) => (
              <p key={l.id} className="text-xs text-text-muted">
                {(l.recipient_name || l.recipient_phone)} • {l.status}
                {l.error_text ? ` • ${l.error_text}` : ''}
                {` • ${new Date(l.created_at).toLocaleString()}`}
              </p>
            ))}
            {deliveryLogs.length === 0 && <p className="text-xs text-text-muted">No per-recipient delivery logs yet.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
