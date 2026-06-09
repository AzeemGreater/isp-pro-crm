import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, RefreshCw, Trash2, Wallet } from 'lucide-react'
import api from '../lib/api'

type SubDealer = {
  id: string
  username: string
  full_name: string
  email: string | null
  wallet_balance: string
  is_active: boolean
  permissions_json: Record<string, boolean>
  total_users: number
  online_users: number
  offline_users: number
  disabled_users: number
  expired_users: number
}

export function SubDealers() {
  const [rows, setRows] = useState<SubDealer[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creditId, setCreditId] = useState('')
  const [creditAmount, setCreditAmount] = useState('0')

  const [form, setForm] = useState({
    username: '',
    full_name: '',
    email: '',
    password: '',
    wallet_balance: '0',
    permissions_json: {
      renew: true,
      create_subscriber: true,
      view_reports: false,
      outage_broadcast: false,
    },
  })

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<SubDealer[]>('/agents/subdealers/overview')
      setRows(res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load().catch(() => undefined)
  }, [])

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        subdealers: acc.subdealers + 1,
        total: acc.total + Number(r.total_users || 0),
        online: acc.online + Number(r.online_users || 0),
        offline: acc.offline + Number(r.offline_users || 0),
        disabled: acc.disabled + Number(r.disabled_users || 0),
        expired: acc.expired + Number(r.expired_users || 0),
      }),
      { subdealers: 0, total: 0, online: 0, offline: 0, disabled: 0, expired: 0 }
    )
  }, [rows])

  async function createSubDealer() {
    if (!form.username || !form.full_name || !form.password) return
    setSaving(true)
    try {
      await api.post('/agents', {
        ...form,
        role: 'Subdealer',
      })
      setForm({
        username: '',
        full_name: '',
        email: '',
        password: '',
        wallet_balance: '0',
        permissions_json: {
          renew: true,
          create_subscriber: true,
          view_reports: false,
          outage_broadcast: false,
        },
      })
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function saveRow(row: SubDealer) {
    setSaving(true)
    try {
      await api.put(`/agents/${row.id}`, {
        full_name: row.full_name,
        email: row.email,
        is_active: row.is_active,
        role: 'Subdealer',
        wallet_balance: Number(row.wallet_balance || 0),
        permissions_json: row.permissions_json,
      })
      setEditingId(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function removeRow(row: SubDealer) {
    if (!window.confirm(`Delete subdealer ${row.full_name}?`)) return
    await api.delete(`/agents/${row.id}`)
    await load()
  }

  async function addBalance() {
    if (!creditId || Number(creditAmount) <= 0) return
    await api.post(`/agents/${creditId}/credit`, { amount: Number(creditAmount), description: 'Subdealer top-up' })
    setCreditId('')
    setCreditAmount('0')
    await load()
  }

  function updatePermission(id: string, key: string) {
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r
      return { ...r, permissions_json: { ...r.permissions_json, [key]: !r.permissions_json?.[key] } }
    }))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Sub Dealers</h1>
          <p className="text-sm text-text-muted">Manage subdealers, permissions, balance and quick user status</p>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => load()}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="card p-3"><p className="text-xs text-text-muted">Sub Dealers</p><p className="text-2xl font-bold text-text-primary">{summary.subdealers}</p></div>
        <div className="card p-3"><p className="text-xs text-text-muted">Total Users</p><p className="text-2xl font-bold text-accent-cyan">{summary.total}</p></div>
        <div className="card p-3"><p className="text-xs text-text-muted">Online</p><p className="text-2xl font-bold text-status-active">{summary.online}</p></div>
        <div className="card p-3"><p className="text-xs text-text-muted">Offline</p><p className="text-2xl font-bold text-text-secondary">{summary.offline}</p></div>
        <div className="card p-3"><p className="text-xs text-text-muted">Disabled</p><p className="text-2xl font-bold text-status-expired">{summary.disabled}</p></div>
        <div className="card p-3"><p className="text-xs text-text-muted">Expired</p><p className="text-2xl font-bold text-status-warning">{summary.expired}</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-text-primary"><Plus size={16} /> Add Subdealer</div>
          <input className="input" placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input className="input" placeholder="Full Name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <input className="input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <input className="input" placeholder="Opening Balance" value={form.wallet_balance} onChange={(e) => setForm({ ...form, wallet_balance: e.target.value })} />
          <div className="grid grid-cols-2 gap-2 text-xs text-text-muted">
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!form.permissions_json.renew} onChange={(e) => setForm({ ...form, permissions_json: { ...form.permissions_json, renew: e.target.checked } })} /> Renew</label>
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!form.permissions_json.create_subscriber} onChange={(e) => setForm({ ...form, permissions_json: { ...form.permissions_json, create_subscriber: e.target.checked } })} /> Add Subscriber</label>
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!form.permissions_json.view_reports} onChange={(e) => setForm({ ...form, permissions_json: { ...form.permissions_json, view_reports: e.target.checked } })} /> Reports</label>
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!form.permissions_json.outage_broadcast} onChange={(e) => setForm({ ...form, permissions_json: { ...form.permissions_json, outage_broadcast: e.target.checked } })} /> Outage Alerts</label>
          </div>
          <button className="btn-primary w-full justify-center" onClick={createSubDealer} disabled={saving}>{saving ? 'Saving...' : 'Create Subdealer'}</button>
        </div>

        <div className="card p-4 lg:col-span-2">
          <div className="flex gap-2 mb-3">
            <select className="select" value={creditId} onChange={(e) => setCreditId(e.target.value)}>
              <option value="">Select subdealer</option>
              {rows.map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
            </select>
            <input className="input" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} placeholder="Balance amount" />
            <button className="btn-primary btn-sm" onClick={addBalance}><Wallet size={14} /> Add Balance</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted border-b border-border">
                  <th className="py-2">Subdealer</th>
                  <th className="py-2">Balance</th>
                  <th className="py-2">Quick User Status</th>
                  <th className="py-2">Permissions</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/40">
                    <td className="py-2">
                      {editingId === r.id ? (
                        <div className="space-y-1">
                          <input className="input" value={r.full_name} onChange={(e) => setRows((prev) => prev.map((x) => x.id === r.id ? { ...x, full_name: e.target.value } : x))} />
                          <input className="input" value={r.email || ''} onChange={(e) => setRows((prev) => prev.map((x) => x.id === r.id ? { ...x, email: e.target.value } : x))} />
                        </div>
                      ) : (
                        <>
                          <div className="font-medium text-text-primary">{r.full_name}</div>
                          <div className="text-xs text-text-muted">@{r.username}</div>
                        </>
                      )}
                    </td>
                    <td className="py-2">Rs. {Number(r.wallet_balance || 0).toLocaleString()}</td>
                    <td className="py-2">
                      <div className="text-xs text-text-secondary">Total: {r.total_users} | Online: {r.online_users} | Offline: {r.offline_users} | Disabled: {r.disabled_users} | Expired: {r.expired_users}</div>
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2 text-xs">
                        {['renew', 'create_subscriber', 'view_reports', 'outage_broadcast'].map((key) => (
                          <label key={key} className="inline-flex items-center gap-1">
                            <input type="checkbox" checked={!!r.permissions_json?.[key]} disabled={editingId !== r.id} onChange={() => updatePermission(r.id, key)} />
                            {key.replace('_', ' ')}
                          </label>
                        ))}
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        {editingId === r.id ? (
                          <button className="btn-primary btn-sm" onClick={() => saveRow(r)}>Save</button>
                        ) : (
                          <button className="btn-ghost btn-sm" onClick={() => setEditingId(r.id)}><Pencil size={12} /></button>
                        )}
                        <button className="btn-ghost btn-sm" onClick={() => removeRow(r)}><Trash2 size={12} /></button>
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
