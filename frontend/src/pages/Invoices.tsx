import { useEffect, useState } from 'react'
import { FilePlus2, Loader2, RefreshCw, Search } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../hooks/useAuth'

interface InvoiceRow {
  id: number
  invoice_number: string
  full_name: string | null
  pppoe_username: string | null
  billed_by: string | null
  profile_name: string | null
  amount: number
  status: string
  transaction_type: string
  payment_method: string | null
  date: string
  description: string
}

interface InvoicePayload {
  subscriber_id?: number
  amount: number
  description: string
  payment_method: string
  transaction_type: 'Debit' | 'Credit'
}

export function Invoices() {
  const { admin } = useAuth()
  const isSubdealer = admin?.role === 'Agent'
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<InvoicePayload>({
    amount: 0,
    description: '',
    payment_method: 'Cash',
    transaction_type: 'Debit',
  })

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<{ data: InvoiceRow[] }>('/billing/invoices', {
        params: { page: 1, limit: 50, search, status },
      })
      setRows(res.data.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function createInvoice() {
    if (!form.amount || !form.description.trim()) return
    setSaving(true)
    try {
      await api.post('/billing/invoices', {
        ...form,
        subscriber_id: form.subscriber_id || undefined,
      })
      setForm({ amount: 0, description: '', payment_method: 'Cash', transaction_type: 'Debit' })
      await load()
    } finally {
      setSaving(false)
    }
  }

  const fmt = (n: number) => `Rs. ${Number(n || 0).toLocaleString('en-PK')}`

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Invoices & Billing</h1>
          <p className="text-sm text-text-muted">{isSubdealer ? 'Review your customer invoices and billing history' : 'Manage invoice ledger and issue manual invoices'}</p>
        </div>
        <button onClick={load} className="btn-ghost btn-sm" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 card p-4 space-y-3">
          <div className="flex flex-col lg:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                className="input pl-8"
                placeholder="Search Invoice/User..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void load()}
              />
            </div>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All Status</option>
              <option value="paid">Paid</option>
              <option value="credit">Credit</option>
            </select>
            <button className="btn-primary btn-sm" onClick={() => void load()}>Apply</button>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#Invoice</th>
                  <th>Customer</th>
                  <th>Package</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Billed By</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-xs">{row.invoice_number}</td>
                    <td>
                      <p className="text-sm text-text-primary">{row.full_name || 'Guest Invoice'}</p>
                      <p className="text-xs text-text-muted font-mono">{row.pppoe_username || 'N/A'}</p>
                    </td>
                    <td className="text-xs text-text-muted">{row.profile_name || 'N/A'}</td>
                    <td className="text-sm font-semibold">{fmt(row.amount)}</td>
                    <td>
                      <span className={`badge ${row.status === 'Paid' ? 'badge-active' : 'badge-warning'}`}>{row.status}</span>
                    </td>
                    <td className="text-xs text-text-muted">{new Date(row.date).toLocaleDateString()}</td>
                    <td className="text-xs text-text-secondary">{row.billed_by || 'System'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {!isSubdealer && (
          <div className="card p-4 space-y-3">
            <h3 className="text-base font-semibold text-text-primary flex items-center gap-2"><FilePlus2 size={16} /> New Invoice</h3>
            <input
              className="input"
              type="number"
              min={1}
              placeholder="Subscriber ID (optional)"
              value={form.subscriber_id || ''}
              onChange={(e) => setForm((f) => ({ ...f, subscriber_id: e.target.value ? Number(e.target.value) : undefined }))}
            />
            <input
              className="input"
              type="number"
              min={1}
              placeholder="Amount"
              value={form.amount || ''}
              onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))}
            />
            <select className="input" value={form.transaction_type} onChange={(e) => setForm((f) => ({ ...f, transaction_type: e.target.value as 'Debit' | 'Credit' }))}>
              <option value="Debit">Debit</option>
              <option value="Credit">Credit</option>
            </select>
            <input
              className="input"
              placeholder="Payment Method"
              value={form.payment_method}
              onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
            />
            <textarea
              className="input min-h-24"
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            <button className="btn-primary w-full justify-center" onClick={createInvoice} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <FilePlus2 size={14} />} Create Invoice
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
