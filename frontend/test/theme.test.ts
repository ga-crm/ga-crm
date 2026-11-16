import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACCENT_PRESETS, contrast, deriveAccent } from '../src/lib/theme'

const css = readFileSync(resolve(import.meta.dirname, '../src/index.css'), 'utf8')

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6});/gi)].map((match) => [match[1], match[2]]))
}

const base = tokens(css.match(/@theme static \{([\s\S]*?)\n\}/)![1])
const themes: Record<string, Record<string, string>> = { light: base }
for (const match of css.matchAll(/\[data-theme='(\w+)'\] \{([\s\S]*?)\}/g)) {
  themes[match[1]] = { ...base, ...tokens(match[2]) }
}

// Awkward on purpose: colours close to the background of some theme
const CUSTOM_ACCENTS = ['#ffffff', '#000000', '#ffff00', '#ff0000', '#808080', '#14181d']

describe('themes', () => {
  it('defines every theme offered in settings', () => {
    expect(Object.keys(themes).sort()).toEqual(['contrast', 'dark', 'light', 'midnight', 'soft'])
  })

  describe.each(Object.entries(themes))('%s', (_name, theme) => {
    it('keeps all text tiers readable on the canvas and the chrome band (WCAG AA)', () => {
      for (const ink of ['ink', 'ink-lead', 'ink-body', 'ink-list', 'ink-meta', 'ink-nav']) {
        expect(contrast(theme[ink], theme.canvas), `${ink} on canvas`).toBeGreaterThanOrEqual(4.5)
        expect(contrast(theme[ink], theme.chrome), `${ink} on chrome`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it('keeps status badges readable', () => {
      for (const tone of ['success', 'warning', 'notable', 'alert']) {
        expect(contrast(theme[tone], theme[`${tone}-band`]), `${tone} badge`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it('keeps its own accent readable', () => {
      for (const surface of [theme.canvas, theme.chrome]) {
        expect(contrast(theme.primary, surface)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(theme['primary-deep'], surface)).toBeGreaterThanOrEqual(4.5)
      }
      expect(contrast(theme['primary-deep'], theme['band-blue'])).toBeGreaterThanOrEqual(4.5)
      expect(contrast(theme['on-primary'], theme.primary)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(theme['on-primary'], theme['primary-deep'])).toBeGreaterThanOrEqual(4.5)
      expect(contrast(theme['on-hero'], theme.hero)).toBeGreaterThanOrEqual(4.5)
    })

    it('keeps chart series visible on the canvas (3:1 for graphics)', () => {
      for (const series of ['chart-1', 'chart-2']) {
        expect(contrast(theme[series], theme.canvas), `${series} on canvas`).toBeGreaterThanOrEqual(3)
      }
    })

    it('keeps each lead stage accent visible on the canvas and the chrome band (3:1 for graphics)', () => {
      for (const stage of ['new', 'contacted', 'appointment', 'met', 'proposal', 'submitted', 'issued', 'lost']) {
        for (const surface of ['canvas', 'chrome'])
          expect(contrast(theme[`stage-${stage}`], theme[surface]), `${stage} on ${surface}`).toBeGreaterThanOrEqual(3)
      }
    })

    it('keeps errors readable and control borders visible', () => {
      expect(contrast(theme.alert, theme['alert-band'])).toBeGreaterThanOrEqual(4.5)
      expect(contrast(theme.alert, theme.canvas)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(theme.hairline, theme.canvas)).toBeGreaterThanOrEqual(3)
    })

    it('makes any accent readable', () => {
      const surfaces = { canvas: theme.canvas, chrome: theme.chrome, bandBlue: theme['band-blue'] }
      for (const accent of [...ACCENT_PRESETS.map((preset) => preset.color), ...CUSTOM_ACCENTS]) {
        const { primary, deep, onPrimary, hero } = deriveAccent(accent, surfaces)
        expect(contrast(primary, theme.canvas), `${accent} link on canvas`).toBeGreaterThanOrEqual(4.5)
        expect(contrast(primary, theme.chrome), `${accent} link on chrome`).toBeGreaterThanOrEqual(4.5)
        expect(contrast(onPrimary, primary), `${accent} button label`).toBeGreaterThanOrEqual(4.5)
        expect(contrast(onPrimary, deep), `${accent} button hover`).toBeGreaterThanOrEqual(4.5)
        expect(contrast(theme['on-hero'], hero), `${accent} hero text`).toBeGreaterThanOrEqual(4.5)
        expect(contrast(deep, theme['band-blue']), `${accent} badge text`).toBeGreaterThanOrEqual(4.5)
      }
    })
  })

  it('lists every colour, so a nested sample never inherits from the active theme', () => {
    const overridable = Object.keys(base).filter((name) => !name.startsWith('panel-'))
    for (const match of css.matchAll(/\[data-theme='(\w+)'\] \{([\s\S]*?)\}/g)) {
      expect(Object.keys(tokens(match[2])).sort(), match[1]).toEqual(overridable.sort())
    }
  })

  it('changes colours only: no theme overrides radius, type or spacing', () => {
    for (const match of css.matchAll(/\[data-theme='\w+'\] \{([\s\S]*?)\}/g)) {
      const names = [...match[1].matchAll(/^\s*([\w-]+):/gm)].map((property) => property[1])
      for (const name of names) expect(name === 'color-scheme' || name.startsWith('--color-'), name).toBe(true)
    }
  })

  it('leaves the default accent untouched on the light theme', () => {
    const { primary } = deriveAccent('#0057d2', { canvas: base.canvas, chrome: base.chrome, bandBlue: base['band-blue'] })
    expect(primary).toBe('#0057d2')
  })
})
