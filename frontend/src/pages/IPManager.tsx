import { useEffect, useState } from 'react'
import { Pencil, Plus, Router, Trash2 } from 'lucide-react'
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

  async function load() {
    const nasRes = await api.get<Nas[]>('/network/nas')
    setNas(nasRes.data)
  }

  useEffect(() => {
    load().catch(() => undefined)
  }, [])

  async function createNas() {
    if (!form.name || !form.ip_address || !form.api_user || !form.api_password || !form.nas_secret) return
    await api.post('/network/nas', {
      name: form.name,
      ip_address: form.ip_address,
      routeros_version: form.routeros_version,
      api_port: Number(form.api_port),
      coa_port: Number(form.coa_port),
      api_user: form.api_user,
      api_password: form.api_password,
      nas_secret: form.nas_secret,
    })
    setForm({ name: '', ip_address: '', nas_secret: '', routeros_version: 'RouterOS v7 (Modern)', api_user: 'admin', api_password: '', api_port: '8728', coa_port: '3799' })
    await load()
  }

  async function updateNas(item: Nas) {
    await api.put(`/network/nas/${item.id}`, {
      name: item.name,
      ip_address: item.ip_address,
      api_port: item.api_port,
      api_user: item.api_user,
      is_active: item.is_active,
    })
    setEditingId(null)
    await load()
  }

  async function removeNas(item: Nas) {
    if (!window.confirm(`Delete NAS ${item.name}?`)) return
    await api.delete(`/network/nas/${item.id}`)
    await load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">IP / NAS Manager</h1>
          <p className="text-sm text-text-muted">Connect and manage NAS routers with the required API settings only</p>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => load()}>Refresh</button>
      </div>

      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input className="input" placeholder="Router Identity e.g. Main-CCR" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="IP Address 192.168.88.1" value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} />
          <input className="input" placeholder="Radius Secret" value={form.nas_secret} onChange={(e) => setForm({ ...form, nas_secret: e.target.value })} />
          <input className="input" placeholder="RouterOS Version e.g. RouterOS v7 (Modern)" value={form.routeros_version} onChange={(e) => setForm({ ...form, routeros_version: e.target.value })} />
          <input className="input" placeholder="API Username admin" value={form.api_user} onChange={(e) => setForm({ ...form, api_user: e.target.value })} />
          <input className="input" placeholder="API Password" type="password" value={form.api_password} onChange={(e) => setForm({ ...form, api_password: e.target.value })} />
          <input className="input" placeholder="API Port 8728" value={form.api_port} onChange={(e) => setForm({ ...form, api_port: e.target.value })} />
          <input className="input" placeholder="CoA Port (Incoming) 3799" value={form.coa_port} onChange={(e) => setForm({ ...form, coa_port: e.target.value })} />
          <button className="btn-primary btn-sm" onClick={createNas}><Plus size={14} /> Connect New Router</button>
        </div>
        <div className="font-semibold text-text-primary flex items-center gap-2 mb-3"><Router size={16} /> NAS Inventory ({nas.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                <th className="py-2">Name</th>
                <th className="py-2">IP</th>
                <th className="py-2">RouterOS</th>
                <th className="py-2">Port</th>
                <th className="py-2">CoA</th>
                <th className="py-2">User</th>
                <th className="py-2">Status</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {nas.map((n) => (
                <tr key={n.id} className="border-b border-border/40">
                  <td className="py-2 text-text-primary font-medium">{editingId === n.id ? <input className="input" value={n.name} onChange={(e) => setNas((prev) => prev.map((x) => x.id === n.id ? { ...x, name: e.target.value } : x))} /> : n.name}</td>
                  <td className="py-2">{editingId === n.id ? <input className="input" value={n.ip_address} onChange={(e) => setNas((prev) => prev.map((x) => x.id === n.id ? { ...x, ip_address: e.target.value } : x))} /> : n.ip_address}</td>
                  <td className="py-2">{n.routeros_version}</td>
                  <td className="py-2">{editingId === n.id ? <input className="input" value={n.api_port} onChange={(e) => setNas((prev) => prev.map((x) => x.id === n.id ? { ...x, api_port: Number(e.target.value) } : x))} /> : n.api_port}</td>
                  <td className="py-2">{n.coa_port}</td>
                  <td className="py-2">{editingId === n.id ? <input className="input" value={n.api_user} onChange={(e) => setNas((prev) => prev.map((x) => x.id === n.id ? { ...x, api_user: e.target.value } : x))} /> : n.api_user}</td>
                  <td className="py-2">{n.is_active ? 'Active' : 'Disabled'}</td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      {editingId === n.id ? <button className="btn-primary btn-sm" onClick={() => updateNas(n)}>Save</button> : <button className="btn-ghost btn-sm" onClick={() => setEditingId(n.id)}><Pencil size={12} /></button>}
                      <button className="btn-ghost btn-sm" onClick={() => removeNas(n)}><Trash2 size={12} /></button>
                    </div>
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
