import { describe, expect, it } from 'vitest'
import { glowAt, hexCenters } from '../src/lib/hexGrid'

describe('login panel honeycomb', () => {
  it('covers the whole panel, past the right and bottom edges', () => {
    const cells = hexCenters(546, 798, 26)
    expect(Math.min(...cells.map((cell) => cell.x))).toBe(0)
    expect(Math.min(...cells.map((cell) => cell.y))).toBe(0)
    expect(Math.max(...cells.map((cell) => cell.x))).toBeGreaterThanOrEqual(546)
    expect(Math.max(...cells.map((cell) => cell.y))).toBeGreaterThanOrEqual(798)
  })

  it('shifts every other row by half a cell, with rows one and a half radii apart', () => {
    const cells = hexCenters(200, 200, 20)
    const rows = [...new Set(cells.map((cell) => cell.y))]
    expect(rows.slice(0, 3)).toEqual([0, 30, 60])
    const firstOf = (y: number) => Math.min(...cells.filter((cell) => cell.y === y).map((cell) => cell.x))
    expect(firstOf(0)).toBe(0)
    expect(firstOf(30)).toBeCloseTo((Math.sqrt(3) * 20) / 2)
    const [a, b] = cells.filter((cell) => cell.y === 0)
    expect(b.x - a.x).toBeCloseTo(Math.sqrt(3) * 20)
  })

  it('draws nothing for a panel with no size (hidden below 1024 px)', () => {
    expect(hexCenters(0, 0, 26)).toEqual([])
    expect(hexCenters(500, 500, 0)).toEqual([])
  })

  it('glows fully at the light, less with distance, and not at all beyond its reach', () => {
    expect(glowAt(0, 150)).toBe(1)
    expect(glowAt(75, 150)).toBeCloseTo(0.25)
    expect(glowAt(150, 150)).toBe(0)
    expect(glowAt(400, 150)).toBe(0)
    expect(glowAt(10, 0)).toBe(0)
  })
})
