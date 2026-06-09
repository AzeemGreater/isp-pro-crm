import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, User, Network, Package, CheckCircle, ChevronRight, ChevronLeft, Loader } from 'lucide-react'
import api from '../../lib/api'

interface Zone    { id: number; zone_code: string; area_name: string; city: string }
interface Profile { id: number; name: string; download_speed: number; upload_speed: number; retail_price: number }
interface NAS     { id: number; name: string; ip_address: string }

const STEPS = [
  { id: 1, label: 'Personal Info',   icon: User },
  { id: 2, label: 'Network Setup',   icon: Network },
  { id: 3, label: 'Package & PPPoE', icon: Package },
]

export function NewSubscriberWizard({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [step, setStep]     = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [zones, setZones]   = useState<Zone[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [nasList, setNasList] = useState<NAS[]>([])

  const [form, setForm] = useState({
    full_name: '', mobile: '', id_card_number: '', email: '', address: '',
    zone_id: '', nas_id: '', profile_id: '',
    pppoe_username: '', pppoe_password: '', notes: '',
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    Promise.all([
      api.get<Zone[]>('/network/zones'),
      api.get<Profile[]>('/network/profiles'),
      api.get<NAS[]>('/network/nas'),
    ]).then(([z, p, n]) => { setZones(z.data); setProfiles(p.data); setNasList(n.data) })
  }, [])

  async function submit() {
    setLoading(true); setError('')
    try {
      await api.post('/subscribers', form)
      onSuccess()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg || 'Failed to create subscriber')
    } finally { setLoading(false) }
  }

  const selectedProfile = profiles.find(p => String(p.id) === form.profile_id)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        className="card w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="font-bold text-text-primary">New Subscriber</h2>
            <p className="text-xs text-text-muted mt-0.5">Step {step} of {STEPS.length}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"><X size={16}/></button>
        </div>

        {/* Step indicator */}
        <div className="flex px-5 py-4 gap-2 border-b border-border">
          {STEPS.map(s => (
            <div key={s.id} className={`flex items-center gap-2 flex-1 ${s.id < step ? 'opacity-100' : s.id === step ? 'opacity-100' : 'opacity-30'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${s.id < step ? 'bg-status-active text-white' : s.id === step ? 'bg-accent-cyan text-white' : 'bg-bg-hover text-text-muted'}`}>
                {s.id < step ? <CheckCircle size={14}/> : s.id}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${s.id === step ? 'text-text-primary' : 'text-text-muted'}`}>{s.label}</span>
              {s.id < STEPS.length && <div className={`flex-1 h-px ml-1 ${s.id < step ? 'bg-status-active' : 'bg-border'}`} />}
            </div>
          ))}
        </div>

        {/* Form content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-3">
                <div><label className="input-label">Full Name *</label>
                  <input value={form.full_name} onChange={e => set('full_name', e.target.value)} className="input" placeholder="Muhammad Ali Khan" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="input-label">Mobile *</label>
                    <input value={form.mobile} onChange={e => set('mobile', e.target.value)} className="input" placeholder="0301-2345678" /></div>
                  <div><label className="input-label">ID Card Number</label>
                    <input value={form.id_card_number} onChange={e => set('id_card_number', e.target.value)} className="input" placeholder="42101-1234567-1" /></div>
                </div>
                <div><label className="input-label">Email</label>
                  <input value={form.email} onChange={e => set('email', e.target.value)} className="input" placeholder="user@example.com" /></div>
                <div><label className="input-label">Address</label>
                  <textarea value={form.address} onChange={e => set('address', e.target.value)} rows={2} className="input resize-none" placeholder="House #, Street, Area" /></div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-3">
                <div><label className="input-label">ISP Zone</label>
                  <select value={form.zone_id} onChange={e => set('zone_id', e.target.value)} className="select">
                    <option value="">Select Zone</option>
                    {zones.map(z => <option key={z.id} value={z.id}>{z.zone_code} — {z.area_name}</option>)}
                  </select></div>
                <div><label className="input-label">MikroTik NAS Router</label>
                  <select value={form.nas_id} onChange={e => set('nas_id', e.target.value)} className="select">
                    <option value="">Select NAS</option>
                    {nasList.map(n => <option key={n.id} value={n.id}>{n.name} ({n.ip_address})</option>)}
                  </select></div>
                <div><label className="input-label">Notes</label>
                  <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} className="input resize-none" placeholder="Installation notes..." /></div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-3">
                <div><label className="input-label">Internet Package *</label>
                  <select value={form.profile_id} onChange={e => set('profile_id', e.target.value)} className="select">
                    <option value="">Select Package</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.name} — Rs. {p.retail_price}/mo ({p.download_speed/1024}MB/{p.upload_speed/1024}MB)</option>)}
                  </select></div>
                {selectedProfile && (
                  <div className="bg-accent-cyan/5 border border-accent-cyan/20 rounded-lg p-3 text-sm">
                    <p className="text-accent-cyan font-semibold">{selectedProfile.name}</p>
                    <p className="text-text-muted text-xs mt-1">↓ {selectedProfile.download_speed/1024} Mbps / ↑ {selectedProfile.upload_speed/1024} Mbps · Rs. {selectedProfile.retail_price}/month</p>
                  </div>
                )}
                <div><label className="input-label">PPPoE Username *</label>
                  <input value={form.pppoe_username} onChange={e => set('pppoe_username', e.target.value.toLowerCase())} className="input font-mono" placeholder="user.001" /></div>
                <div><label className="input-label">PPPoE Password *</label>
                  <input value={form.pppoe_password} onChange={e => set('pppoe_password', e.target.value)} className="input font-mono" placeholder="SecureP@ss123" /></div>
                {error && <p className="text-sm text-status-expired bg-status-expired/10 border border-status-expired/20 rounded-lg px-3 py-2">{error}</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-border">
          <button onClick={() => step > 1 ? setStep(s => s - 1) : onClose()} className="btn-ghost">
            <ChevronLeft size={14} /> {step > 1 ? 'Back' : 'Cancel'}
          </button>
          {step < 3 ? (
            <button onClick={() => setStep(s => s + 1)} className="btn-primary">
              Next <ChevronRight size={14} />
            </button>
          ) : (
            <button onClick={submit} disabled={loading || !form.full_name || !form.mobile || !form.pppoe_username || !form.pppoe_password || !form.profile_id} className="btn-success">
              {loading ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {loading ? 'Creating...' : 'Create Subscriber'}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
