import { useEffect, useState } from 'react'
import { MapPin, Pencil, Plus, RefreshCw } from 'lucide-react'
import api from '../lib/api'

type Zone = {
  id: string
  zone_code: string
  area_name: string
  city: string
  description: string | null
  is_active: boolean
}

export function ZonesAreas() {
  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ zone_code: '', area_name: '', city: '', description: '' })

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<Zone[]>('/network/zones')
      setZones(res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function createZone() {
    if (!form.zone_code || !form.area_name || !form.city) {
      alert('Please fill out Zone Code, Area Name, and City.');
      return;
    }
    try {
      await api.post('/network/zones', form)
      setForm({ zone_code: '', area_name: '', city: '', description: '' })
      await load()
    } catch (err: any) {
      console.error(err)
      const msg = err.response?.data?.error || 'Failed to create zone'
      alert(msg)
    }
  }

  async function saveZone(z: Zone) {
    try {
      await api.put(`/network/zones/${z.id}`, {
        area_name: z.area_name,
        city: z.city,
        description: z.description,
        is_active: z.is_active,
      })
      setEditingId(null)
      await load()
    } catch (err: any) {
      console.error(err)
      const msg = err.response?.data?.error || 'Failed to save zone'
      alert(msg)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Zone / Areas</h1>
          <p className="text-sm text-text-muted">Define operational areas and map network resources by zone</p>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => void load()}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="card p-4 space-y-3">
        <div className="font-semibold text-text-primary flex items-center gap-2"><Plus size={16} /> Create Zone</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input className="input" placeholder="Zone Code" value={form.zone_code} onChange={(e) => setForm({ ...form, zone_code: e.target.value })} />
          <input className="input" placeholder="Area Name" value={form.area_name} onChange={(e) => setForm({ ...form, area_name: e.target.value })} />
          <input className="input" placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <input className="input" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <button className="btn-primary btn-sm" onClick={() => void createZone()}><Plus size={14} /> Add Zone</button>
      </div>

      <div className="card p-4">
        <div className="font-semibold text-text-primary flex items-center gap-2 mb-3"><MapPin size={16} /> Areas ({zones.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                <th className="py-2">Code</th>
                <th className="py-2">Area</th>
                <th className="py-2">City</th>
                <th className="py-2">Description</th>
                <th className="py-2">Active</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.id} className="border-b border-border/40">
                  <td className="py-2 text-text-primary font-medium">{z.zone_code}</td>
                  <td className="py-2">
                    {editingId === z.id ? <input className="input" value={z.area_name} onChange={(e) => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, area_name: e.target.value } : x))} /> : z.area_name}
                  </td>
                  <td className="py-2">
                    {editingId === z.id ? <input className="input" value={z.city} onChange={(e) => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, city: e.target.value } : x))} /> : z.city}
                  </td>
                  <td className="py-2">
                    {editingId === z.id ? <input className="input" value={z.description || ''} onChange={(e) => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, description: e.target.value } : x))} /> : (z.description || 'N/A')}
                  </td>
                  <td className="py-2">
                    {editingId === z.id ? (
                      <select className="select" value={String(z.is_active)} onChange={(e) => setZones((prev) => prev.map((x) => x.id === z.id ? { ...x, is_active: e.target.value === 'true' } : x))}>
                        <option value="true">Active</option>
                        <option value="false">Disabled</option>
                      </select>
                    ) : (z.is_active ? 'Active' : 'Disabled')}
                  </td>
                  <td className="py-2">
                    {editingId === z.id ? (
                      <button className="btn-primary btn-sm" onClick={() => void saveZone(z)}>Save</button>
                    ) : (
                      <button className="btn-ghost btn-sm" onClick={() => setEditingId(z.id)}><Pencil size={12} /></button>
                    )}
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