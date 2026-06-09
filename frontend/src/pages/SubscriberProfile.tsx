import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Save, RotateCcw, Power, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import api from '../lib/api'

type SubscriberDetails = {
  id: number
  full_name: string
  pppoe_username: string
  mobile: string
  cnic: string | null
  email: string | null
  address: string | null
  notes: string | null
  status: 'Active' | 'Expired' | 'Disabled' | 'Suspended'
  expiration_date: string
  days_remaining: number
  zone_id: number | null
  zone_code?: string | null
  area_name?: string | null
  nas_id: number | null
  nas_name?: string | null
  profile_id: number
  profile_name?: string | null
  retail_price?: number
  download_speed?: number
  upload_speed?: number
  agent_username?: string | null
  static_ip?: string | null
}

type Zone = { id: number; area_name: string }
type Profile = { id: number; name: string; retail_price: number; is_active?: boolean }
type Nas = { id: number; name: string }

type FormState = {
  full_name: string
  mobile: string
  id_card_number: string
  email: string
  address: string
  zone_id: string
  nas_id: string
  profile_id: string
  status: string
  notes: string
}

type TelemetryCurrent = {
  online: boolean
  username: string
  start_time: string | null
  updated_at: string | null
  session_time_seconds: number
  input_octets: number
  output_octets: number
  framed_ip: string | null
  mac_address: string | null
  nas_ip: string | null
  nas_name: string | null
}

type TelemetrySession = {
  radacctid: number
  acctsessionid: string
  start_time: string | null
  stop_time: string | null
  updated_at: string | null
  session_time_seconds: number
  input_octets: number
  output_octets: number
  input_gb: number
  output_gb: number
  total_gb: number
  terminate_cause: string | null
  framed_ip: string | null
  mac_address: string | null
  nas_ip: string | null
  nas_name: string | null
}

type TelemetryResponse = {
  username: string
  current: TelemetryCurrent
  usage_window?: {
    window_days: number
    input_octets: number
    output_octets: number
    input_gb: number
    output_gb: number
    total_gb: number
    last_seen: string | null
  }
  usage_30d: {
    input_octets: number
    output_octets: number
    input_gb: number
    output_gb: number
    total_gb: number
    last_seen: string | null
  }
  sessions: TelemetrySession[]
}

type ConfirmAction = {
  type: 'renew' | 'status' | 'delete'
  title: string
  confirmLabel: string
  details: string[]
}

type TimelineEvent = {
  id: string
  type: 'billing' | 'session' | 'whatsapp' | 'audit'
  timestamp: string
  title: string
  description: string
  meta?: Record<string, unknown>
}

type PredictorResponse = {
  subscriber: {
    id: number
    full_name: string
    username: string
    status: string
    expiration_date: string
    days_remaining: number
  }
  score: number
  risk_level: 'Low' | 'Medium' | 'High'
  reasons: string[]
  recommendation: string
  metrics: {
    usage_30d_gb: number
    usage_prev_30d_gb: number
    usage_drop_percent: number
    renewals_90d: number
    failed_reminders_30d: number
    last_seen: string | null
  }
}

const MAX_TRAFFIC_POINTS = 40

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds || 0))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  return `${h}h ${m}m ${s}s`
}

