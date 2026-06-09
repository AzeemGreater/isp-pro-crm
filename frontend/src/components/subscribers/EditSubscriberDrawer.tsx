import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Save, Trash2, Loader2, AlertTriangle } from 'lucide-react'
import api from '../../lib/api'
import toast from 'react-hot-toast'

interface EditDrawerProps {
  subId: number
  onClose: () => void
  onSuccess: () => void
}

export function EditSubscriberDrawer({ subId, onClose, onSuccess }: EditDrawerProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [formData, setFormData] = useState<any>(null)
  
  // Reference data for dropdowns
  const [zones, setZones] = useState<{id: number, area_name: string}[]>([])
  const [profiles, setProfiles] = useState<{id: number, name: string, retail_price: number}[]>([])
  const [nas, setNas] = useState<{id: number, name: string}[]>([])

  useEffect(() => {
    async function init() {
      try {
        const [subRes, zoneRes, profRes, nasRes] = await Promise.all([
          api.get(`/subscribers/${subId}`),
          api.get('/network/zones'),
          api.get('/network/profiles'),
          api.get('/network/nas')
        ])
        setFormData(subRes.data)
        setZones(zoneRes.data)
        setProfiles(profRes.data.filter((p: any) => p.is_active))
        setNas(nasRes.data)
      } catch {
        toast.error('Failed to load subscriber details')
        onClose()
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [subId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.put(`/subscribers/${subId}`, formData)
      toast.success('Subscriber updated successfully')
      onSuccess()
    } catch {
      // API interceptor handles toast
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to permanently delete ${formData.full_name}? This will remove all their RADIUS accounts and billing history.`)) return
    
    setDeleting(true)
    try {
      await api.delete(`/subscribers/${subId}`)
      toast.success('Subscriber deleted permanently')
      onSuccess()
    } catch {
      // API interceptor handles toast
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
      <div className="w-full max-w-md bg-bg-surface h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-accent-cyan" size={32} />
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-end backdrop-blur-sm">
      <motion.div 
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="w-full max-w-md bg-bg-surface h-full shadow-2xl flex flex-col border-l border-border"
      >
        <div className="flex items-center justify-between p-5 border-b border-border bg-bg-card">
          <div>
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
              Edit Subscriber
            </h2>
            <p className="text-xs text-text-muted font-mono mt-1">{formData?.pppoe_username}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-bg-hover rounded-full text-text-muted transition-colors"><X size={20}/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <form id="edit-form" onSubmit={handleSubmit} className="space-y-5">
            {/* Personal Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-accent-cyan uppercase tracking-wider">Personal Info</h3>
              
              <div>
                <label className="block text-xs text-text-muted mb-1.5">Full Name <span className="text-status-expired">*</span></label>
                <input required type="text" name="full_name" value={formData.full_name} onChange={handleChange} className="input w-full" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">Mobile <span className="text-status-expired">*</span></label>
                  <input required type="text" name="mobile" value={formData.mobile} onChange={handleChange} className="input w-full" />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">ID Card Number</label>
                  <input type="text" name="id_card_number" value={formData.cnic || ''} onChange={handleChange} className="input w-full" />
                </div>
              </div>
              
              <div>
                <label className="block text-xs text-text-muted mb-1.5">Address</label>
                <textarea name="address" value={formData.address || ''} onChange={handleChange} className="input w-full h-20 py-2 resize-none" />
              </div>
            </div>

            <div className="border-t border-border my-2" />

            {/* Network & Billing */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-accent-cyan uppercase tracking-wider">Network & Billing</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">ISP Zone</label>
                  <select name="zone_id" value={formData.zone_id || ''} onChange={handleChange} className="select w-full">
                    <option value="">-- Select Zone --</option>
                    {zones.map(z => <option key={z.id} value={z.id}>{z.area_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">NAS Router</label>
                  <select name="nas_id" value={formData.nas_id || ''} onChange={handleChange} className="select w-full">
                    <option value="">-- Select NAS --</option>
                    {nas.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-text-muted mb-1.5">Internet Package <span className="text-status-expired">*</span></label>
                <select required name="profile_id" value={formData.profile_id} onChange={handleChange} className="select w-full font-medium">
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name} — Rs. {p.retail_price}/mo</option>
                  ))}
                </select>
                <p className="text-[10px] text-text-muted mt-1.5">Changing package will update the MikroTik rate limit immediately.</p>
              </div>
            </div>
            
            <div className="border-t border-border my-2" />

            {/* Danger Zone */}
            <div className="space-y-3 bg-status-expired/5 border border-status-expired/20 rounded-lg p-4 mt-6">
              <h3 className="text-sm font-semibold text-status-expired flex items-center gap-2 uppercase tracking-wider">
                <AlertTriangle size={14} /> Danger Zone
              </h3>
              <p className="text-xs text-text-muted">Deleting a subscriber permanently removes their account from the database and FreeRADIUS.</p>
              <button type="button" onClick={handleDelete} disabled={deleting} className="btn-ghost text-status-expired hover:bg-status-expired/20 text-sm w-full py-2 flex items-center justify-center gap-2">
                {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} 
                {deleting ? 'Deleting...' : 'Delete Subscriber Permanently'}
              </button>
            </div>
          </form>
        </div>

        <div className="p-5 border-t border-border bg-bg-card flex gap-3">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button type="submit" form="edit-form" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
