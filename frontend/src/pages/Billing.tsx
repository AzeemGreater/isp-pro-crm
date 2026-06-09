import { useState, useEffect, useCallback } from 'react'
import { Wallet, TrendingDown, TrendingUp, ArrowUpRight, ArrowDownLeft, RefreshCw } from 'lucide-react'
import api from '../lib/api'

interface Transaction {
  id: number; invoice_number: string; transaction_type: string; amount: number
  description: string; full_name: string; pppoe_username: string
  profile_name: string; payment_method: string; date: string; created_at: string
}
interface Summary { total_credits: number; total_debits: number; net_balance: number; total_wholesale_cost: number }

export function Billing() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const page = 1
  const [total, setTotal] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ data: Transaction[]; summary: Summary; pagination: { total: number } }>(`/billing/ledger?page=${page}&limit=25`)
      setTransactions(res.data.data)
      setSummary(res.data.summary)
      setTotal(res.data.pagination.total)
    } catch { /* graceful */ } finally { setLoading(false) }
  }, [page])

  useEffect(() => { load() }, [load])

  const fmt = (n: number) => `Rs. ${Number(n).toLocaleString('en-PK', { minimumFractionDigits: 0 })}`

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-text-primary">Wallet & Billing</h1>
          <p className="text-sm text-text-muted">Financial ledger and revenue tracking</p></div>
        <button onClick={load} className="btn-ghost btn-sm"><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Refresh</button>
      </div>

      {/* Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Revenue', value: fmt(summary.total_credits), icon: TrendingUp, color: 'text-status-active' },
            { label: 'Total Debits', value: fmt(summary.total_debits), icon: TrendingDown, color: 'text-status-expired' },
            { label: 'Net Balance', value: fmt(summary.net_balance), icon: Wallet, color: 'text-accent-cyan' },
            { label: 'Franchise Cost', value: fmt(summary.total_wholesale_cost), icon: ArrowUpRight, color: 'text-status-warning' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="stat-card">
              <div className="glow-line" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wider font-medium">{label}</p>
                  <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
                </div>
                <Icon size={20} className={color} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Transactions ledger */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-text-primary">Transaction Ledger</h3>
          <p className="text-xs text-text-muted mt-0.5">{total} total entries</p>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr><th>Invoice</th><th>Customer</th><th>Type</th><th>Amount</th><th>Method</th><th>Description</th><th>Date</th></tr>
            </thead>
            <tbody>
              {transactions.map(tx => (
                <tr key={tx.id}>
                  <td className="font-mono text-xs text-text-muted">{tx.invoice_number || '—'}</td>
                  <td>
                    <p className="text-sm text-text-primary">{tx.full_name || 'N/A'}</p>
                    {tx.pppoe_username && <p className="text-xs font-mono text-accent-cyan">{tx.pppoe_username}</p>}
                  </td>
                  <td>
                    <span className={`flex items-center gap-1 text-xs font-semibold ${tx.transaction_type === 'Credit' ? 'text-status-active' : 'text-status-expired'}`}>
                      {tx.transaction_type === 'Credit' ? <ArrowDownLeft size={12}/> : <ArrowUpRight size={12}/>}
                      {tx.transaction_type}
                    </span>
                  </td>
                  <td className={`font-bold text-sm ${tx.transaction_type === 'Credit' ? 'text-status-active' : 'text-status-expired'}`}>
                    {tx.transaction_type === 'Credit' ? '+' : '-'}{fmt(tx.amount)}
                  </td>
                  <td className="text-xs text-text-muted">{tx.payment_method || '—'}</td>
                  <td className="text-xs text-text-secondary max-w-xs truncate">{tx.description}</td>
                  <td className="text-xs text-text-muted">{new Date(tx.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
