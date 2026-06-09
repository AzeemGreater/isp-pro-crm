import { useCallback, useEffect, useState } from 'react'
import { Loader, QrCode, RefreshCw, Shield } from 'lucide-react'
import api from '../lib/api'

interface WaStatus {
  connected: boolean
  status: string
  qr?: string
  initializing?: boolean
  error?: string
}

export function WhatsAppServer() {
  const [waStatus, setWaStatus] = useState<WaStatus>({ connected: false, status: 'disconnected' })
  const [busy, setBusy] = useState(false)

  const fetchStatus = useCallback(async () => {
    const res = await api.get<WaStatus>('/whatsapp/status')
    setWaStatus(res.data)
  }, [])

  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    if (waStatus.status !== 'connecting' && waStatus.status !== 'qr_ready') return
    const id = setInterval(() => {
      void fetchStatus()
    }, 3000)
    return () => clearInterval(id)
  }, [waStatus.status, fetchStatus])

  async function startPairing() {
    setBusy(true)
    try {
      await api.post('/whatsapp/connect')
      await fetchStatus()
    } finally {
      setBusy(false)
    }
  }

  async function resetPairing() {
    setBusy(true)
    try {
      await api.post('/whatsapp/pair/reset')
      await fetchStatus()
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    try {
      await api.post('/whatsapp/disconnect')
      await fetchStatus()
    } finally {
      setBusy(false)
    }
  }

  const statusColor = {
    connected: 'text-status-active',
    disconnected: 'text-status-expired',
    qr_ready: 'text-status-warning',
    connecting: 'text-accent-cyan',
    error: 'text-status-expired',
  }[waStatus.status] || 'text-text-muted'

  const statusLabel = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    qr_ready: 'Scan QR to Connect',
    connecting: 'Connecting...',
    error: 'Error',
  }[waStatus.status] || waStatus.status

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">WhatsApp Server</h1>
          <p className="text-sm text-text-muted">Manage pairing session, connectivity and QR authentication</p>
        </div>
        <div className={`text-sm font-medium ${statusColor}`}>{statusLabel}</div>
      </div>

      <div className="card p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <button onClick={() => void fetchStatus()} className="btn-ghost btn-sm" disabled={busy}>
            <RefreshCw size={14} /> Refresh Status
          </button>
          <button onClick={() => void startPairing()} className="btn-primary btn-sm" disabled={busy || waStatus.connected || waStatus.initializing}>
            {busy || waStatus.initializing ? <><Loader size={14} className="animate-spin" /> Starting...</> : 'Start Pairing'}
          </button>
          <button onClick={() => void resetPairing()} className="btn-ghost btn-sm" disabled={busy}>
            Reset Session
          </button>
          <button onClick={() => void disconnect()} className="btn-ghost btn-sm" disabled={busy || !waStatus.connected}>
            Disconnect
          </button>
        </div>

        <div className="rounded-lg border border-border bg-bg-base p-3 text-sm text-text-muted">
          <p className="font-medium text-text-primary mb-1">Status Details</p>
          <p>Connected: {waStatus.connected ? 'Yes' : 'No'}</p>
          <p>Mode: {waStatus.status}</p>
          {waStatus.error ? <p className="text-status-expired">Error: {waStatus.error}</p> : null}
        </div>
      </div>

      {waStatus.status === 'qr_ready' && waStatus.qr && (
        <div className="card p-5 flex flex-col items-center gap-3">
          <QrCode size={24} className="text-accent-cyan" />
          <p className="text-sm font-medium text-text-primary">Scan with WhatsApp to connect</p>
          <div className="bg-white p-4 rounded-xl">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(waStatus.qr)}`}
              alt="WhatsApp QR"
              className="w-52 h-52"
            />
          </div>
          <p className="text-xs text-text-muted">WhatsApp → Linked Devices → Link a Device</p>
        </div>
      )}

      <div className="card p-4 flex items-start gap-3">
        <Shield size={16} className="text-status-warning mt-0.5" />
        <div>
          <p className="text-sm font-medium text-text-primary">Operational Note</p>
          <p className="text-xs text-text-muted">If status remains disconnected after restart, use Reset Session and scan a fresh QR.</p>
        </div>
      </div>
    </div>
  )
}