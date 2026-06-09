import { useEffect, useState } from 'react'
import api from '../lib/api'

type Ticket = {
  id: number
  title: string
  category: string
  priority: string
  status: string
  due_at: string | null
  subscriber_name?: string
}

type TicketStats = { total: number; open: number; resolved: number; overdue: number; escalated?: number }

export function TicketingSLA() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [stats, setStats] = useState<TicketStats>({ total: 0, open: 0, resolved: 0, overdue: 0, escalated: 0 })
  const [form, setForm] = useState({ title: '', category: 'technical', priority: 'medium', description: '' })

  async function load() {
    const [t, s] = await Promise.all([
      api.get<Ticket[]>('/tickets'),
      api.get<TicketStats>('/tickets/stats'),
    ])
    setTickets(t.data)
    setStats(s.data)
  }

  useEffect(() => {
    load().catch(() => undefined)
  }, [])

  async function createTicket() {
    if (!form.title.trim()) return
    await api.post('/tickets', form)
    setForm({ title: '', category: 'technical', priority: 'medium', description: '' })
    await load()
  }

  async function updateStatus(id: number, status: string) {
    await api.patch(`/tickets/${id}/status`, { status })
    await load()
  }

  async function runEscalation() {
    await api.post('/tickets/escalation/run')
    await load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Ticketing & SLA</h1>
          <p className="text-sm text-text-muted">Complaint workflow, SLA tracking, and status control</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost btn-sm" onClick={runEscalation}>Run Escalation</button>
          <button className="btn-ghost btn-sm" onClick={() => load()}>Refresh</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="stat-card"><p className="text-xs text-text-muted">Total</p><p className="text-2xl font-bold text-text-primary">{stats.total}</p></div>
        <div className="stat-card"><p className="text-xs text-text-muted">Open</p><p className="text-2xl font-bold text-brand-blue">{stats.open}</p></div>
        <div className="stat-card"><p className="text-xs text-text-muted">Escalated</p><p className="text-2xl font-bold text-status-warning">{stats.escalated || 0}</p></div>
        <div className="stat-card"><p className="text-xs text-text-muted">Resolved</p><p className="text-2xl font-bold text-status-active">{stats.resolved}</p></div>
        <div className="stat-card"><p className="text-xs text-text-muted">Overdue</p><p className="text-2xl font-bold text-status-expired">{stats.overdue}</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold text-text-primary">Create Ticket</h3>
          <input className="input" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="technical">Technical</option>
              <option value="billing">Billing</option>
              <option value="network">Network</option>
              <option value="general">General</option>
            </select>
            <select className="select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <textarea className="input min-h-24" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <button className="btn-primary w-full justify-center" onClick={createTicket}>Create</button>
        </div>

        <div className="card p-4 lg:col-span-2">
          <h3 className="font-semibold text-text-primary mb-3">Ticket Queue</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {tickets.map((t) => (
              <div key={t.id} className="rounded-lg border border-border/70 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-text-primary">#{t.id} {t.title}</p>
                  <span className="text-xs text-text-muted">{t.priority}</span>
                </div>
                <p className="text-xs text-text-muted mt-1">{t.category} • {t.subscriber_name || 'General'}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-text-muted">{t.due_at ? `Due ${new Date(t.due_at).toLocaleString()}` : 'No due time'}</span>
                  <div className="flex items-center gap-2">
                    <select className="select !py-1 !h-8" value={t.status} onChange={(e) => updateStatus(t.id, e.target.value)}>
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="escalated">Escalated</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
            {tickets.length === 0 && <p className="text-sm text-text-muted">No tickets yet.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
