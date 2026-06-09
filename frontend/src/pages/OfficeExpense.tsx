import { useEffect, useState } from 'react'
import { Pencil, Plus, RefreshCw, Trash2, Wallet } from 'lucide-react'
import api from '../lib/api'

type Expense = {
  id: string
  expense_date: string
  category: string
  amount: string
  description: string
  vendor: string | null
  payment_method: string | null
  reference_no: string | null
  created_by_name?: string | null
}

type ListResponse = {
  data: Expense[]
  pagination: { page: number; limit: number; total: number }
  summary: { total_amount: string; current_month_amount: string; total_count: number }
}

type SummaryRow = { category: string; entries: number; total_amount: string }

export function OfficeExpense() {
  const [rows, setRows] = useState<Expense[]>([])
  const [summary, setSummary] = useState<ListResponse['summary']>({ total_amount: '0', current_month_amount: '0', total_count: 0 })
  const [byCategory, setByCategory] = useState<SummaryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [filters, setFilters] = useState({ search: '', category: '', from: '', to: '' })
  const [form, setForm] = useState({
    expense_date: new Date().toISOString().slice(0, 10),
    category: 'Operations',
    amount: '0',
    description: '',
    vendor: '',
    payment_method: 'Cash',
    reference_no: '',
  })

  async function load() {
    setLoading(true)
    try {
      const [listRes, sumRes] = await Promise.all([
        api.get<ListResponse>('/expenses', { params: { ...filters, page: 1, limit: 50 } }),
        api.get<{ data: SummaryRow[] }>('/expenses/summary', { params: { from: filters.from || undefined, to: filters.to || undefined } }),
      ])
      setRows(listRes.data.data)
      setSummary(listRes.data.summary)
      setByCategory(sumRes.data.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function createExpense() {
    if (!form.category || !form.description || Number(form.amount) <= 0) return
    setSaving(true)
    try {
      await api.post('/expenses', {
        ...form,
        amount: Number(form.amount),
      })
      setForm({
        expense_date: new Date().toISOString().slice(0, 10),
        category: 'Operations',
        amount: '0',
        description: '',
        vendor: '',
        payment_method: 'Cash',
        reference_no: '',
      })
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function updateRow(item: Expense) {
    await api.put(`/expenses/${item.id}`, {
      expense_date: item.expense_date?.slice(0, 10),
      category: item.category,
      amount: Number(item.amount),
      description: item.description,
      vendor: item.vendor,
      payment_method: item.payment_method,
      reference_no: item.reference_no,
    })
    setEditingId(null)
    await load()
  }

  async function removeRow(item: Expense) {
    if (!window.confirm(`Delete expense entry #${item.id}?`)) return
    await api.delete(`/expenses/${item.id}`)
    await load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Office Expense</h1>
          <p className="text-sm text-text-muted">Track operational expenses with category-level visibility</p>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => void load()}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card p-3"><p className="text-xs text-text-muted">Total Expenses</p><p className="text-2xl font-bold text-status-expired">Rs. {Number(summary.total_amount || 0).toLocaleString()}</p></div>
        <div className="card p-3"><p className="text-xs text-text-muted">Current Month</p><p className="text-2xl font-bold text-status-warning">Rs. {Number(summary.current_month_amount || 0).toLocaleString()}</p></div>
        <div className="card p-3"><p className="text-xs text-text-muted">Entries</p><p className="text-2xl font-bold text-accent-cyan">{summary.total_count || 0}</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-text-primary"><Plus size={16} /> Add Expense</div>
          <input className="input" type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
          <input className="input" placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <input className="input" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input className="input" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <input className="input" placeholder="Vendor" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
          <input className="input" placeholder="Payment Method" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} />
          <input className="input" placeholder="Reference No" value={form.reference_no} onChange={(e) => setForm({ ...form, reference_no: e.target.value })} />
          <button className="btn-primary w-full justify-center" disabled={saving} onClick={() => void createExpense()}>{saving ? 'Saving...' : 'Create Expense'}</button>
        </div>

        <div className="card p-4 lg:col-span-2 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input className="input" placeholder="Search description/vendor/ref" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
            <input className="input" placeholder="Category" value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))} />
            <input className="input" type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
            <input className="input" type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary btn-sm" onClick={() => void load()}><Wallet size={14} /> Apply Filters</button>
            <button className="btn-ghost btn-sm" onClick={() => { setFilters({ search: '', category: '', from: '', to: '' }); void load() }}>Reset</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-muted border-b border-border">
                    <th className="py-2">Date</th>
                    <th className="py-2">Category</th>
                    <th className="py-2">Amount</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/40 align-top">
                      <td className="py-2">{editingId === r.id ? <input className="input" type="date" value={r.expense_date?.slice(0, 10)} onChange={(e) => setRows((prev) => prev.map((x) => x.id === r.id ? { ...x, expense_date: e.target.value } : x))} /> : new Date(r.expense_date).toLocaleDateString()}</td>
                      <td className="py-2">{editingId === r.id ? <input className="input" value={r.category} onChange={(e) => setRows((prev) => prev.map((x) => x.id === r.id ? { ...x, category: e.target.value } : x))} /> : r.category}</td>
                      <td className="py-2">{editingId === r.id ? <input className="input" value={r.amount} onChange={(e) => setRows((prev) => prev.map((x) => x.id === r.id ? { ...x, amount: e.target.value } : x))} /> : `Rs. ${Number(r.amount || 0).toLocaleString()}`}</td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          {editingId === r.id ? (
                            <button className="btn-primary btn-sm" onClick={() => void updateRow(r)}>Save</button>
                          ) : (
                            <button className="btn-ghost btn-sm" onClick={() => setEditingId(r.id)}><Pencil size={12} /></button>
                          )}
                          <button className="btn-ghost btn-sm" onClick={() => void removeRow(r)}><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card p-3 bg-bg-base">
              <p className="text-sm font-semibold text-text-primary mb-2">Category Summary</p>
              <div className="space-y-2 text-sm">
                {byCategory.length === 0 ? (
                  <p className="text-text-muted">No category totals for selected range</p>
                ) : byCategory.map((c) => (
                  <div key={c.category} className="flex justify-between">
                    <span className="text-text-muted">{c.category} ({c.entries})</span>
                    <span className="text-text-primary font-medium">Rs. {Number(c.total_amount || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}