export function SubscriberProfile() {
  const navigate = useNavigate()
  const { username = '' } = useParams()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [renewing, setRenewing] = useState(false)
  const [confirmingAction, setConfirmingAction] = useState(false)
  const [usageDays, setUsageDays] = useState<number>(30)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [sub, setSub] = useState<SubscriberDetails | null>(null)
  const [telemetry, setTelemetry] = useState<TelemetryResponse | null>(null)
  const [telemetryLoading, setTelemetryLoading] = useState(true)
  const [trafficData, setTrafficData] = useState<Array<{ time: string; rx: number; tx: number }>>([])
  const prevCounterRef = useRef<{ timestamp: number; input: number; output: number } | null>(null)
  const [zones, setZones] = useState<Zone[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [nas, setNas] = useState<Nas[]>([])
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [predictor, setPredictor] = useState<PredictorResponse | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(true)
  const [form, setForm] = useState<FormState>({
    full_name: '',
    mobile: '',
    id_card_number: '',
    email: '',
    address: '',
    zone_id: '',
    nas_id: '',
    profile_id: '',
    status: 'Active',
    notes: '',
  })

  async function load() {
    if (!username) return
    setLoading(true)
    try {
      const [subRes, zoneRes, profRes, nasRes] = await Promise.all([
        api.get<SubscriberDetails>(`/subscribers/username/${encodeURIComponent(username)}`),
        api.get<Zone[]>('/network/zones'),
        api.get<Profile[]>('/network/profiles'),
        api.get<Nas[]>('/network/nas'),
      ])

      const details = subRes.data
      setSub(details)
      setZones(zoneRes.data || [])
      setProfiles((profRes.data || []).filter((p) => p.is_active !== false))
      setNas(nasRes.data || [])
      setForm({
        full_name: details.full_name || '',
        mobile: details.mobile || '',
        id_card_number: details.cnic || '',
        email: details.email || '',
        address: details.address || '',
        zone_id: details.zone_id ? String(details.zone_id) : '',
        nas_id: details.nas_id ? String(details.nas_id) : '',
        profile_id: details.profile_id ? String(details.profile_id) : '',
        status: details.status || 'Active',
        notes: details.notes || '',
      })
    } finally {
      setLoading(false)
    }
  }

  async function loadTelemetry(days: number) {
    if (!username) return
    const response = await api.get<TelemetryResponse>(`/subscribers/username/${encodeURIComponent(username)}/telemetry`, {
      params: { days },
    })
    const payload = response.data
    setTelemetry(payload)

    const now = Date.now()
    const currentIn = Number(payload.current.input_octets || 0)
    const currentOut = Number(payload.current.output_octets || 0)
    const label = new Date(now).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    if (!payload.current.online) {
      prevCounterRef.current = null
      setTrafficData((prev) => [...prev.slice(-MAX_TRAFFIC_POINTS + 1), { time: label, rx: 0, tx: 0 }])
      return
    }

    const prev = prevCounterRef.current
    let rxMbps = 0
    let txMbps = 0

    if (prev) {
      const diffSec = Math.max(1, (now - prev.timestamp) / 1000)
      const inDelta = Math.max(0, currentIn - prev.input)
      const outDelta = Math.max(0, currentOut - prev.output)
      rxMbps = Number(((inDelta * 8) / diffSec / 1_000_000).toFixed(2))
      txMbps = Number(((outDelta * 8) / diffSec / 1_000_000).toFixed(2))
    }

    prevCounterRef.current = {
      timestamp: now,
      input: currentIn,
      output: currentOut,
    }

    setTrafficData((prev) => [...prev.slice(-MAX_TRAFFIC_POINTS + 1), { time: label, rx: rxMbps, tx: txMbps }])
  }

  async function loadInsights() {
    if (!username) return
    setInsightsLoading(true)
    try {
      const [timelineRes, predictorRes] = await Promise.all([
        api.get<{ data: TimelineEvent[] }>(`/subscribers/username/${encodeURIComponent(username)}/timeline`, { params: { limit: 60 } }),
        api.get<PredictorResponse>(`/subscribers/username/${encodeURIComponent(username)}/predictor`),
      ])

      setTimeline(timelineRes.data?.data || [])
      setPredictor(predictorRes.data || null)
    } finally {
      setInsightsLoading(false)
    }
  }

  useEffect(() => {
    load().catch(() => undefined)
    loadInsights().catch(() => undefined)
  }, [username])

  useEffect(() => {
    if (!username) return
    prevCounterRef.current = null
    setTrafficData([])
    setTelemetryLoading(true)

    loadTelemetry(usageDays)
      .catch(() => undefined)
      .finally(() => setTelemetryLoading(false))

    const timer = setInterval(() => {
      loadTelemetry(usageDays).catch(() => undefined)
    }, 5000)

    return () => clearInterval(timer)
  }, [username, usageDays])

  const selectedProfile = useMemo(
    () => profiles.find((p) => String(p.id) === form.profile_id),
    [profiles, form.profile_id]
  )

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function saveChanges(e: React.FormEvent) {
    e.preventDefault()
    if (!sub) return
    setSaving(true)
    try {
      await api.put(`/subscribers/${sub.id}`, {
        full_name: form.full_name.trim(),
        mobile: form.mobile.trim(),
        id_card_number: form.id_card_number.trim(),
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        zone_id: form.zone_id || null,
        nas_id: form.nas_id || null,
        profile_id: form.profile_id || null,
        status: form.status,
        notes: form.notes.trim() || null,
      })
      toast.success('User settings updated')
      await Promise.all([load(), loadInsights()])
    } finally {
      setSaving(false)
    }
  }

  async function renewNow() {
    if (!sub) return
    setRenewing(true)
    try {
      await api.post(`/subscribers/${sub.id}/renew`, {})
      toast.success('Subscription renewed successfully')
      await Promise.all([load(), loadInsights()])
    } finally {
      setRenewing(false)
    }
  }

  async function toggleStatus() {
    if (!sub) return
    const nextStatus = sub.status === 'Active' ? 'Disabled' : 'Active'
    await api.patch(`/subscribers/${sub.id}/status`, { status: nextStatus })
    toast.success(`Status changed to ${nextStatus}`)
    await Promise.all([load(), loadInsights()])
  }

  async function deleteUser() {
    if (!sub) return
    await api.delete(`/subscribers/${sub.id}`)
    toast.success('User deleted')
    navigate('/subscribers')
  }

  function openRenewConfirm() {
    if (!sub) return
    setConfirmAction({
      type: 'renew',
      title: 'Confirm Renewal',
      confirmLabel: 'Confirm Renew',
      details: [
        `User: ${sub.full_name}`,
        `Username: ${sub.pppoe_username}`,
        `Current Expiry: ${sub.expiration_date}`,
        `Package: ${sub.profile_name || 'N/A'} (Rs. ${Number(sub.retail_price || 0).toLocaleString()})`,
      ],
    })
  }

  function openStatusConfirm() {
    if (!sub) return
    const nextStatus = sub.status === 'Active' ? 'Disabled' : 'Active'
    setConfirmAction({
      type: 'status',
      title: `Confirm ${nextStatus}`,
      confirmLabel: `Set ${nextStatus}`,
      details: [
        `User: ${sub.full_name}`,
        `Username: ${sub.pppoe_username}`,
        `Current Status: ${sub.status}`,
        `New Status: ${nextStatus}`,
      ],
    })
  }

  function openDeleteConfirm() {
    if (!sub) return
    setConfirmAction({
      type: 'delete',
      title: 'Confirm Permanent Delete',
      confirmLabel: 'Delete Permanently',
      details: [
        `User: ${sub.full_name}`,
        `Username: ${sub.pppoe_username}`,
        `Mobile: ${sub.mobile}`,
        'This action is irreversible and will remove user records.',
      ],
    })
  }

  async function runConfirmedAction() {
    if (!confirmAction) return
    setConfirmingAction(true)
    try {
      if (confirmAction.type === 'renew') {
        await renewNow()
      } else if (confirmAction.type === 'status') {
        await toggleStatus()
      } else if (confirmAction.type === 'delete') {
        await deleteUser()
      }
      setConfirmAction(null)
    } finally {
      setConfirmingAction(false)
    }
  }

  const usage = telemetry?.usage_window || telemetry?.usage_30d
  const riskColor = predictor?.risk_level === 'High'
    ? 'text-status-expired'
    : predictor?.risk_level === 'Medium'
      ? 'text-status-warning'
      : 'text-status-active'

  if (loading) {
    return (
      <div className="card p-8 flex items-center justify-center">
        <Loader2 className="animate-spin text-accent-cyan" size={22} />
      </div>
    )
  }

  if (!sub) {
    return (
      <div className="card p-6">
        <p className="text-text-muted">User not found.</p>
        <button className="btn-ghost btn-sm mt-3" onClick={() => navigate('/subscribers')}>
          <ArrowLeft size={14} /> Back to Subscribers
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <button className="btn-ghost btn-sm mb-2" onClick={() => navigate('/subscribers')}>
            <ArrowLeft size={14} /> Back to Subscribers
          </button>
          <h1 className="text-2xl font-bold text-text-primary">{sub.full_name}</h1>
          <p className="text-sm text-text-muted">
            Username: {sub.pppoe_username} · ID #{sub.id} · Dealer: {sub.agent_username || 'N/A'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-primary btn-sm" disabled={renewing} onClick={openRenewConfirm}>
            {renewing ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Renew
          </button>
          <button className="btn-ghost btn-sm" onClick={openStatusConfirm}>
            <Power size={14} /> {sub.status === 'Active' ? 'Disable' : 'Enable'}
          </button>
          <button className="btn-danger btn-sm" onClick={openDeleteConfirm}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-xs text-text-muted">Current Status</p>
          <p className="text-lg font-semibold text-text-primary mt-1">{sub.status}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-text-muted">Expiry Date</p>
          <p className="text-lg font-semibold text-text-primary mt-1">{sub.expiration_date}</p>
          <p className="text-xs text-text-muted mt-1">{Number(sub.days_remaining || 0)} days remaining</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-text-muted">Current Package</p>
          <p className="text-lg font-semibold text-text-primary mt-1">{sub.profile_name || 'N/A'}</p>
          <p className="text-xs text-text-muted mt-1">Rs. {Number(sub.retail_price || 0).toLocaleString()} / month</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-xs text-text-muted">Current IP</p>
          <p className="text-lg font-semibold text-text-primary mt-1">{telemetry?.current.framed_ip || sub.static_ip || '-'}</p>
          <p className="text-xs text-text-muted mt-1">MAC: {telemetry?.current.mac_address || '-'}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-text-muted">Current Session Usage</p>
          <p className="text-lg font-semibold text-text-primary mt-1">{Number(((telemetry?.current.input_octets || 0) / (1024 * 1024 * 1024)).toFixed(2))} GB</p>
          <p className="text-xs text-text-muted mt-1">Upload: {Number(((telemetry?.current.output_octets || 0) / (1024 * 1024 * 1024)).toFixed(2))} GB</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-text-muted">Current Data Usage</p>
            <select
              className="select h-8 text-xs"
              value={String(usageDays)}
              onChange={(e) => setUsageDays(Number(e.target.value))}
            >
              <option value="1">Today</option>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
            </select>
          </div>
          <p className="text-lg font-semibold text-text-primary mt-1">{Number(usage?.total_gb || 0).toLocaleString()} GB</p>
          <p className="text-xs text-text-muted mt-1">Down: {usage?.input_gb || 0} GB · Up: {usage?.output_gb || 0} GB</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-text-muted">Session State</p>
          <p className="text-lg font-semibold text-text-primary mt-1">{telemetry?.current.online ? 'Online' : 'Offline'}</p>
          <p className="text-xs text-text-muted mt-1">Last Seen: {formatDateTime(usage?.last_seen)}</p>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-text-primary">Live Bandwidth Graph</h2>
          <p className="text-xs text-text-muted">Updates every 5s</p>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trafficData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
              <XAxis dataKey="time" tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }} tickLine={false} axisLine={false} unit=" Mbps" />
              <Tooltip
                contentStyle={{ background: 'rgb(var(--bg-surface))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 12 }}
                formatter={(value: number, name: string) => [`${Number(value || 0).toFixed(2)} Mbps`, name === 'rx' ? 'Download' : 'Upload']}
              />
              <Line type="monotone" dataKey="rx" stroke="rgb(var(--brand-blue))" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="tx" stroke="rgb(var(--brand-green))" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {telemetryLoading && <p className="text-xs text-text-muted mt-2">Loading live telemetry...</p>}
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-text-primary">Last Active Session Logs</h2>
          <p className="text-xs text-text-muted">Most recent 15 sessions</p>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Start</th>
                <th>End</th>
                <th>IP / NAS</th>
                <th>Duration</th>
                <th>Data Usage</th>
                <th>Cause</th>
              </tr>
            </thead>
            <tbody>
              {(telemetry?.sessions || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-text-muted">No session logs found</td>
                </tr>
              ) : (
                (telemetry?.sessions || []).map((session) => (
                  <tr key={session.radacctid}>
                    <td>{formatDateTime(session.start_time)}</td>
                    <td>{session.stop_time ? formatDateTime(session.stop_time) : 'Active'}</td>
                    <td>
                      <p className="text-sm text-text-primary">{session.framed_ip || '-'}</p>
                      <p className="text-xs text-text-muted">{session.nas_name || session.nas_ip || '-'}</p>
                    </td>
                    <td>{formatDuration(session.session_time_seconds)}</td>
                    <td>{session.total_gb} GB</td>
                    <td>{session.terminate_cause || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="card p-5 xl:col-span-1 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">Smart Renewal Predictor</h2>
            {insightsLoading && <Loader2 size={14} className="animate-spin text-text-muted" />}
          </div>
          <p className="text-xs text-text-muted">Churn risk score from status, expiry, usage trend and engagement</p>

          <div>
            <p className="text-xs text-text-muted">Risk Score</p>
            <p className={`text-3xl font-bold mt-1 ${riskColor}`}>{predictor?.score ?? 0}/100</p>
            <p className={`text-sm font-semibold mt-1 ${riskColor}`}>Risk: {predictor?.risk_level || 'Low'}</p>
          </div>

          <div>
            <p className="text-xs text-text-muted mb-1">Why</p>
            {(predictor?.reasons || []).length === 0 ? (
              <p className="text-sm text-text-muted">No major risk indicators right now.</p>
            ) : (
              <div className="space-y-1">
                {(predictor?.reasons || []).slice(0, 4).map((reason, idx) => (
                  <p key={idx} className="text-sm text-text-secondary">- {reason}</p>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs text-text-muted mb-1">Recommendation</p>
            <p className="text-sm text-text-secondary">{predictor?.recommendation || 'Maintain regular follow-up.'}</p>
          </div>
        </div>

        <div className="card p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-text-primary">Customer 360 Timeline</h2>
            <p className="text-xs text-text-muted">Billing, sessions, WhatsApp and audit events</p>
          </div>

          <div className="max-h-80 overflow-y-auto space-y-2">
            {insightsLoading ? (
              <p className="text-sm text-text-muted">Loading timeline...</p>
            ) : timeline.length === 0 ? (
              <p className="text-sm text-text-muted">No timeline events found.</p>
            ) : timeline.map((event) => (
              <div key={event.id} className="border border-border rounded-lg p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-text-primary">{event.title}</p>
                  <p className="text-xs text-text-muted">{formatDateTime(event.timestamp)}</p>
                </div>
                <p className="text-xs text-text-muted uppercase tracking-wide mt-0.5">{event.type}</p>
                <p className="text-sm text-text-secondary mt-1">{event.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <form className="card p-5 space-y-5" onSubmit={saveChanges}>
        <h2 className="text-lg font-semibold text-text-primary">User Settings</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">Full Name</label>
            <input name="full_name" className="input" value={form.full_name} onChange={handleChange} required />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Mobile</label>
            <input name="mobile" className="input" value={form.mobile} onChange={handleChange} required />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">ID Card Number</label>
            <input name="id_card_number" className="input" value={form.id_card_number} onChange={handleChange} />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Email</label>
            <input name="email" type="email" className="input" value={form.email} onChange={handleChange} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-text-muted mb-1">Address</label>
            <input name="address" className="input" value={form.address} onChange={handleChange} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">Zone</label>
            <select name="zone_id" className="select" value={form.zone_id} onChange={handleChange}>
              <option value="">Unassigned</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.area_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">NAS Router</label>
            <select name="nas_id" className="select" value={form.nas_id} onChange={handleChange}>
              <option value="">Unassigned</option>
              {nas.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Internet Package</label>
            <select name="profile_id" className="select" value={form.profile_id} onChange={handleChange} required>
              <option value="">Select package</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name} - Rs. {Number(p.retail_price || 0).toLocaleString()}</option>
              ))}
            </select>
            {selectedProfile && (
              <p className="text-xs text-text-muted mt-1">Selected package: {selectedProfile.name}</p>
            )}
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Status</label>
            <select name="status" className="select" value={form.status} onChange={handleChange}>
              <option value="Active">Active</option>
              <option value="Expired">Expired</option>
              <option value="Disabled">Disabled</option>
              <option value="Suspended">Suspended</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-text-muted mb-1">Notes</label>
            <textarea name="notes" className="input min-h-24" value={form.notes} onChange={handleChange} />
          </div>
        </div>

        <div className="flex justify-end">
          <button className="btn-primary" type="submit" disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save All Settings
          </button>
        </div>
      </form>

      {confirmAction && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="card w-full max-w-lg p-5 space-y-4">
            <h3 className="text-lg font-semibold text-text-primary">{confirmAction.title}</h3>
            <div className="space-y-2">
              {confirmAction.details.map((item, idx) => (
                <p key={idx} className="text-sm text-text-muted">• {item}</p>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setConfirmAction(null)}
                disabled={confirmingAction}
              >
                Cancel
              </button>
              <button
                type="button"
                className={confirmAction.type === 'delete' ? 'btn-danger btn-sm' : 'btn-primary btn-sm'}
                onClick={runConfirmedAction}
                disabled={confirmingAction}
              >
                {confirmingAction ? <Loader2 size={14} className="animate-spin" /> : null} {confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
