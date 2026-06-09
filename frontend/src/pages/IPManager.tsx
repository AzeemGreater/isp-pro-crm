import { useEffect, useState } from 'react'
import { Pencil, Plus, Router, Trash2, Terminal, Activity, Database, Download, RefreshCw, Send, ArrowLeft, CheckCircle2, XCircle, Wifi } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts'
import api from '../lib/api'

type Nas = {
  id: string
  name: string
  ip_address: string
  routeros_version: string
  api_port: number
  coa_port: number
  api_user: string
  nas_secret: string
  is_active: boolean
}

export function IPManager() {
  const [nas, setNas] = useState<Nas[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', ip_address: '', nas_secret: '', routeros_version: 'RouterOS v7 (Modern)', api_user: 'admin', api_password: '', api_port: '8728', coa_port: '3799',
  })
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectLogs, setConnectLogs] = useState<string[]>([])
  const [connectProgress, setConnectProgress] = useState(0)

  // Real-time ping testing state
  const [pingResults, setPingResults] = useState<Record<string, { testing: boolean, online?: boolean, latency?: number }>>({})

  // Detail Page States
  const [selectedNas, setSelectedNas] = useState<Nas | null>(null)
  const [activeTab, setActiveTab] = useState<'terminal' | 'telemetry' | 'backups'>('terminal')
  const [liveStats, setLiveStats] = useState<any>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  
  // Terminal Tab States
  const [terminalInput, setTerminalInput] = useState('')
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    'Mikrotik Terminal Console initialized.',
    'Type commands e.g. "ip address print" or "ping 8.8.8.8" and press enter.'
  ])
  const [runningCmd, setRunningCmd] = useState(false)

  // Telemetry Tab States
  const [telemetryData, setTelemetryData] = useState<any[]>([])
  const [loadingTelemetry, setLoadingTelemetry] = useState(false)

  // Backups Tab States
  const [backups, setBackups] = useState<any[]>([])
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [creatingBackup, setCreatingBackup] = useState(false)

  async function load() {
    const nasRes = await api.get<Nas[]>('/network/nas')
    setNas(nasRes.data)
  }

  useEffect(() => {
    load().catch(() => undefined)
  }, [])

  // Auto-load stats when router details page opens
  useEffect(() => {
    if (selectedNas) {
      loadLiveStats(selectedNas.id).catch(() => undefined)
      loadTelemetry(selectedNas.id).catch(() => undefined)
      loadBackups(selectedNas.id).catch(() => undefined)
    } else {
      setLiveStats(null)
    }
  }, [selectedNas])

  async function loadLiveStats(nasId: string) {
    setLoadingStats(true)
    try {
      const res = await api.get(`/nas/${nasId}/live-stats`)
      setLiveStats(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingStats(false)
    }
  }

  async function testPing(nasId: string) {
    setPingResults(prev => ({ ...prev, [nasId]: { testing: true } }))
    try {
      const res = await api.get<{ online: boolean, latency_ms: number }>(`/nas/${nasId}/ping`)
      setPingResults(prev => ({
        ...prev,
        [nasId]: { testing: false, online: res.data.online, latency: res.data.latency_ms }
      }))
    } catch (err) {
      setPingResults(prev => ({
        ...prev,
        [nasId]: { testing: false, online: false, latency: -1 }
      }))
    }
  }

  async function createNas() {
    if (!form.name || !form.ip_address || !form.api_user || !form.api_password || !form.nas_secret) {
      alert('Please fill all required fields');
      return;
    }

    setIsConnecting(true);
    setConnectLogs(['Initiating connection sequence...']);
    setConnectProgress(10);

    try {
      await new Promise(r => setTimeout(r, 500));
      setConnectLogs(prev => [...prev, `Registering NAS ${form.name} in database...`]);
      setConnectProgress(30);

      const res = await api.post<{ id: string }>('/network/nas', {
        name: form.name,
        ip_address: form.ip_address,
        routeros_version: form.routeros_version,
        api_port: Number(form.api_port),
        coa_port: Number(form.coa_port),
        api_user: form.api_user,
        api_password: form.api_password,
        nas_secret: form.nas_secret,
      })
      
      setConnectLogs(prev => [...prev, 'Configuration saved successfully.']);
      setConnectProgress(60);

      setConnectLogs(prev => [...prev, `Attempting to connect to ${form.ip_address}:${form.api_port}...`]);
      await new Promise(r => setTimeout(r, 1000));
      setConnectProgress(80);

      try {
        await api.get(`/nas/${res.data.id}/live-stats`);
        setConnectLogs(prev => [...prev, 'Authentication successful.', 'Live stats retrieved.', '✅ Connection established successfully!']);
        setConnectProgress(100);
      } catch (err) {
        setConnectLogs(prev => [...prev, '⚠️ Database saved, but could not connect to router.', 'Please verify the API User, Password, and Port.']);
        setConnectProgress(100);
      }

      setTimeout(async () => {
        setIsConnecting(false);
        setForm({ name: '', ip_address: '', nas_secret: '', routeros_version: 'RouterOS v7 (Modern)', api_user: 'admin', api_password: '', api_port: '8728', coa_port: '3799' })
        await load()
      }, 3000);

    } catch (err) {
      console.error(err);
      setConnectLogs(prev => [...prev, '❌ Failed to register router. Check inputs.']);
      setConnectProgress(100);
      setTimeout(() => setIsConnecting(false), 3000);
    }
  }

  async function updateNas(item: Nas) {
    try {
      await api.put(`/network/nas/${item.id}`, {
        name: item.name,
        ip_address: item.ip_address,
        api_port: item.api_port,
        api_user: item.api_user,
        is_active: item.is_active,
      })
      setEditingId(null)
      await load()
    } catch (err) {
      console.error(err);
      alert('Failed to update router.');
    }
  }

  async function toggleNasStatus(item: Nas) {
    if (!window.confirm(`Are you sure you want to ${item.is_active ? 'disconnect' : 'connect'} router ${item.name}?`)) return
    try {
      await api.put(`/network/nas/${item.id}`, {
        name: item.name,
        ip_address: item.ip_address,
        api_port: item.api_port,
        api_user: item.api_user,
        is_active: !item.is_active,
      })
      await load()
    } catch (err) {
      console.error(err);
      alert(`Failed to ${item.is_active ? 'disconnect' : 'connect'} router.`);
    }
  }

  async function removeNas(item: Nas) {
    if (!window.confirm(`Delete NAS ${item.name}?`)) return
    try {
      await api.delete(`/network/nas/${item.id}`)
      if (selectedNas?.id === item.id) setSelectedNas(null)
      await load()
    } catch (err) {
      console.error(err);
      alert('Failed to delete router.');
    }
  }

  // Terminal Exec
  async function executeTerminalCommand() {
    if (!terminalInput.trim() || !selectedNas) return
    const cmd = terminalInput.trim()
    setRunningCmd(true)
    setTerminalLogs(prev => [...prev, `$ ${cmd}`])
    setTerminalInput('')
    
    try {
      const res = await api.post<{ output: any }>(`/nas/${selectedNas.id}/command`, { command: cmd })
      let outText = ''
      if (Array.isArray(res.data.output)) {
        outText = res.data.output.map(o => {
          return Object.entries(o)
            .filter(([k]) => !k.startsWith('.'))
            .map(([k, v]) => `${k}: ${v}`)
            .join(' | ')
        }).join('\n')
      } else {
        outText = typeof res.data.output === 'object' ? JSON.stringify(res.data.output, null, 2) : String(res.data.output)
      }
      setTerminalLogs(prev => [...prev, outText || 'Command completed with no output.'])
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.message || 'Execution error'
      setTerminalLogs(prev => [...prev, `Error: ${errMsg}`])
    } finally {
      setRunningCmd(false)
    }
  }

  // Telemetry Logs
  async function loadTelemetry(nasId: string) {
    setLoadingTelemetry(true)
    try {
      const res = await api.get(`/nas/${nasId}/telemetry`)
      setTelemetryData(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingTelemetry(false)
    }
  }

  // Backups
  async function loadBackups(nasId: string) {
    setLoadingBackups(true)
    try {
      const res = await api.get(`/nas/${nasId}/backups`)
      setBackups(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingBackups(false)
    }
  }

  async function handleCreateBackup(type: 'backup' | 'export') {
    if (!selectedNas) return
    setCreatingBackup(true)
    try {
      await api.post(`/nas/${selectedNas.id}/backups`, { backup_type: type })
      alert('Backup generated successfully!')
      await loadBackups(selectedNas.id)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create backup.')
    } finally {
      setCreatingBackup(false)
    }
  }

  async function downloadBackup(id: string, filename: string) {
    try {
      const res = await api.get(`/nas/backups/${id}/download`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      alert('Failed to download backup.')
    }
  }

  // Render Router Page (Details View)
  if (selectedNas) {
    const isOnlineResult = pingResults[selectedNas.id];
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setSelectedNas(null)} 
            className="p-2 rounded-lg border border-border hover:bg-bg-hover text-text-secondary transition-colors"
            title="Back to inventory"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-text-primary">{selectedNas.name}</h1>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 ${
                selectedNas.is_active ? 'bg-status-active/10 text-status-active' : 'bg-status-disabled/10 text-status-disabled'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${selectedNas.is_active ? 'bg-status-active' : 'bg-status-disabled'}`} />
                {selectedNas.is_active ? 'Active' : 'Disabled'}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-0.5">Router details, console shell and telemetry indicators</p>
          </div>
        </div>

        {/* Overview Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card p-4 space-y-1">
            <div className="text-xs text-text-muted">IP & Port</div>
            <div className="font-semibold text-sm text-text-primary">{selectedNas.ip_address}:{selectedNas.api_port}</div>
            <div className="text-[10px] text-text-muted">OS version: {selectedNas.routeros_version}</div>
          </div>
          <div className="card p-4 space-y-1">
            <div className="text-xs text-text-muted">Router Uptime</div>
            <div className="font-semibold text-sm text-text-primary">
              {loadingStats ? 'Loading...' : liveStats?.system?.uptime || 'Offline / Unknown'}
            </div>
            <div className="text-[10px] text-text-muted">Board: {liveStats?.system?.board_name || 'N/A'}</div>
          </div>
          <div className="card p-4 space-y-1">
            <div className="text-xs text-text-muted">CPU Load</div>
            <div className="font-semibold text-sm text-text-primary">
              {loadingStats ? 'Loading...' : liveStats?.system?.cpu_load !== undefined ? `${liveStats.system.cpu_load}%` : 'N/A'}
            </div>
            <div className="text-[10px] text-text-muted">Architecture: {liveStats?.system?.architecture || 'N/A'}</div>
          </div>
          <div className="card p-4 space-y-1">
            <div className="text-xs text-text-muted">On-Demand Diagnostic</div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => testPing(selectedNas.id)}
                disabled={isOnlineResult?.testing}
                className="btn-primary btn-sm !py-1 !px-2 text-[10px] flex items-center gap-1"
              >
                <Wifi size={10} /> {isOnlineResult?.testing ? 'Testing...' : 'Test Connection'}
              </button>
              {isOnlineResult && (
                <div className={`text-xs font-bold ${isOnlineResult.online ? 'text-green-500' : 'text-red-500'}`}>
                  {isOnlineResult.online ? `${isOnlineResult.latency}ms` : 'Failed'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Live Interface Traffic */}
        {liveStats?.interfaces && (
          <div className="card p-4">
            <h3 className="font-semibold text-xs text-text-muted uppercase mb-3 tracking-wider">Live Monitored Interfaces</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {liveStats.interfaces.map((iface: any, idx: number) => (
                <div key={idx} className="bg-bg-base/40 p-3 rounded-lg border border-border flex justify-between items-center">
                  <div>
                    <div className="font-bold text-xs text-text-primary">{iface.interface_name}</div>
                    <div className="text-[10px] text-text-muted">Interface ID monitor-once</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium text-text-primary">RX: <span className="text-green-600">{iface.rx_mbps} Mbps</span></div>
                    <div className="text-xs font-medium text-text-primary">TX: <span className="text-blue-600">{iface.tx_mbps} Mbps</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab Selection */}
        <div className="card p-5 space-y-4">
          <div className="flex gap-2 border-b border-border pb-px">
            <button 
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'terminal' ? 'border-accent-cyan text-accent-cyan' : 'border-transparent text-text-muted hover:text-text-secondary'}`}
              onClick={() => setActiveTab('terminal')}
            >
              <span className="flex items-center gap-1.5"><Terminal size={14} /> Terminal Console</span>
            </button>
            <button 
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'telemetry' ? 'border-accent-cyan text-accent-cyan' : 'border-transparent text-text-muted hover:text-text-secondary'}`}
              onClick={() => { setActiveTab('telemetry'); void loadTelemetry(selectedNas.id); }}
            >
              <span className="flex items-center gap-1.5"><Activity size={14} /> Latency Graph</span>
            </button>
            <button 
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'backups' ? 'border-accent-cyan text-accent-cyan' : 'border-transparent text-text-muted hover:text-text-secondary'}`}
              onClick={() => { setActiveTab('backups'); void loadBackups(selectedNas.id); }}
            >
              <span className="flex items-center gap-1.5"><Database size={14} /> Backups & Configs</span>
            </button>
          </div>

          {activeTab === 'terminal' && (
            <div className="space-y-3">
              <div className="bg-[#0c0f16] text-[#61ff80] font-mono text-xs p-4 rounded-xl h-64 overflow-y-auto space-y-2 border border-border/20 whitespace-pre-wrap">
                {terminalLogs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
              <div className="flex gap-2">
                <input 
                  className="input font-mono text-sm bg-bg-base" 
                  placeholder='e.g., "ip address print" or "ping 8.8.8.8"' 
                  value={terminalInput}
                  onChange={(e) => setTerminalInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void executeTerminalCommand()}
                  disabled={runningCmd}
                />
                <button className="btn-primary" onClick={executeTerminalCommand} disabled={runningCmd}>
                  {runningCmd ? <RefreshCw className="animate-spin" size={14} /> : <Send size={14} />}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'telemetry' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-text-primary">Connection Latency History (Last 50 Checks)</h4>
                <button className="btn-ghost btn-sm" onClick={() => void loadTelemetry(selectedNas.id)} disabled={loadingTelemetry}>
                  <RefreshCw size={12} className={loadingTelemetry ? 'animate-spin' : ''} />
                </button>
              </div>
              
              {loadingTelemetry ? (
                <div className="h-64 flex items-center justify-center text-text-muted text-sm">Loading telemetry data...</div>
              ) : telemetryData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-text-muted text-sm">No telemetry records found. Check back once background checker runs.</div>
              ) : (
                <div className="h-64 w-full bg-bg-base/40 p-4 rounded-xl border border-border">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={telemetryData}>
                      <XAxis 
                        dataKey="checked_at" 
                        tickFormatter={(str) => new Date(str).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 
                        stroke="currentColor" 
                        opacity={0.5} 
                        fontSize={10}
                      />
                      <YAxis stroke="currentColor" opacity={0.5} unit="ms" fontSize={10} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(15, 23, 42, 0.95)', 
                          border: '1px solid rgb(52, 67, 90)', 
                          borderRadius: '8px',
                          color: '#fff' 
                        }} 
                      />
                      <Line type="monotone" dataKey="latency_ms" name="Latency" stroke="#4285F4" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {activeTab === 'backups' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h4 className="text-sm font-semibold text-text-primary">Saved Configurations & Backups</h4>
                <div className="flex gap-2">
                  <button className="btn-primary btn-sm" onClick={() => void handleCreateBackup('export')} disabled={creatingBackup}>
                    {creatingBackup ? 'Creating...' : 'Generate RSC Config Export'}
                  </button>
                  <button className="btn-ghost btn-sm" onClick={() => void handleCreateBackup('backup')} disabled={creatingBackup}>
                    {creatingBackup ? 'Creating...' : 'Trigger Router Backup'}
                  </button>
                </div>
              </div>

              {loadingBackups ? (
                <div className="py-4 text-center text-text-muted text-sm">Loading backups...</div>
              ) : backups.length === 0 ? (
                <div className="py-8 text-center text-text-muted text-sm">No backups found. Generate one using the buttons above.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-text-muted border-b border-border">
                        <th className="py-2">File Name</th>
                        <th className="py-2">Type</th>
                        <th className="py-2">Date Created</th>
                        <th className="py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backups.map((b) => (
                        <tr key={b.id} className="border-b border-border/40">
                          <td className="py-2 text-text-primary font-medium">{b.filename}</td>
                          <td className="py-2 capitalize">{b.backup_type}</td>
                          <td className="py-2">{new Date(b.created_at).toLocaleString()}</td>
                          <td className="py-2">
                            <button className="btn-ghost btn-sm text-accent-cyan flex items-center gap-1.5" onClick={() => void downloadBackup(b.id, b.filename)}>
                              <Download size={12} /> Download
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Inventory Table View
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">IP / NAS Manager</h1>
          <p className="text-sm text-text-muted">Connect and manage NAS routers with live diagnostic & ping latency tests</p>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => load()}>Refresh</button>
      </div>

      <div className="card p-4 space-y-3 relative">
        {isConnecting && (
          <div className="absolute inset-0 bg-bg-base/80 backdrop-blur-sm z-10 flex flex-col justify-center items-center p-4 rounded-xl border border-border/50">
             <div className="w-full max-w-md bg-bg-surface p-6 rounded-xl shadow-lg space-y-4 border border-border">
                <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                  {connectProgress === 100 ? ((connectLogs[connectLogs.length-1]?.includes('❌') || connectLogs[connectLogs.length-2]?.includes('⚠️')) ? 'Connection Failed' : 'Connection Complete') : 'Connecting to Router...'}
                </h3>
                
                <div className="w-full bg-border rounded-full h-2 overflow-hidden">
                  <div className={`h-full transition-all duration-500 ${connectProgress === 100 ? ((connectLogs[connectLogs.length-1]?.includes('❌') || connectLogs[connectLogs.length-2]?.includes('⚠️')) ? 'bg-red-500' : 'bg-green-500') : 'bg-blue-500'}`} style={{ width: `${connectProgress}%` }}></div>
                </div>

                <div className="bg-[#0a0a0a] text-green-400 font-mono text-xs p-3 rounded-lg h-40 overflow-y-auto space-y-1 border border-[#222]">
                  {connectLogs.map((log, i) => <div key={i}>{'>'} {log}</div>)}
                </div>
             </div>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input className="input" placeholder="Router Identity e.g. Main-CCR" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="IP Address 192.168.88.1" value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} />
          <input className="input" placeholder="Radius Secret" value={form.nas_secret} onChange={(e) => setForm({ ...form, nas_secret: e.target.value })} />
          <input className="input" placeholder="RouterOS Version e.g. RouterOS v7" value={form.routeros_version} onChange={(e) => setForm({ ...form, routeros_version: e.target.value })} />
          <input className="input" placeholder="API Username admin" value={form.api_user} onChange={(e) => setForm({ ...form, api_user: e.target.value })} />
          <input className="input" placeholder="API Password" type="password" value={form.api_password} onChange={(e) => setForm({ ...form, api_password: e.target.value })} />
          <input className="input" placeholder="API Port 8728" value={form.api_port} onChange={(e) => setForm({ ...form, api_port: e.target.value })} />
          <input className="input" placeholder="CoA Port (Incoming) 3799" value={form.coa_port} onChange={(e) => setForm({ ...form, coa_port: e.target.value })} />
          <button className="btn-primary btn-sm md:col-span-4" onClick={createNas}><Plus size={14} /> Connect & Save New Router</button>
        </div>
        
        <div className="font-semibold text-text-primary flex items-center gap-2 pt-3 border-t border-border"><Router size={16} /> NAS Inventory ({nas.length})</div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                <th className="py-2">Name</th>
                <th className="py-2">IP</th>
                <th className="py-2">RouterOS</th>
                <th className="py-2">Port</th>
                <th className="py-2">User</th>
                <th className="py-2">Status & Ping</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {nas.map((n) => {
                const ping = pingResults[n.id];
                return (
                  <tr key={n.id} className="border-b border-border/40 hover:bg-bg-hover/20">
                    <td className="py-2.5 text-text-primary font-medium">
                      {editingId === n.id ? (
                        <input className="input !py-1 text-xs" value={n.name} onChange={(e) => setNas((prev) => prev.map((x) => x.id === n.id ? { ...x, name: e.target.value } : x))} />
                      ) : (
                        <button 
                          onClick={() => { setSelectedNas(n); setActiveTab('terminal'); }} 
                          className="hover:underline font-bold text-accent-cyan text-left"
                        >
                          {n.name}
                        </button>
                      )}
                    </td>
                    <td className="py-2.5">{editingId === n.id ? <input className="input !py-1 text-xs" value={n.ip_address} onChange={(e) => setNas((prev) => prev.map((x) => x.id === n.id ? { ...x, ip_address: e.target.value } : x))} /> : n.ip_address}</td>
                    <td className="py-2.5">{n.routeros_version}</td>
                    <td className="py-2.5">{editingId === n.id ? <input className="input !py-1 text-xs" value={n.api_port} onChange={(e) => setNas((prev) => prev.map((x) => x.id === n.id ? { ...x, api_port: Number(e.target.value) } : x))} /> : n.api_port}</td>
                    <td className="py-2.5">{n.api_user}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${n.is_active ? 'bg-status-active' : 'bg-status-disabled'}`} />
                        <span className="text-xs">{n.is_active ? 'Active' : 'Disabled'}</span>
                        {ping && (
                          <span className={`text-[10px] font-bold py-0.5 px-1.5 rounded ${
                            ping.online ? 'bg-status-active/10 text-status-active' : 'bg-status-expired/10 text-status-expired'
                          }`}>
                            {ping.online ? `${ping.latency}ms` : 'Offline'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5">
                      <div className="flex gap-2 items-center">
                        <button 
                          className="btn-ghost btn-sm text-accent-cyan hover:bg-blue-50 font-bold" 
                          title="Manage Router" 
                          onClick={() => { setSelectedNas(n); setActiveTab('terminal'); }}
                        >
                          Manage
                        </button>
                        <button 
                          className="btn-ghost btn-sm font-semibold" 
                          onClick={() => testPing(n.id)}
                          disabled={ping?.testing}
                        >
                          {ping?.testing ? 'Pinging...' : 'Ping Test'}
                        </button>
                        {editingId === n.id ? (
                          <button className="btn-primary btn-sm" onClick={() => updateNas(n)}>Save</button>
                        ) : (
                          <button className="btn-ghost btn-sm" title="Edit" onClick={() => setEditingId(n.id)}><Pencil size={12} /></button>
                        )}
                        <button 
                          className={`btn-ghost btn-sm font-semibold ${n.is_active ? 'text-red-500 hover:bg-red-50' : 'text-green-500 hover:bg-green-50'}`} 
                          onClick={() => toggleNasStatus(n)}
                        >
                          {n.is_active ? 'Disconnect' : 'Connect'}
                        </button>
                        <button className="btn-ghost btn-sm text-red-500 hover:bg-red-50" title="Delete" onClick={() => removeNas(n)}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
