import { useState, useEffect, useCallback } from 'react'
import { Server, Zap, Signal, RefreshCw, AlertTriangle, CheckCircle, Monitor } from 'lucide-react'
import api from '../lib/api'
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

interface NAS { id: number; name: string; ip_address: string; api_port: number; is_active: boolean; last_seen: string }
interface Session { name: string; service: string; address: string; uptime: string }

export function NetworkControl() {
  const [nasList, setNasList]   = useState<NAS[]>([])
  const [selected, setSelected] = useState<NAS | null>(null)
  const [stats, setStats]       = useState<Record<string, unknown> | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading]   = useState(false)
  const [kickUser, setKickUser] = useState('')
  const [kickResult, setKickResult] = useState<{ success: boolean; msg: string } | null>(null)
  const [traffic, setTraffic]   = useState<{ time: string; rx: number; tx: number }[]>([])

  const loadNAS = useCallback(async () => {
    try {
      const res = await api.get<NAS[]>('/nas/list')
      setNasList(res.data)
      if (!selected && res.data.length) setSelected(res.data[0])
    } catch { /* graceful */ }
  }, [selected])

  useEffect(() => { loadNAS() }, [loadNAS])

  const loadStats = useCallback(async () => {
    if (!selected) return
    setLoading(true)
    try {
      const [statsRes, sessRes] = await Promise.all([
        api.get<{ system: Record<string, unknown>; interfaces: { rx_mbps: number; tx_mbps: number }[]; mock?: boolean }>(`/nas/${selected.id}/live-stats`),
        api.get<{ sessions: Session[] }>(`/nas/${selected.id}/sessions`),
      ])
      setStats(statsRes.data)
      setSessions(sessRes.data.sessions)
      const pt = { time: new Date().toLocaleTimeString('en', { hour12: false }), rx: (statsRes.data.interfaces?.[0]?.rx_mbps as number) ?? 0, tx: (statsRes.data.interfaces?.[0]?.tx_mbps as number) ?? 0 }
      setTraffic(prev => [...prev.slice(-25), pt])
    } catch { /* graceful */ } finally { setLoading(false) }
  }, [selected])

  useEffect(() => {
    loadStats()
    const id = setInterval(loadStats, 5000)
    return () => clearInterval(id)
  }, [loadStats])

  async function kick() {
    if (!selected || !kickUser) return
    try {
      await api.post('/nas/kick-user', { nas_id: selected.id, username: kickUser })
      setKickResult({ success: true, msg: `${kickUser} disconnected successfully` })
      setKickUser('')
      loadStats()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setKickResult({ success: false, msg: msg || 'Kick failed' })
    }
  }

  const sys = stats?.system as Record<string, unknown> | undefined
  const isMock = stats?.mock as boolean | undefined

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-text-primary">Network Control</h1>
          <p className="text-sm text-text-muted">Real-time MikroTik & OLT management</p></div>
        <button onClick={loadStats} className="btn-ghost btn-sm"><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Refresh</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* NAS list */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-border"><h3 className="text-sm font-semibold text-text-primary">NAS Routers</h3></div>
          {nasList.map(nas => (
            <button key={nas.id} onClick={() => setSelected(nas)}
              className={`w-full text-left px-4 py-3 hover:bg-bg-hover transition-colors ${selected?.id === nas.id ? 'bg-accent-cyan/5 border-l-2 border-accent-cyan' : ''}`}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${nas.is_active ? 'bg-status-active' : 'bg-status-expired'}`}/>
                <div>
                  <p className="text-xs font-medium text-text-primary">{nas.name}</p>
                  <p className="text-[10px] text-text-muted font-mono">{nas.ip_address}:{nas.api_port}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-3 space-y-4">
          {/* System stats */}
          {sys && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'CPU Load', value: `${sys.cpu_load}%`, icon: Monitor, color: Number(sys.cpu_load) > 80 ? 'text-status-expired' : 'text-status-active' },
                { label: 'Free RAM', value: `${sys.free_memory}MB`, icon: Server, color: 'text-accent-cyan' },
                { label: 'Uptime', value: String(sys.uptime).split(' ')[0], icon: CheckCircle, color: 'text-status-active' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="stat-card">
                  <div className="flex items-center justify-between">
                    <div><p className="text-xs text-text-muted">{label}</p>
                      <p className={`text-xl font-bold ${color}`}>{value}</p></div>
                    <Icon size={18} className={color}/>
                  </div>
                </div>
              ))}
            </div>
          )}

          {isMock && (
            <div className="flex items-center gap-2 text-xs text-status-warning bg-status-warning/10 border border-status-warning/20 rounded-lg px-3 py-2">
              <AlertTriangle size={12}/> Showing simulated data — router at {selected?.ip_address} is unreachable
            </div>
          )}

          {/* Live traffic */}
          <div className="card p-4">
            <p className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-status-active rounded-full animate-pulse"/>Live Traffic
            </p>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={traffic}>
                <XAxis dataKey="time" tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
                <YAxis tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}M`}/>
                <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 6, fontSize: 11 }} formatter={(v: number, n) => [`${v.toFixed(2)} Mbps`, n === 'rx' ? '↓ DL' : '↑ UL']}/>
                <Line type="monotone" dataKey="rx" stroke="#06B6D4" strokeWidth={2} dot={false} isAnimationActive={false}/>
                <Line type="monotone" dataKey="tx" stroke="#10B981" strokeWidth={2} dot={false} isAnimationActive={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Packet of Disconnect */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-status-expired"/>
              <h3 className="font-semibold text-sm text-text-primary">Packet of Disconnect</h3>
            </div>
            <div className="flex gap-2">
              <input value={kickUser} onChange={e => setKickUser(e.target.value)} placeholder="PPPoE username to kick..." className="input flex-1 h-9 text-sm font-mono"/>
              <button onClick={kick} disabled={!kickUser} className="btn-danger btn-sm">Kick User</button>
            </div>
            {kickResult && <p className={`text-xs ${kickResult.success ? 'text-status-active' : 'text-status-expired'}`}>{kickResult.msg}</p>}
          </div>

          {/* Active sessions */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">Active PPPoE Sessions</h3>
              <span className="text-xs text-text-muted">{sessions.length} online</span>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {sessions.length === 0 ? (
                <p className="text-center text-xs text-text-muted py-6">No active sessions or router offline</p>
              ) : sessions.map((s, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2 border-b border-border/30">
                  <div>
                    <p className="text-xs font-medium font-mono text-accent-cyan">{s.name}</p>
                    <p className="text-[10px] text-text-muted">{s.address} · {s.uptime}</p>
                  </div>
                  <Signal size={12} className="text-status-active"/>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
