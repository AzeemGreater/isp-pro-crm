import { useEffect, useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, RefreshCw, CalendarDays } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../hooks/useAuth'

type WalletInfo = {
  wallet_balance: number
  username: string
  total_transactions: string
  total_debits: string
  total_credits: string
}

type LedgerTx = {
  id: number
  invoice_number: string | null
  transaction_type: 'Debit' | 'Credit'
  amount: number
  description: string | null
  full_name: string | null
  pppoe_username: string | null
  payment_method: string | null
  created_at: string
}

type RevenuePoint = {
  date: string
  revenue: string | null
  transactions: string | null
}

export function SubdealerWallet() {
  const { admin } = useAuth()
  const [wallet, setWallet] = useState<WalletInfo | null>(null)
  const [transactions, setTransactions] = useState<LedgerTx[]>([])
  const [revenue, setRevenue] = useState<RevenuePoint[]>([])
  const [loading, setLoading] = useState(false)

  const monthlySummary = useMemo(() => {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    let revenueTotal = 0
    let txnCount = 0

    for (const row of revenue) {
      const dt = new Date(row.date)
      if (dt.getMonth() === currentMonth && dt.getFullYear() === currentYear) {
        revenueTotal += Number(row.revenue || 0)
        txnCount += Number(row.transactions || 0)
      }
    }

    return {
      revenueTotal,
      txnCount,
    }
  }, [revenue])

  async function load() {
    if (!admin?.id) return
    setLoading(true)
    try {
      const [walletRes, ledgerRes, revenueRes] = await Promise.all([
        api.get<WalletInfo>(`/agents/${admin.id}/wallet`),
        api.get<{ data: LedgerTx[] }>(`/billing/ledger?page=1&limit=20`),
        api.get<RevenuePoint[]>(`/billing/revenue?days=45`),
      ])
      setWallet(walletRes.data)
      setTransactions(ledgerRes.data.data || [])
      setRevenue(revenueRes.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load().catch(() => undefined)
  }, [admin?.id])

  const fmt = (n: number) => `Rs. ${Number(n).toLocaleString('en-PK')}`

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">My Wallet</h1>
          <p className="text-sm text-text-muted">Balance and financing details for your subdealer account</p>
        </div>
        <button onClick={() => load()} className="btn-ghost btn-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="glow-line" />
          <p className="text-xs text-text-muted uppercase tracking-wider">Current Balance</p>
          <p className="text-2xl font-bold text-accent-cyan mt-1">{fmt(Number(wallet?.wallet_balance || 0))}</p>
          <p className="text-xs text-text-muted mt-1">Account: {wallet?.username || admin?.username}</p>
        </div>
        <div className="stat-card">
          <div className="glow-line" />
          <p className="text-xs text-text-muted uppercase tracking-wider">Monthly Revenue</p>
          <p className="text-2xl font-bold text-status-active mt-1">{fmt(monthlySummary.revenueTotal)}</p>
          <p className="text-xs text-text-muted mt-1">This month transactions: {monthlySummary.txnCount}</p>
        </div>
        <div className="stat-card">
          <div className="glow-line" />
          <p className="text-xs text-text-muted uppercase tracking-wider">All-Time Totals</p>
          <p className="text-sm text-status-active mt-2">Credits: {fmt(Number(wallet?.total_credits || 0))}</p>
          <p className="text-sm text-status-expired mt-1">Debits: {fmt(Number(wallet?.total_debits || 0))}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-text-primary">Recent Credits & Debits</h3>
            <p className="text-xs text-text-muted">Latest 20 financing entries</p>
          </div>
          <CalendarDays size={16} className="text-text-muted" />
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount</th>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Method</th>
                <th>Description</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id}>
                  <td>
                    <span className={`flex items-center gap-1 text-xs font-semibold ${tx.transaction_type === 'Credit' ? 'text-status-active' : 'text-status-expired'}`}>
                      {tx.transaction_type === 'Credit' ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                      {tx.transaction_type}
                    </span>
                  </td>
                  <td className={`font-bold ${tx.transaction_type === 'Credit' ? 'text-status-active' : 'text-status-expired'}`}>
                    {tx.transaction_type === 'Credit' ? '+' : '-'}{fmt(Number(tx.amount || 0))}
                  </td>
                  <td className="font-mono text-xs text-text-muted">{tx.invoice_number || '—'}</td>
                  <td>
                    <p className="text-sm text-text-primary">{tx.full_name || '—'}</p>
                    {tx.pppoe_username && <p className="text-xs font-mono text-accent-cyan">{tx.pppoe_username}</p>}
                  </td>
                  <td className="text-xs text-text-muted">{tx.payment_method || '—'}</td>
                  <td className="text-xs text-text-secondary max-w-xs truncate">{tx.description || '—'}</td>
                  <td className="text-xs text-text-muted">{new Date(tx.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-text-muted">
                    No transactions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
