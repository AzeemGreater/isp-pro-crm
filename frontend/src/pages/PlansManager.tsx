import { useEffect, useState } from 'react'
import { ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react'
import api from '../lib/api'

type Plan = {
  id: string
  name: string
  download_speed: number
  upload_speed: number
  retail_price: string
  wholesale_cost: string
  validity_days: number
  subscriber_count?: number
}

export function PlansManager() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    download_speed: '10',
    upload_speed: '10',
    retail_price: '1200',
    wholesale_cost: '800',
    validity_days: '30',
  })

  async function loadPlans() {
    const res = await api.get<Plan[]>('/network/profiles')
    setPlans(res.data)
  }

  useEffect(() => {
    loadPlans().catch(() => undefined)
  }, [])

  async function createPlan() {
    if (!form.name) return
    setSaving(true)
    try {
      await api.post('/network/profiles', form)
      setForm({ name: '', download_speed: '10', upload_speed: '10', retail_price: '1200', wholesale_cost: '800', validity_days: '30' })
      await loadPlans()
    } finally {
      setSaving(false)
    }
  }

  async function updatePlan(plan: Plan) {
    await api.put(`/network/profiles/${plan.id}`, {
      name: plan.name,
      download_speed: plan.download_speed,
      upload_speed: plan.upload_speed,
      retail_price: Number(plan.retail_price),
      wholesale_cost: Number(plan.wholesale_cost),
      validity_days: plan.validity_days,
      is_active: true,
    })
    setEditingId(null)
    await loadPlans()
  }

  async function removePlan(plan: Plan) {
    if (!window.confirm(`Delete plan ${plan.name}?`)) return
    await api.delete(`/network/profiles/${plan.id}`)
    await loadPlans()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Plans Manager</h1>
          <p className="text-sm text-text-muted">Plan catalog, pricing and active subscriber distribution</p>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => loadPlans()}>Refresh</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4 space-y-3">
          <div className="font-semibold text-text-primary flex items-center gap-2"><Plus size={16} /> Create Plan</div>
          <input className="input" placeholder="Plan name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Down Mbps" value={form.download_speed} onChange={(e) => setForm({ ...form, download_speed: e.target.value })} />
            <input className="input" placeholder="Up Mbps" value={form.upload_speed} onChange={(e) => setForm({ ...form, upload_speed: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Retail" value={form.retail_price} onChange={(e) => setForm({ ...form, retail_price: e.target.value })} />
            <input className="input" placeholder="Wholesale" value={form.wholesale_cost} onChange={(e) => setForm({ ...form, wholesale_cost: e.target.value })} />
          </div>
          <input className="input" placeholder="Validity days" value={form.validity_days} onChange={(e) => setForm({ ...form, validity_days: e.target.value })} />
          <button className="btn-primary w-full justify-center" disabled={saving} onClick={createPlan}>{saving ? 'Saving...' : 'Add Plan'}</button>
        </div>

        <div className="card p-4 lg:col-span-2">
          <div className="font-semibold text-text-primary flex items-center gap-2 mb-3"><ClipboardList size={16} /> Active Plans ({plans.length})</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted border-b border-border">
                  <th className="py-2">Plan</th>
                  <th className="py-2">Speed</th>
                  <th className="py-2">Retail</th>
                  <th className="py-2">Users</th>
                  <th className="py-2">Validity</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className="border-b border-border/40">
                    <td className="py-2 text-text-primary font-medium">
                      {editingId === p.id ? (
                        <input className="input" value={p.name} onChange={(e) => setPlans((prev) => prev.map((x) => x.id === p.id ? { ...x, name: e.target.value } : x))} />
                      ) : p.name}
                    </td>
                    <td className="py-2">
                      {editingId === p.id ? (
                        <div className="grid grid-cols-2 gap-1">
                          <input className="input" value={p.download_speed} onChange={(e) => setPlans((prev) => prev.map((x) => x.id === p.id ? { ...x, download_speed: Number(e.target.value) } : x))} />
                          <input className="input" value={p.upload_speed} onChange={(e) => setPlans((prev) => prev.map((x) => x.id === p.id ? { ...x, upload_speed: Number(e.target.value) } : x))} />
                        </div>
                      ) : `${p.download_speed} / ${p.upload_speed} Mbps`}
                    </td>
                    <td className="py-2">
                      {editingId === p.id ? (
                        <input className="input" value={p.retail_price} onChange={(e) => setPlans((prev) => prev.map((x) => x.id === p.id ? { ...x, retail_price: e.target.value } : x))} />
                      ) : `Rs. ${Number(p.retail_price).toLocaleString()}`}
                    </td>
                    <td className="py-2">{p.subscriber_count || 0}</td>
                    <td className="py-2">
                      {editingId === p.id ? (
                        <input className="input" value={p.validity_days} onChange={(e) => setPlans((prev) => prev.map((x) => x.id === p.id ? { ...x, validity_days: Number(e.target.value) } : x))} />
                      ) : `${p.validity_days} days`}
                    </td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        {editingId === p.id ? (
                          <button className="btn-primary btn-sm" onClick={() => updatePlan(p)}>Save</button>
                        ) : (
                          <button className="btn-ghost btn-sm" onClick={() => setEditingId(p.id)}><Pencil size={12} /></button>
                        )}
                        <button className="btn-ghost btn-sm" onClick={() => removePlan(p)}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
