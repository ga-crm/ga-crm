import { useSyncExternalStore } from 'react'

/** What a chart paints with, read from the theme tokens in index.css so every theme and accent applies. */
export interface ChartColors {
  series: [string, string]
  ink: string
  body: string
  meta: string
  grid: string
  canvas: string
  font: string
}

let cachedKey = ''
let cached: ChartColors | null = null

function readColors(): ChartColors {
  const root = document.documentElement
  const key = `${root.dataset.theme ?? ''}|${root.getAttribute('style') ?? ''}`
  if (cached && key === cachedKey) return cached
  const styles = getComputedStyle(root)
  const read = (name: string) => styles.getPropertyValue(name).trim()
  cachedKey = key
  cached = {
    series: [read('--color-chart-1'), read('--color-chart-2')],
    ink: read('--color-ink'),
    body: read('--color-ink-body'),
    meta: read('--color-ink-meta'),
    grid: read('--color-band'),
    canvas: read('--color-canvas'),
    font: read('--font-sans'),
  }
  return cached
}

function subscribe(onChange: () => void) {
  // The theme and accent are set on <html> (lib/theme.ts applyAppearance)
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] })
  return () => observer.disconnect()
}

/** The chart colours of the active theme; charts repaint when the person changes theme or accent. */
export function useChartColors(): ChartColors {
  return useSyncExternalStore(subscribe, readColors)
}

