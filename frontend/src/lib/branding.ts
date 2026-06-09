import api from './api'

export type Branding = {
  role?: string
  role_label?: string
  app_name: string
  app_tagline: string
  logo_text: string
  primary_color: string
  accent_color: string
}

const STORAGE_KEY = 'crm_branding_current'

function hexToRgbTriplet(hex: string): string | null {
  const cleaned = hex.replace('#', '').trim()
  if (![3, 6].includes(cleaned.length)) return null
  const full = cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned
  const value = parseInt(full, 16)
  if (Number.isNaN(value)) return null
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `${r} ${g} ${b}`
}

export function applyBranding(branding: Branding): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(branding))

  const root = document.documentElement
  const primary = hexToRgbTriplet(branding.primary_color)
  const accent = hexToRgbTriplet(branding.accent_color)

  if (primary) {
    root.style.setProperty('--brand-blue', primary)
    root.style.setProperty('--accent-cyan', primary)
  }
  if (accent) {
    root.style.setProperty('--brand-green', accent)
    root.style.setProperty('--status-active', accent)
  }
}

export function getStoredBranding(): Branding | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Branding
  } catch {
    return null
  }
}

export async function loadCurrentBranding(): Promise<Branding | null> {
  const token = localStorage.getItem('crm_token')
  if (!token) return getStoredBranding()

  try {
    const res = await api.get<Branding>('/agents/settings/branding/current')
    applyBranding(res.data)
    return res.data
  } catch {
    return getStoredBranding()
  }
}
