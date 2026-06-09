import { useEffect, useState } from 'react'
import api from '../lib/api'

type ApprovalRequest = {
  id: number
  request_type: string
  status: string
  created_at: string
  review_notes?: string | null
}

type PermissionRow = {
  role: string
  permissions_json: string[]
}

export function Approvals() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [permissions, setPermissions] = useState<PermissionRow[]>([])
  const [newReq, setNewReq] = useState('wallet_adjustment')
  const [payloadText, setPayloadText] = useState('{"reason":"Submitted from approvals panel"}')

  async function load() {
    const [r, p] = await Promise.all([
      api.get<ApprovalRequest[]>('/approvals/requests'),
      api.get<PermissionRow[]>('/approvals/permissions'),
    ])
    setRequests(r.data)
    setPermissions(p.data)
  }

  useEffect(() => {
    load().catch(() => undefined)
  }, [])

  async function createRequest() {
    let payload: unknown = { reason: 'Submitted from approvals panel' }
    try {
      payload = JSON.parse(payloadText)
    } catch {
      return
    }

    await api.post('/approvals/requests', {
      request_type: newReq,
      payload_json: payload,
    })
    await load()
  }

  async function review(id: number, status: 'approved' | 'rejected') {
    await api.patch(`/approvals/requests/${id}/review`, { status, review_notes: `Marked ${status} from panel` })
    await load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Approvals & Permissions</h1>
          <p className="text-sm text-text-muted">Approval workflow queue and role permission matrix</p>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => load()}>Refresh</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold text-text-primary">Create Approval Request</h3>
          <select className="select" value={newReq} onChange={(e) => setNewReq(e.target.value)}>
            <option value="wallet_adjustment">Wallet Adjustment</option>
            <option value="plan_override">Plan Override</option>
            <option value="refund">Refund</option>
            <option value="disconnect">Disconnect Subscriber</option>
          </select>
          <textarea
            className="input min-h-24 font-mono text-xs"
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            placeholder='{"subscriber_id":1,"amount":500,"reason":"manual adjustment"}'
          />
          <p className="text-xs text-text-muted">
            wallet_adjustment: admin_id, amount, direction(credit/debit). refund/disconnect/plan_override require subscriber_id.
          </p>
          <button className="btn-primary w-full justify-center" onClick={createRequest}>Submit Request</button>
        </div>

        <div className="card p-4 lg:col-span-2">
          <h3 className="font-semibold text-text-primary mb-3">Pending & Recent Requests</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {requests.map((r) => (
              <div key={r.id} className="rounded-lg border border-border/70 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-text-primary">#{r.id} {r.request_type}</p>
                  <span className="text-xs text-text-muted">{r.status}</span>
                </div>
                <p className="text-xs text-text-muted mt-1">{new Date(r.created_at).toLocaleString()}</p>
                {r.status === 'pending' && (
                  <div className="mt-2 flex items-center gap-2">
                    <button className="btn-ghost btn-sm" onClick={() => review(r.id, 'approved')}>Approve</button>
                    <button className="btn-ghost btn-sm" onClick={() => review(r.id, 'rejected')}>Reject</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <h4 className="font-semibold text-text-primary mt-4 mb-2">Role Permission Matrix</h4>
          <div className="space-y-2">
            {permissions.map((p) => (
              <div key={p.role} className="rounded-lg border border-border/70 p-2">
                <p className="text-sm font-semibold text-text-primary">{p.role}</p>
                <p className="text-xs text-text-muted">{Array.isArray(p.permissions_json) ? p.permissions_json.join(', ') : 'No permissions'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
