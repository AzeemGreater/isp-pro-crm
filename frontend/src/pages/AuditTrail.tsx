import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import api from '../lib/api'

type Ledger = { id: string; transaction_type: string; amount: string; description: string | null; created_at: string; admin_username?: string; full_name?: string }
type WaLog = { id: string; phone: string; message_type: string; status: string; created_at?: string; sent_at?: string; full_name?: string }

export function AuditTrail() {
  const [ledger, setLedger] = useState<Ledger[]>([])
  const [waLogs, setWaLogs] = useState<WaLog[]>([])

  async function load() {
    const [l, w] = await Promise.all([
      api.get<{ data: Ledger[] }>('/billing/ledger?limit=25&page=1'),
      api.get<WaLog[]>('/whatsapp/logs?limit=25'),
    ])
    setLedger(l.data.data)
    setWaLogs(w.data)
  }

  useEffect(() => {
    load().catch(() => undefined)
  }, [])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Audit Trail</h1>
          <p className="text-sm text-text-muted">Financial and communications event timeline</p>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => load()}>Refresh</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="font-semibold text-text-primary flex items-center gap-2 mb-3"><ShieldCheck size={16} /> Financial Events</div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {ledger.map((item) => (
              <div key={item.id} className="text-sm border-b border-border/40 pb-2">
                <div className="flex justify-between">
                  <span className="text-text-primary font-medium">{item.transaction_type} Rs. {Number(item.amount || 0).toLocaleString()}</span>
                  <span className="text-xs text-text-muted">{new Date(item.created_at).toLocaleString()}</span>
                </div>
                <p className="text-xs text-text-muted">{item.description || 'No description'}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <div className="font-semibold text-text-primary mb-3">WhatsApp Events</div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {waLogs.map((item) => (
              <div key={item.id} className="text-sm border-b border-border/40 pb-2">
                <div className="flex justify-between">
                  <span className="text-text-primary font-medium">{item.full_name || item.phone}</span>
                  <span className={`text-xs ${item.status === 'sent' ? 'text-status-active' : 'text-status-expired'}`}>{item.status}</span>
                </div>
                <p className="text-xs text-text-muted">{item.message_type} · {new Date(item.sent_at || item.created_at || Date.now()).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
