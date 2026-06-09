import { useEffect, useState } from 'react'
import { Pencil, Trash2, UserPlus, Users, Wallet } from 'lucide-react'
import api from '../lib/api'

type AdminUser = {
  id: string
  username: string
  email: string | null
  full_name: string
  role: string
  role_label?: string
  wallet_balance: string
  customer_limit: number | null
  customers_used?: number
  customers_remaining?: number | null
  is_active: boolean
  permissions_json?: Record<string, boolean>
}

export function UserManagement() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    username: '',
    full_name: '',
    email: '',
    password: '',
    role: 'Subdealer',
    wallet_balance: '0',
    customer_limit: '500',
    permissions_json: {
      renew: true,
      create_subscriber: false,
      view_reports: false,
      outage_broadcast: false,
    },
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creditId, setCreditId] = useState<string>('')
  const [creditAmount, setCreditAmount] = useState('0')
  const [debitId, setDebitId] = useState<string>('')
  const [debitAmount, setDebitAmount] = useState('0')
  const [bulkAmount, setBulkAmount] = useState('0')

  async function loadUsers() {
    setLoading(true)
    try {
      const res = await api.get<AdminUser[]>('/agents')
      setUsers(res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers().catch(() => undefined)
  }, [])

  async function createUser() {
    if (!form.username || !form.full_name || !form.password) return
    setSaving(true)
    try {
      await api.post('/agents', form)
      setForm({
        username: '', full_name: '', email: '', password: '', role: 'Subdealer', wallet_balance: '0', customer_limit: '500',
        permissions_json: { renew: true, create_subscriber: false, view_reports: false, outage_broadcast: false },
      })
      await loadUsers()
    } finally {
      setSaving(false)
    }
  }

  async function updateUser(user: AdminUser) {
    setSaving(true)
    try {
      await api.put(`/agents/${user.id}`, {
        email: user.email,
        full_name: user.full_name,
        role: user.role_label || user.role,
        wallet_balance: Number(user.wallet_balance || 0),
        customer_limit: user.customer_limit,
        is_active: user.is_active,
        permissions_json: user.permissions_json || {},
      })
      setEditingId(null)
      await loadUsers()
    } finally {
      setSaving(false)
    }
  }

  async function removeUser(user: AdminUser) {
    if (!window.confirm(`Delete ${user.full_name}?`)) return
    await api.delete(`/agents/${user.id}`)
    await loadUsers()
  }

  async function addBalance() {
    if (!creditId || Number(creditAmount) <= 0) return
    await api.post(`/agents/${creditId}/credit`, { amount: Number(creditAmount), description: 'Manual balance top-up' })
    setCreditId('')
    setCreditAmount('0')
    await loadUsers()
  }

  async function removeBalance() {
    if (!debitId || Number(debitAmount) <= 0) return
    await api.post(`/agents/${debitId}/debit`, { amount: Number(debitAmount), description: 'Manual balance deduction' })
    setDebitId('')
    setDebitAmount('0')
    await loadUsers()
  }

  async function bulkCredit() {
    if (Number(bulkAmount) <= 0) return
    await api.post('/agents/bulk-credit', { amount: Number(bulkAmount), role: 'Subdealer', description: 'Bulk Subdealer top-up' })
    setBulkAmount('0')
    await loadUsers()
  }

  function togglePermission(userId: string, key: string) {
    setUsers((prev) => prev.map((u) => {
      if (u.id !== userId) return u
      const current = u.permissions_json || {}
      return { ...u, permissions_json: { ...current, [key]: !current[key] } }
    }))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">User Management</h1>
          <p className="text-sm text-text-muted">Create admins/agents and monitor wallet health</p>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => loadUsers()}>
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4 lg:col-span-1 space-y-3">
          <div className="flex items-center gap-2 text-text-primary font-semibold"><UserPlus size={16} /> Add User</div>
          <input className="input" placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input className="input" placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <input className="input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="Subdealer">Subdealer</option>
              <option value="Admin">Admin</option>
              <option value="Viewer">Viewer</option>
            </select>
            <input className="input" placeholder="Wallet" value={form.wallet_balance} onChange={(e) => setForm({ ...form, wallet_balance: e.target.value })} />
          </div>
          <input
            className="input"
            placeholder="Customer limit (blank = unlimited)"
            value={form.customer_limit}
            onChange={(e) => setForm({ ...form, customer_limit: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2 text-xs text-text-muted">
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!form.permissions_json.renew} onChange={(e) => setForm({ ...form, permissions_json: { ...form.permissions_json, renew: e.target.checked } })} /> Renew</label>
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!form.permissions_json.create_subscriber} onChange={(e) => setForm({ ...form, permissions_json: { ...form.permissions_json, create_subscriber: e.target.checked } })} /> Add Subscriber</label>
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!form.permissions_json.view_reports} onChange={(e) => setForm({ ...form, permissions_json: { ...form.permissions_json, view_reports: e.target.checked } })} /> Reports</label>
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!form.permissions_json.outage_broadcast} onChange={(e) => setForm({ ...form, permissions_json: { ...form.permissions_json, outage_broadcast: e.target.checked } })} /> Outage Alerts</label>
          </div>
          <button className="btn-primary w-full justify-center" onClick={createUser} disabled={saving}>
            {saving ? 'Creating...' : 'Create User'}
          </button>
        </div>

        <div className="card p-4 lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
            <div className="flex gap-2">
              <select className="select" value={creditId} onChange={(e) => setCreditId(e.target.value)}>
                <option value="">Select subdealer</option>
                {users.filter((u) => (u.role_label || u.role) === 'Subdealer').map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
              <input className="input" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} placeholder="Amount" />
              <button className="btn-primary btn-sm" onClick={addBalance}>Add Balance</button>
            </div>
            <div className="flex gap-2">
              <select className="select" value={debitId} onChange={(e) => setDebitId(e.target.value)}>
                <option value="">Select subdealer</option>
                {users.filter((u) => (u.role_label || u.role) === 'Subdealer').map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
              <input className="input" value={debitAmount} onChange={(e) => setDebitAmount(e.target.value)} placeholder="Amount" />
              <button className="btn-danger btn-sm" onClick={removeBalance}>Remove Balance</button>
            </div>
            <div className="flex gap-2 md:col-span-2">
              <input className="input" value={bulkAmount} onChange={(e) => setBulkAmount(e.target.value)} placeholder="Bulk amount for all subdealers" />
              <button className="btn-ghost btn-sm" onClick={bulkCredit}>Add To All Subdealers</button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-text-primary font-semibold mb-3"><Users size={16} /> Team Accounts ({users.length})</div>
          {loading ? (
            <p className="text-sm text-text-muted">Loading users...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-muted border-b border-border">
                    <th className="py-2">User</th>
                    <th className="py-2">Role</th>
                    <th className="py-2">Wallet</th>
                    <th className="py-2">Customers Limit</th>
                    <th className="py-2">Permissions</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-border/40">
                      <td className="py-2">
                        {editingId === u.id ? (
                          <div className="space-y-1">
                            <input className="input" value={u.full_name} onChange={(e) => setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, full_name: e.target.value } : x))} />
                            <input className="input" value={u.email || ''} onChange={(e) => setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, email: e.target.value } : x))} />
                          </div>
                        ) : (
                          <>
                            <div className="font-medium text-text-primary">{u.full_name}</div>
                            <div className="text-xs text-text-muted">@{u.username}</div>
                          </>
                        )}
                      </td>
                      <td className="py-2">
                        {editingId === u.id ? (
                          <select className="select" value={u.role_label || u.role} onChange={(e) => setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, role_label: e.target.value } : x))}>
                            <option value="Subdealer">Subdealer</option>
                            <option value="Admin">Admin</option>
                            <option value="Viewer">Viewer</option>
                            <option value="SuperAdmin">SuperAdmin</option>
                          </select>
                        ) : (
                          (u.role_label || u.role)
                        )}
                      </td>
                      <td className="py-2">
                        <span className="inline-flex items-center gap-1"><Wallet size={12} /> Rs. {Number(u.wallet_balance || 0).toLocaleString()}</span>
                      </td>
                      <td className="py-2">
                        {editingId === u.id ? (
                          <input
                            className="input"
                            value={u.customer_limit === null || u.customer_limit === undefined ? '' : String(u.customer_limit)}
                            onChange={(e) => setUsers((prev) => prev.map((x) => x.id === u.id ? {
                              ...x,
                              customer_limit: e.target.value.trim() === '' ? null : Number(e.target.value),
                            } : x))}
                            placeholder="Unlimited"
                          />
                        ) : (
                          <div>
                            <p className="text-sm text-text-primary">
                              {u.customer_limit === null || u.customer_limit === undefined
                                ? 'Unlimited'
                                : `${u.customers_used || 0}/${u.customer_limit}`}
                            </p>
                            <p className="text-xs text-text-muted">
                              Remaining: {u.customers_remaining === null || u.customers_remaining === undefined ? 'Unlimited' : u.customers_remaining}
                            </p>
                          </div>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2 text-xs">
                          {['renew', 'create_subscriber', 'view_reports', 'outage_broadcast'].map((key) => (
                            <label key={key} className="inline-flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={!!u.permissions_json?.[key]}
                                disabled={editingId !== u.id}
                                onChange={() => togglePermission(u.id, key)}
                              />
                              {key.replace('_', ' ')}
                            </label>
                          ))}
                        </div>
                      </td>
                      <td className="py-2">{u.is_active ? 'Active' : 'Disabled'}</td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          {editingId === u.id ? (
                            <button className="btn-primary btn-sm" onClick={() => updateUser(u)}>Save</button>
                          ) : (
                            <button className="btn-ghost btn-sm" onClick={() => setEditingId(u.id)}><Pencil size={12} /></button>
                          )}
                          <button className="btn-ghost btn-sm" onClick={() => removeUser(u)}><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
