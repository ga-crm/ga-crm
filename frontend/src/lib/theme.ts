import type { Appearance } from './types'

export const THEMES: Appearance['theme'][] = ['light', 'dark', 'midnight', 'soft', 'contrast', 'system']

export const ACCENT_PRESETS = [
  { id: 'blue', color: '#0057d2' },
  { id: 'indigo', color: '#4338ca' },
  { id: 'teal', color: '#0f766e' },
  { id: 'green', color: '#15803d' },
  { id: 'purple', color: '#7e22ce' },
  { id: 'orange', color: '#c2410c' },
  { id: 'slate', color: '#334155' },
] as const

export const DEFAULT_APPEARANCE: Appearance = { theme: 'light', accent: '#0057d2' }

const STORAGE_KEY = 'crm-appearance'
const ACCENT_VARS = ['--color-primary', '--color-primary-deep', '--color-on-primary', '--color-hero']
const HEX = /^#[0-9a-f]{6}$/i

function channels(hex: string): number[] {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16))
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.1 contrast ratio. */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

function mix(from: string, to: string, amount: number): string {
  const target = channels(to)
  const mixed = channels(from).map((value, index) => Math.round(value + (target[index] - value) * amount))
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

/** Moves a colour toward `toward` until it reaches the ratio on every background. */
function ensureContrast(color: string, toward: string, backgrounds: string[], ratio: number): string {
  for (let step = 0; step <= 20; step++) {
    const candidate = mix(color, toward, step / 20)
    if (backgrounds.every((background) => contrast(candidate, background) >= ratio)) return candidate
  }
  return toward
}

export interface ThemeSurfaces {
  canvas: string
  chrome: string
  bandBlue: string
}

/**
 * Any accent stays readable on any theme: it is lightened on dark themes and darkened on light ones.
 * The label colour is the theme's own light or dark extreme, which the accent was just tested against.
 */
export function deriveAccent(accent: string, surfaces: ThemeSurfaces, ratio = 4.5) {
  const isDark = luminance(surfaces.canvas) < 0.2
  const toward = isDark ? '#ffffff' : '#000000'
  const primary = ensureContrast(accent, toward, [surfaces.canvas, surfaces.chrome], ratio)
  const deep = ensureContrast(mix(primary, toward, 0.2), toward, [surfaces.canvas, surfaces.chrome, surfaces.bandBlue], ratio)
  // The hero band always carries white text, so it darkens on every theme
  const hero = ensureContrast(accent, '#000000', ['#ffffff'], ratio)
  return { primary, deep, onPrimary: isDark ? surfaces.canvas : '#ffffff', hero }
}

export const resolveTheme = (theme: Appearance['theme']): Exclude<Appearance['theme'], 'system'> =>
  theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme

export function applyAppearance(appearance: Appearance): void {
  const root = document.documentElement
  const theme = resolveTheme(appearance.theme)
  root.dataset.theme = theme
  for (const name of ACCENT_VARS) root.style.removeProperty(name)

  // The default accent uses the colours designed for each theme
  if (appearance.accent.toLowerCase() !== DEFAULT_APPEARANCE.accent) {
    const styles = getComputedStyle(root)
    const read = (name: string) => styles.getPropertyValue(name).trim()
    const { primary, deep, onPrimary, hero } = deriveAccent(
      appearance.accent,
      { canvas: read('--color-canvas'), chrome: read('--color-chrome'), bandBlue: read('--color-band-blue') },
      theme === 'contrast' ? 7 : 4.5,
    )
    root.style.setProperty('--color-primary', primary)
    root.style.setProperty('--color-primary-deep', deep)
    root.style.setProperty('--color-on-primary', onPrimary)
    root.style.setProperty('--color-hero', hero)
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance))
  } catch {
    // Only a cache to avoid a flash on load; the account holds the real value
  }
}

export function readCachedAppearance(): Appearance {
  try {
    const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (THEMES.includes(cached?.theme) && HEX.test(cached?.accent)) return cached
  } catch {
    // Fall through to the default
  }
  return DEFAULT_APPEARANCE
}
