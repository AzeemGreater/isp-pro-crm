import { useEffect, useState } from 'react'
import { CircleDollarSign, RefreshCw, Users, Wallet } from 'lucide-react'
import api from '../lib/api'

type UserRow = {
  id: string
  full_name: string
  role: string
  role_label?: string
  wallet_balance: string
  is_active: boolean
}

type LedgerRow = {
  id: number
  transaction_type: string
  amount: string
  description: string
  payment_method: string | null
  admin_username: string | null
  created_at: string
}

export function RechargeCards() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [targetId, setTargetId] = useState('')
  const [amount, setAmount] = useState('0')
  const [bulkAmount, setBulkAmount] = useState('0')
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [u, l] = await Promise.all([
        api.get<UserRow[]>('/agents'),
        api.get<{ data: LedgerRow[] }>('/billing/ledger?page=1&limit=20&type=Credit'),
      ])
      setUsers(u.data)
      setLedger(l.data.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load().catch(() => undefined)
  }, [])

  const subdealers = users.filter((u) => (u.role_label || u.role) === 'Subdealer')

  async function addBalance() {
    if (!targetId || Number(amount) <= 0) return
    await api.post(`/agents/${targetId}/credit`, {
      amount: Number(amount),
      description: 'Manual subdealer balance credit',
    })
    setTargetId('')
    setAmount('0')
    await load()
  }

  async function addBalanceToAll() {
    if (Number(bulkAmount) <= 0) return
    await api.post('/agents/bulk-credit', {
      amount: Number(bulkAmount),
      role: 'Subdealer',
      description: 'Bulk subdealer balance credit',
    })
    setBulkAmount('0')
    await load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Balance Center</h1>
          <p className="text-sm text-text-muted">Manage Subdealer wallets and balance credits</p>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => load()}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4 space-y-3">
          <div className="font-semibold text-text-primary flex items-center gap-2"><Wallet size={16} /> Add Balance To One Subdealer</div>
          <select className="select" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Select subdealer</option>
            {subdealers.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name} (Rs. {Number(u.wallet_balance).toLocaleString()})</option>
            ))}
          </select>
          <input className="input" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className="btn-primary w-full justify-center" onClick={addBalance}>Credit Balance</button>
        </div>

        <div className="card p-4 space-y-3">
          <div className="font-semibold text-text-primary flex items-center gap-2"><Users size={16} /> Add Balance To All Subdealers</div>
          <input className="input" placeholder="Amount for each subdealer" value={bulkAmount} onChange={(e) => setBulkAmount(e.target.value)} />
          <button className="btn-success w-full justify-center" onClick={addBalanceToAll}>Bulk Credit</button>
          <p className="text-xs text-text-muted">Active subdealers: {subdealers.length}</p>
        </div>
      </div>

      <div className="card p-4">
        <div className="font-semibold text-text-primary flex items-center gap-2 mb-3"><CircleDollarSign size={16} /> Subdealer Wallets</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                <th className="py-2">Name</th>
                <th className="py-2">Role</th>
                <th className="py-2">Balance</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {subdealers.map((u) => (
                <tr key={u.id} className="border-b border-border/40">
                  <td className="py-2 text-text-primary font-medium">{u.full_name}</td>
                  <td className="py-2">{u.role_label || u.role}</td>
                  <td className="py-2">Rs. {Number(u.wallet_balance || 0).toLocaleString()}</td>
                  <td className="py-2">{u.is_active ? 'Active' : 'Disabled'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-4">
        <div className="font-semibold text-text-primary mb-3">Recent Credit Activity</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                <th className="py-2">Time</th>
                <th className="py-2">Type</th>
                <th className="py-2">Amount</th>
                <th className="py-2">Admin</th>
                <th className="py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((row) => (
                <tr key={row.id} className="border-b border-border/40">
                  <td className="py-2">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="py-2">{row.transaction_type}</td>
                  <td className="py-2">Rs. {Number(row.amount).toLocaleString()}</td>
                  <td className="py-2">{row.admin_username || 'System'}</td>
                  <td className="py-2">{row.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
