import { useEffect, useState } from 'react'
import { Pencil, Plus, Server, Trash2 } from 'lucide-react'
import api from '../lib/api'

type Olt = {
  id: string
  name: string
  ip_address: string
  ssh_port: number
  ssh_user: string
  olt_type: string
  location: string | null
  is_active: boolean
}

type Onu = {
  serial: string
  interface?: string
  status?: string
  rx_power_dbm?: number | null
  tx_power_dbm?: number | null
}

type OnuPower = {
  serial: string
  rx_power_dbm: number | null
  tx_power_dbm: number | null
  status?: string
}

export function OLTManager() {
  const [olts, setOlts] = useState<Olt[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedOltId, setSelectedOltId] = useState<string>('')
  const [onus, setOnus] = useState<Onu[]>([])
  const [onuLoading, setOnuLoading] = useState(false)
  const [serialLookup, setSerialLookup] = useState('')
  const [powerResult, setPowerResult] = useState<OnuPower | null>(null)
  const [form, setForm] = useState({
    name: '', ip_address: '', ssh_port: '22', ssh_user: 'admin', ssh_password: '', olt_type: 'VSOL', location: '',
  })

  async function load() {
    const res = await api.get<Olt[]>('/network/olt')
    setOlts(res.data)
  }

  useEffect(() => {
    load().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!selectedOltId && olts.length > 0) {
      setSelectedOltId(olts[0].id)
    }
  }, [olts, selectedOltId])

  async function create() {
    if (!form.name || !form.ip_address || !form.ssh_user || !form.ssh_password) return
    await api.post('/network/olt', {
      ...form,
      ssh_port: Number(form.ssh_port),
    })
    setForm({ name: '', ip_address: '', ssh_port: '22', ssh_user: 'admin', ssh_password: '', olt_type: 'VSOL', location: '' })
    await load()
  }

  async function update(item: Olt) {
    await api.put(`/network/olt/${item.id}`, {
      name: item.name,
      ip_address: item.ip_address,
      ssh_port: item.ssh_port,
      ssh_user: item.ssh_user,
      olt_type: item.olt_type,
      location: item.location,
      is_active: item.is_active,
    })
    setEditingId(null)
    await load()
  }

  async function remove(item: Olt) {
    if (!window.confirm(`Delete OLT ${item.name}?`)) return
    await api.delete(`/network/olt/${item.id}`)
    await load()
  }

  async function loadOnus() {
    if (!selectedOltId) return
    setOnuLoading(true)
    setPowerResult(null)
    try {
      const res = await api.get<{ onus: Onu[] }>(`/nas/olt/${selectedOltId}/onus`)
      setOnus(res.data.onus || [])
    } finally {
      setOnuLoading(false)
    }
  }

  async function checkPower() {
    if (!selectedOltId || !serialLookup.trim()) return
    const res = await api.get<OnuPower>(`/nas/olt/${selectedOltId}/onu-power`, { params: { serial: serialLookup.trim() } })
    setPowerResult(res.data)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">OLT Manager</h1>
          <p className="text-sm text-text-muted">Fiber OLT device registry and health footprint</p>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => load()}>Refresh</button>
      </div>

      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="IP" value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} />
          <input className="input" placeholder="Port" value={form.ssh_port} onChange={(e) => setForm({ ...form, ssh_port: e.target.value })} />
          <input className="input" placeholder="SSH User" value={form.ssh_user} onChange={(e) => setForm({ ...form, ssh_user: e.target.value })} />
          <input className="input" placeholder="SSH Password" type="password" value={form.ssh_password} onChange={(e) => setForm({ ...form, ssh_password: e.target.value })} />
          <select className="select" value={form.olt_type} onChange={(e) => setForm({ ...form, olt_type: e.target.value })}>
            <option value="VSOL">VSOL</option>
            <option value="Huawei">Huawei</option>
            <option value="ZTE">ZTE</option>
            <option value="FiberHome">FiberHome</option>
            <option value="Other">Other</option>
          </select>
          <button className="btn-primary btn-sm" onClick={create}><Plus size={14} /> Add</button>
        </div>
        <div className="font-semibold text-text-primary flex items-center gap-2 mb-3"><Server size={16} /> OLT Devices ({olts.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                <th className="py-2">Name</th>
                <th className="py-2">Type</th>
                <th className="py-2">IP</th>
                <th className="py-2">SSH</th>
                <th className="py-2">Location</th>
                <th className="py-2">Status</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {olts.map((o) => (
                <tr key={o.id} className="border-b border-border/40">
                  <td className="py-2 text-text-primary font-medium">{editingId === o.id ? <input className="input" value={o.name} onChange={(e) => setOlts((prev) => prev.map((x) => x.id === o.id ? { ...x, name: e.target.value } : x))} /> : o.name}</td>
                  <td className="py-2">{editingId === o.id ? <input className="input" value={o.olt_type} onChange={(e) => setOlts((prev) => prev.map((x) => x.id === o.id ? { ...x, olt_type: e.target.value } : x))} /> : o.olt_type}</td>
                  <td className="py-2">{editingId === o.id ? <input className="input" value={o.ip_address} onChange={(e) => setOlts((prev) => prev.map((x) => x.id === o.id ? { ...x, ip_address: e.target.value } : x))} /> : o.ip_address}</td>
                  <td className="py-2">{editingId === o.id ? <div className="grid grid-cols-2 gap-1"><input className="input" value={o.ssh_user} onChange={(e) => setOlts((prev) => prev.map((x) => x.id === o.id ? { ...x, ssh_user: e.target.value } : x))} /><input className="input" value={o.ssh_port} onChange={(e) => setOlts((prev) => prev.map((x) => x.id === o.id ? { ...x, ssh_port: Number(e.target.value) } : x))} /></div> : `${o.ssh_user}@${o.ssh_port}`}</td>
                  <td className="py-2">{editingId === o.id ? <input className="input" value={o.location || ''} onChange={(e) => setOlts((prev) => prev.map((x) => x.id === o.id ? { ...x, location: e.target.value } : x))} /> : (o.location || 'N/A')}</td>
                  <td className="py-2">{o.is_active ? 'Active' : 'Disabled'}</td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      {editingId === o.id ? <button className="btn-primary btn-sm" onClick={() => update(o)}>Save</button> : <button className="btn-ghost btn-sm" onClick={() => setEditingId(o.id)}><Pencil size={12} /></button>}
                      <button className="btn-ghost btn-sm" onClick={() => remove(o)}><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-text-primary">Advanced OLT Operations</h3>
            <p className="text-xs text-text-muted">List ONUs and check optical power for a serial</p>
          </div>
          <button className="btn-ghost btn-sm" onClick={() => void loadOnus()}>Refresh ONUs</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <select className="select" value={selectedOltId} onChange={(e) => setSelectedOltId(e.target.value)}>
            <option value="">Select OLT</option>
            {olts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button className="btn-primary btn-sm" onClick={() => void loadOnus()} disabled={!selectedOltId || onuLoading}>
            {onuLoading ? 'Loading...' : 'List ONUs'}
          </button>
          <input className="input" placeholder="ONU Serial" value={serialLookup} onChange={(e) => setSerialLookup(e.target.value)} />
          <button className="btn-primary btn-sm" onClick={() => void checkPower()} disabled={!selectedOltId || !serialLookup.trim()}>
            Check Power
          </button>
        </div>

        {powerResult && (
          <div className="rounded-lg border border-border p-3 bg-bg-base text-sm">
            <p className="font-medium text-text-primary">Power Reading: {powerResult.serial}</p>
            <p className="text-text-muted">RX: {powerResult.rx_power_dbm ?? 'N/A'} dBm</p>
            <p className="text-text-muted">TX: {powerResult.tx_power_dbm ?? 'N/A'} dBm</p>
            {powerResult.status ? <p className="text-text-muted">Status: {powerResult.status}</p> : null}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                <th className="py-2">Serial</th>
                <th className="py-2">Interface</th>
                <th className="py-2">Status</th>
                <th className="py-2">RX</th>
                <th className="py-2">TX</th>
              </tr>
            </thead>
            <tbody>
              {onus.map((o, idx) => (
                <tr key={`${o.serial}-${idx}`} className="border-b border-border/40">
                  <td className="py-2 font-mono text-xs text-text-primary">{o.serial || 'N/A'}</td>
                  <td className="py-2 text-text-muted">{o.interface || 'N/A'}</td>
                  <td className="py-2 text-text-muted">{o.status || 'Unknown'}</td>
                  <td className="py-2 text-text-muted">{o.rx_power_dbm ?? 'N/A'}</td>
                  <td className="py-2 text-text-muted">{o.tx_power_dbm ?? 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {onus.length === 0 ? <p className="text-xs text-text-muted py-3">No ONUs loaded yet for selected OLT.</p> : null}
        </div>
      </div>
    </div>
  )
}
