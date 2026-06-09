import { useEffect, useState } from 'react'
import api from '../lib/api'

type Item = {
  id: number
  item_type: string
  brand: string | null
  model: string | null
  serial_no: string
  status: string
  subscriber_name?: string | null
  subscriber_id?: number | null
}

type Stats = { total: number; in_stock: number; assigned: number; rma: number }

export function InventoryCPE() {
  const [items, setItems] = useState<Item[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, in_stock: 0, assigned: 0, rma: 0 })
  const [form, setForm] = useState({ item_type: 'ONU', brand: '', model: '', serial_no: '' })

  async function load() {
    const [i, s] = await Promise.all([
      api.get<Item[]>('/inventory'),
      api.get<Stats>('/inventory/stats'),
    ])
    setItems(i.data)
    setStats(s.data)
  }

  useEffect(() => {
    load().catch(() => undefined)
  }, [])

  async function addItem() {
    if (!form.serial_no.trim()) return
    await api.post('/inventory', form)
    setForm({ item_type: 'ONU', brand: '', model: '', serial_no: '' })
    await load()
  }

  async function unassign(id: number) {
    await api.post(`/inventory/${id}/unassign`)
    await load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Inventory & CPE</h1>
          <p className="text-sm text-text-muted">Track ONUs/routers stock and subscriber assignment lifecycle</p>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => load()}>Refresh</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card"><p className="text-xs text-text-muted">Total</p><p className="text-2xl font-bold text-text-primary">{stats.total}</p></div>
        <div className="stat-card"><p className="text-xs text-text-muted">In Stock</p><p className="text-2xl font-bold text-status-active">{stats.in_stock}</p></div>
        <div className="stat-card"><p className="text-xs text-text-muted">Assigned</p><p className="text-2xl font-bold text-brand-blue">{stats.assigned}</p></div>
        <div className="stat-card"><p className="text-xs text-text-muted">RMA</p><p className="text-2xl font-bold text-status-warning">{stats.rma}</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold text-text-primary">Add Inventory Item</h3>
          <select className="select" value={form.item_type} onChange={(e) => setForm({ ...form, item_type: e.target.value })}>
            <option value="ONU">ONU</option>
            <option value="Router">Router</option>
            <option value="ONT">ONT</option>
            <option value="Adapter">Adapter</option>
          </select>
          <input className="input" placeholder="Brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          <input className="input" placeholder="Model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          <input className="input" placeholder="Serial number" value={form.serial_no} onChange={(e) => setForm({ ...form, serial_no: e.target.value })} />
          <button className="btn-primary w-full justify-center" onClick={addItem}>Add Item</button>
        </div>

        <div className="card p-4 lg:col-span-2">
          <h3 className="font-semibold text-text-primary mb-3">Inventory List</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {items.map((item) => (
              <div key={item.id} className="rounded-lg border border-border/70 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-text-primary">{item.item_type} • {item.serial_no}</p>
                  <span className="text-xs text-text-muted">{item.status}</span>
                </div>
                <p className="text-xs text-text-muted mt-1">{item.brand || 'N/A'} {item.model || ''}</p>
                {item.subscriber_name && (
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-text-muted">Assigned to: {item.subscriber_name}</p>
                    <button className="btn-ghost btn-sm" onClick={() => unassign(item.id)}>Unassign</button>
                  </div>
                )}
              </div>
            ))}
            {items.length === 0 && <p className="text-sm text-text-muted">No inventory items found.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
