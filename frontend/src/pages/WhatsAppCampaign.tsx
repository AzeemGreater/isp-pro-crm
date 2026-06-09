import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Send, Shield, Loader, MessageSquare, CheckCircle, History, RefreshCw } from 'lucide-react'
import api from '../lib/api'

interface Zone { id: number; zone_code: string; area_name: string }
interface WaLog { id: number; phone: string; message_type: string; status: string; sent_at: string; full_name: string }
interface WaStatus { connected: boolean; status: string; qr?: string; initializing?: boolean }
interface WaTemplate { key: string; label: string; body: string }

export function WhatsAppCampaign() {
  const [zones, setZones]     = useState<Zone[]>([])
  const [logs, setLogs]       = useState<WaLog[]>([])
  const [templates, setTemplates] = useState<WaTemplate[]>([])
  const [waStatus, setWaStatus] = useState<WaStatus>({ connected: false, status: 'disconnected' })
  const [message, setMessage] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [zoneId, setZoneId]   = useState('')
  const [statusF, setStatusF] = useState('')
  const [safeMode, setSafeMode] = useState(true)
  const [sending, setSending] = useState(false)
  const [result, setResult]   = useState<{ total: number; estimated_minutes: number } | null>(null)

  const loadAll = useCallback(async () => {
    try {
      const [zRes, lRes, sRes, tRes] = await Promise.all([
        api.get<Zone[]>('/network/zones'),
        api.get<WaLog[]>('/whatsapp/logs?limit=20'),
        api.get<WaStatus>('/whatsapp/status'),
        api.get<WaTemplate[]>('/whatsapp/templates'),
      ])
      setZones(zRes.data)
      setLogs(lRes.data)
      setWaStatus(sRes.data)
      setTemplates(tRes.data)
    } catch { /* graceful */ }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  async function sendCampaign() {
    if (!message.trim()) return
    setSending(true); setResult(null)
    try {
      const res = await api.post<{ total: number; estimated_minutes: number }>('/whatsapp/bulk', {
        message, zone_id: zoneId || undefined, status_filter: statusF || undefined, safe_mode: safeMode,
      })
      setResult(res.data)
      setTimeout(loadAll, 5000)
    } catch { /* TODO: toast */ } finally { setSending(false) }
  }

  function handleTemplateChange(value: string) {
    setSelectedTemplate(value)
    if (!value) return
    const found = templates.find((template) => template.key === value)
    if (found) {
      setMessage(found.body)
    }
  }

  const statusColor = { connected: 'text-status-active', disconnected: 'text-status-expired', qr_ready: 'text-status-warning', connecting: 'text-accent-cyan', error: 'text-status-expired' }[waStatus.status] || 'text-text-muted'
  const statusLabel = { connected: 'Connected', disconnected: 'Disconnected', qr_ready: 'QR Pending', connecting: 'Connecting...', error: 'Error' }[waStatus.status] || waStatus.status
  const sentCount = logs.filter((item) => item.status === 'sent').length
  const failedCount = logs.filter((item) => item.status === 'failed').length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-text-primary">WhatsApp Hub</h1>
          <p className="text-sm text-text-muted">Automated messaging & bulk campaigns</p></div>
        <div className="flex items-center gap-2">
          <div className={`text-sm font-medium ${statusColor}`}>Server: {statusLabel}</div>
          <button onClick={loadAll} className="btn-ghost btn-sm"><RefreshCw size={12}/></button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Bulk campaign composer */}
        <div className="lg:col-span-2 card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-status-active"/>
            <h3 className="font-semibold text-text-primary">Bulk Campaign</h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="input-label">Filter Zone</label>
              <select value={zoneId} onChange={e => setZoneId(e.target.value)} className="select">
                <option value="">All Zones</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.area_name}</option>)}
              </select></div>
            <div><label className="input-label">Filter Status</label>
              <select value={statusF} onChange={e => setStatusF(e.target.value)} className="select">
                <option value="">All Status</option>
                <option value="Active">Active</option>
                <option value="Expired">Expired</option>
                <option value="Disabled">Disabled</option>
              </select></div>
          </div>

          <div>
            <label className="input-label">Use Template</label>
            <select value={selectedTemplate} onChange={e => handleTemplateChange(e.target.value)} className="select">
              <option value="">Custom Message</option>
              {templates.map((template) => (
                <option key={template.key} value={template.key}>{template.label}</option>
              ))}
            </select>
          </div>

          <div><label className="input-label">Message (use {'{'}name{'}'} for subscriber name)</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5}
              className="input resize-none font-mono text-sm" placeholder="Dear {name}, your internet subscription is due for renewal..." />
            <p className="text-xs text-text-muted mt-1">{message.length} characters</p>
          </div>

          {/* Safe Mode toggle */}
          <div className="flex items-center justify-between bg-bg-base rounded-lg px-4 py-3">
            <div className="flex items-center gap-2">
              <Shield size={16} className={safeMode ? 'text-status-active' : 'text-text-muted'}/>
              <div>
                <p className="text-sm font-medium text-text-primary">Safe Mode</p>
                <p className="text-xs text-text-muted">Random 10–20s delay between messages to prevent ban</p>
              </div>
            </div>
            <button onClick={() => setSafeMode(s => !s)}
              className={`relative w-12 h-6 rounded-full transition-colors ${safeMode ? 'bg-status-active' : 'bg-border'}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow ${safeMode ? 'translate-x-7' : 'translate-x-1'}`}/>
            </button>
          </div>

          <button onClick={sendCampaign} disabled={sending || !message.trim() || !waStatus.connected} className="btn-primary w-full justify-center">
            {sending ? <><Loader size={16} className="animate-spin"/> Sending...</> : <><Send size={16}/> Send Campaign</>}
          </button>

          {!waStatus.connected && <p className="text-xs text-center text-status-warning">WhatsApp must be connected before sending</p>}

          {result && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 bg-status-active/10 border border-status-active/20 rounded-lg px-4 py-3">
              <CheckCircle size={16} className="text-status-active"/>
              <div>
                <p className="text-sm font-medium text-status-active">Campaign queued!</p>
                <p className="text-xs text-text-muted">{result.total} recipients · ~{result.estimated_minutes} minutes with Safe Mode</p>
              </div>
            </motion.div>
          )}
        </div>

        {/* Message log */}
        <div className="card overflow-hidden">
          <div className="grid grid-cols-2 border-b border-border">
            <div className="px-4 py-3 bg-status-active/10">
              <p className="text-[10px] uppercase tracking-wide text-text-muted">Sent</p>
              <p className="text-lg font-bold text-status-active">{sentCount}</p>
            </div>
            <div className="px-4 py-3 bg-status-expired/10 border-l border-border">
              <p className="text-[10px] uppercase tracking-wide text-text-muted">Failed</p>
              <p className="text-lg font-bold text-status-expired">{failedCount}</p>
            </div>
          </div>
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <History size={16} className="text-text-muted"/>
            <h3 className="font-semibold text-text-primary text-sm">Recent Logs</h3>
          </div>
          <div className="divide-y divide-border max-h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-center text-text-muted text-xs py-8">No messages sent yet</p>
            ) : logs.map(log => (
              <div key={log.id} className="px-4 py-3">
                <div className="flex justify-between items-start">
                  <p className="text-xs font-medium text-text-primary">{log.full_name || log.phone}</p>
                  <span className={`text-[10px] ${log.status === 'sent' ? 'text-status-active' : 'text-status-expired'}`}>{log.status}</span>
                </div>
                <p className="text-[10px] text-text-muted mt-0.5">{log.message_type} · {log.sent_at ? new Date(log.sent_at).toLocaleString() : 'Pending'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
