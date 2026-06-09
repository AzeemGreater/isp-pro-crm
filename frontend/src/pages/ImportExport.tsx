import { useState } from 'react'
import { Download, Loader2, Upload } from 'lucide-react'
import api from '../lib/api'

type CsvRow = Record<string, string>

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const values = line.split(',')
    const obj: CsvRow = {}
    headers.forEach((h, i) => {
      obj[h] = (values[i] || '').trim().replace(/^"|"$/g, '')
    })
    return obj
  })
}

export function ImportExport() {
  const [rows, setRows] = useState<CsvRow[]>([])
  const [uploading, setUploading] = useState(false)
  const [mode, setMode] = useState<'upsert' | 'insert-only'>('upsert')

  async function onFile(file: File) {
    const text = await file.text()
    setRows(parseCsv(text))
  }

  async function uploadRows() {
    if (rows.length === 0) return
    setUploading(true)
    try {
      await api.post('/subscribers/import', { mode, rows })
      setRows([])
    } finally {
      setUploading(false)
    }
  }

  async function exportCsv() {
    const res = await api.get('/subscribers/export.csv', { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = 'subscribers-export.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Import / Export</h1>
        <p className="text-sm text-text-muted">Export subscribers CSV and import updates in bulk</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold text-text-primary">Export Data</h3>
          <p className="text-xs text-text-muted">Download current subscribers as CSV.</p>
          <button className="btn-primary" onClick={() => void exportCsv()}><Download size={14} /> Download CSV</button>
        </div>

        <div className="card p-4 space-y-3">
          <h3 className="font-semibold text-text-primary">Import / Update</h3>
          <input type="file" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) { void onFile(f) } }} />
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value as 'upsert' | 'insert-only')}>
            <option value="upsert">Upsert (insert + update)</option>
            <option value="insert-only">Insert only</option>
          </select>
          <p className="text-xs text-text-muted">Rows parsed: {rows.length}</p>
          <button className="btn-primary" disabled={rows.length === 0 || uploading} onClick={() => void uploadRows()}>
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload & Process
          </button>
        </div>
      </div>
    </div>
  )
}
