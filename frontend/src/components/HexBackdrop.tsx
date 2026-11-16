import { useEffect, useRef } from 'react'
import { glowAt, hexCenters } from '../lib/hexGrid'
import type { HexCell } from '../lib/hexGrid'

/*
 * The brand panel is navy in every theme (`panel-from` / `panel-to` are not themed), so the pattern
 * paints with fixed colours, like LoginScene: white lines and the scene's sky blue for the glow.
 */
const LINE = '255, 255, 255'
const GLOW = '156, 195, 255'

const RADIUS = 26 // centre to corner, px
const INSET = 2 // each tile is drawn a little smaller, which leaves a gap between neighbours
const REACH = 150 // how far around the pointer the tiles light up, px
const RISE = 14 // how fast a tile lights up, per second
const FALL = 2.2 // how fast it fades, per second: slower, so the pointer leaves a trail
const RIPPLE_SPEED = 320 // px per second
const RIPPLE_WIDTH = 60
const RIPPLE_LIFE = 1.6 // seconds
const TWINKLE_EVERY = 380 // ms between two tiles that light up by themselves
const TWINKLE_LIFE = 1800 // ms

interface Cell extends HexCell {
  energy: number
  /** When this tile last started to twinkle by itself (ms), or 0. */
  twinkle: number
}

function trace(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const r = RADIUS - INSET
  for (let corner = 0; corner < 6; corner++) {
    const angle = (Math.PI / 3) * corner - Math.PI / 2
    const px = x + r * Math.cos(angle)
    const py = y + r * Math.sin(angle)
    if (corner === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

/**
 * A honeycomb behind the login panel that answers the pointer: tiles near it light up and fade
 * behind it as a trail, a press sends a ring across the grid, and now and then a tile or a slow
 * diagonal band glows by itself. Decorative only. It fills its parent, which must be positioned,
 * and listens on that parent, so the content drawn on top does not block it. With "reduce motion"
 * on it is a still grid. Nothing runs while the panel is hidden (below 1024 px).
 */
export function HexBackdrop({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const host = canvas?.parentElement
    const ctx = canvas?.getContext('2d')
    if (!canvas || !host || !ctx) return

    const still = window.matchMedia('(prefers-reduced-motion: reduce)')
    // Everything the frame loop and the listeners share, in one object they all write to
    const scene = {
      cells: [] as Cell[],
      width: 0,
      height: 0,
      pointer: null as { x: number; y: number } | null,
      ripples: [] as { x: number; y: number; start: number }[],
      frame: 0,
      last: 0,
      nextTwinkle: 0,
    }

    const drawGrid = () => {
      ctx.clearRect(0, 0, scene.width, scene.height)
      ctx.beginPath()
      for (const cell of scene.cells) trace(ctx, cell.x, cell.y)
      ctx.lineWidth = 1
      ctx.strokeStyle = `rgba(${LINE}, 0.07)`
      ctx.stroke()
    }

    const draw = (now: number) => {
      scene.frame = requestAnimationFrame(draw)
      // A tab that was in the background comes back with one huge step; treat it as one frame
      const dt = Math.min(0.05, (now - (scene.last || now)) / 1000)
      scene.last = now
      scene.ripples = scene.ripples.filter((ripple) => now - ripple.start < RIPPLE_LIFE * 1000)
      if (now >= scene.nextTwinkle && scene.cells.length > 0) {
        scene.cells[Math.floor(Math.random() * scene.cells.length)].twinkle = now
        scene.nextTwinkle = now + TWINKLE_EVERY
      }

      drawGrid()
      const rise = 1 - Math.exp(-dt * RISE)
      const fall = 1 - Math.exp(-dt * FALL)
      for (const cell of scene.cells) {
        // A faint band drifting across the diagonal, so the panel is never completely still
        let target = (0.5 + 0.5 * Math.sin((cell.x + cell.y) * 0.006 - now * 0.0005)) ** 8 * 0.22
        if (scene.pointer) target = Math.max(target, glowAt(Math.hypot(cell.x - scene.pointer.x, cell.y - scene.pointer.y), REACH))
        for (const ripple of scene.ripples) {
          const age = (now - ripple.start) / 1000
          const fromRing = Math.abs(Math.hypot(cell.x - ripple.x, cell.y - ripple.y) - age * RIPPLE_SPEED)
          target = Math.max(target, glowAt(fromRing, RIPPLE_WIDTH) * (1 - age / RIPPLE_LIFE))
        }
        if (cell.twinkle) {
          const age = (now - cell.twinkle) / TWINKLE_LIFE
          if (age >= 1) cell.twinkle = 0
          else target = Math.max(target, Math.sin(Math.PI * age) * 0.55)
        }
        cell.energy += (target - cell.energy) * (target > cell.energy ? rise : fall)
        if (cell.energy < 0.01) continue
        ctx.beginPath()
        trace(ctx, cell.x, cell.y)
        ctx.fillStyle = `rgba(${GLOW}, ${(cell.energy * 0.26).toFixed(3)})`
        ctx.fill()
        ctx.strokeStyle = `rgba(${LINE}, ${(cell.energy * 0.55).toFixed(3)})`
        ctx.stroke()
      }
    }

    const stop = () => {
      cancelAnimationFrame(scene.frame)
      scene.frame = 0
      scene.last = 0
    }
    const start = () => {
      stop()
      if (scene.width === 0 || scene.height === 0) return
      if (still.matches) drawGrid()
      else scene.frame = requestAnimationFrame(draw)
    }

    const resize = () => {
      const box = host.getBoundingClientRect()
      scene.width = Math.round(box.width)
      scene.height = Math.round(box.height)
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = scene.width * ratio
      canvas.height = scene.height * ratio
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      scene.cells = hexCenters(scene.width, scene.height, RADIUS).map((cell) => ({ ...cell, energy: 0, twinkle: 0 }))
      start()
    }

    const place = (event: PointerEvent) => {
      const box = host.getBoundingClientRect()
      return { x: event.clientX - box.left, y: event.clientY - box.top }
    }
    const onMove = (event: PointerEvent) => {
      scene.pointer = place(event)
    }
    const onLeave = () => {
      scene.pointer = null
    }
    const onDown = (event: PointerEvent) => {
      if (still.matches) return
      scene.ripples.push({ ...place(event), start: performance.now() })
    }

    const observer = new ResizeObserver(resize)
    observer.observe(host)
    host.addEventListener('pointermove', onMove)
    host.addEventListener('pointerleave', onLeave)
    host.addEventListener('pointerdown', onDown)
    still.addEventListener('change', start)
    resize()

    return () => {
      stop()
      observer.disconnect()
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
      host.removeEventListener('pointerdown', onDown)
      still.removeEventListener('change', start)
    }
  }, [])

  return <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 size-full ${className}`} />
}
