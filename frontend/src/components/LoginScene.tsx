import { useEffect, useId, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'

/*
 * The brand panel is navy in every theme (`panel-from` / `panel-to` are not themed), so the scene
 * paints with white at a few strengths and three fixed accents.
 */
const INK = '#ffffff'
const NAVY = '#022879'
const DEEP = '#061f66' // behind each glass block, so the honeycomb under it does not show through as noise
const GREEN = '#7fd6a0'
const AMBER = '#f2c069'
const SKY = '#9cc3ff'

/** The scene's own coordinate space; the SVG scales it to whatever room the panel has. */
const WIDTH = 760
const HEIGHT = 710
const CENTER = { x: 380, y: 359 }

const delay = (seconds: number) => ({ animationDelay: `${seconds}s` }) as CSSProperties

interface Paint {
  /** Fill of a glass block: brighter at the top left. */
  glass: string
  /** Its edge: a highlight that fades out. */
  edge: string
  area: string
  glow: string
}

/**
 * One block of the scene at its own depth. Nested groups each do one job, so their transforms do
 * not fight: placement, the entrance, the shift with the pointer (deeper = moves more), the idle float.
 */
function Layer({ x = 0, y = 0, depth, enter, float, children }: { x?: number; y?: number; depth: number; enter: number; float?: number; children: ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="crm-scene-in" style={delay(enter)}>
        <g className="crm-scene-depth" style={{ '--depth': depth } as CSSProperties}>
          {float === undefined ? children : (
            <g className="crm-scene-float" style={delay(float)}>
              {children}
            </g>
          )}
        </g>
      </g>
    </g>
  )
}

/** A frosted block: a dark base, a light sheet over it, a bright edge. */
function Glass({ paint, width, height, radius = 14, base = 0.82 }: { paint: Paint; width: number; height: number; radius?: number; base?: number }) {
  return (
    <>
      <rect width={width} height={height} rx={radius} fill={DEEP} fillOpacity={base} />
      <rect width={width} height={height} rx={radius} fill={paint.glass} stroke={paint.edge} />
    </>
  )
}

/** One Kanban card: a block with two lines of "text". */
function Card({ x, y, bright = false }: { x: number; y: number; bright?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="58" height="30" rx="5" fill={INK} fillOpacity={bright ? 0.95 : 0.14} />
      {bright && <rect width="3" height="30" rx="1.5" fill={AMBER} />}
      <rect x="9" y="9" width="30" height="4" rx="2" fill={bright ? NAVY : INK} fillOpacity={bright ? 0.85 : 0.6} />
      <rect x="9" y="18" width="20" height="3" rx="1.5" fill={bright ? NAVY : INK} fillOpacity={bright ? 0.45 : 0.3} />
    </g>
  )
}

/** An agent on the tree: a small block with a head and a name line. */
function Node({ x, y, level }: { x: number; y: number; level: number }) {
  return (
    <g transform={`translate(${x} ${y})`} className="crm-scene-node" style={delay(level * 0.5)}>
      <rect width="40" height="20" rx="5" fill={INK} fillOpacity="0.16" stroke={INK} strokeOpacity="0.3" />
      <circle cx="10" cy="10" r="4" fill={INK} fillOpacity="0.75" />
      <rect x="18" y="8" width="15" height="4" rx="2" fill={INK} fillOpacity="0.55" />
    </g>
  )
}

/** A person: a head and shoulders inside a disc. */
function Avatar({ x, y, radius, fill = INK, opacity = 0.22 }: { x: number; y: number; radius: number; fill?: string; opacity?: number }) {
  const unit = radius / 18
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={radius} fill={fill} fillOpacity={opacity} />
      <circle cy={-5 * unit} r={6 * unit} fill={INK} fillOpacity="0.85" />
      <path d={`M${-12 * unit} ${11 * unit} a${12 * unit} ${10 * unit} 0 0 1 ${24 * unit} 0 Z`} fill={INK} fillOpacity="0.85" />
    </g>
  )
}

const hexagon = (radius: number) =>
  Array.from({ length: 6 }, (_, corner) => {
    const angle = (Math.PI / 3) * corner - Math.PI / 2
    return `${(radius * Math.cos(angle)).toFixed(2)},${(radius * Math.sin(angle)).toFixed(2)}`
  }).join(' ')

const TILES = [
  { value: 46, color: GREEN, spark: 'M10 54 L24 50 L38 52 L52 46 L66 48 L80 42 L94 40' },
  { value: 38, color: AMBER, spark: 'M10 50 L24 52 L38 46 L52 49 L66 44 L80 47 L94 43' },
  { value: 52, color: GREEN, spark: 'M10 55 L24 51 L38 48 L52 50 L66 44 L80 41 L94 42' },
]
const TREND = 'M12 112 C28 112 28 98 44 98 S60 104 76 104 S92 82 108 82 S124 88 140 88 S156 62 172 62 S188 46 204 46'
const FUNNEL = [
  { width: 80, color: SKY, opacity: 0.95 },
  { width: 66, color: SKY, opacity: 0.7 },
  { width: 52, color: AMBER, opacity: 0.9 },
  { width: 38, color: GREEN, opacity: 0.75 },
  { width: 26, color: GREEN, opacity: 1 },
]

/** The dashboard in the middle: figures with sparklines, a trend that draws itself, the pipeline as a funnel. */
function Dashboard({ paint }: { paint: Paint }) {
  return (
    <>
      <Glass paint={paint} width={420} height={290} radius={18} base={0.86} />
      {/* Window bar */}
      {[SKY, AMBER, GREEN].map((color, index) => (
        <circle key={color} cx={20 + index * 14} cy="19" r="4" fill={color} fillOpacity="0.9" />
      ))}
      <rect x="140" y="13" width="140" height="12" rx="6" fill={INK} fillOpacity="0.12" />
      <rect x="362" y="13" width="12" height="12" rx="3" fill={INK} fillOpacity="0.2" />
      <circle cx="375" cy="13" r="3" fill={AMBER} />
      <circle cx="396" cy="19" r="9" fill={INK} fillOpacity="0.3" />
      <path d="M0 38 H420 M56 38 V290" stroke={INK} strokeOpacity="0.12" />
      {/* Navigation rail: the first entry is the current screen */}
      {Array.from({ length: 6 }, (_, index) => (
        <rect key={index} x="18" y={52 + index * 36} width="20" height="20" rx="6" fill={INK} fillOpacity={index === 0 ? 0.95 : 0.16} />
      ))}

      {TILES.map((tile, index) => (
        <g key={index} transform={`translate(${72 + index * 114} 52)`}>
          <rect width="104" height="64" rx="10" fill={INK} fillOpacity="0.08" />
          <rect x="10" y="11" width="34" height="5" rx="2.5" fill={INK} fillOpacity="0.45" />
          <rect x="10" y="23" width={tile.value} height="10" rx="3" fill={INK} fillOpacity="0.92" />
          <rect x="70" y="9" width="24" height="10" rx="3" fill={tile.color} fillOpacity="0.9" />
          <path d={tile.spark} pathLength="1" stroke={tile.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="crm-scene-draw" style={delay(index * 0.3)} />
        </g>
      ))}

      <g transform="translate(72 128)">
        <rect width="216" height="148" rx="10" fill={INK} fillOpacity="0.06" />
        <rect x="12" y="12" width="60" height="6" rx="3" fill={INK} fillOpacity="0.5" />
        <circle cx="176" cy="15" r="3" fill={SKY} />
        <circle cx="194" cy="15" r="3" fill={AMBER} />
        <path d="M12 50 H204 M12 80 H204 M12 110 H204" stroke={INK} strokeOpacity="0.1" />
        <path d="M12 120 L204 70" stroke={AMBER} strokeOpacity="0.8" strokeWidth="1.5" strokeDasharray="3 5" strokeLinecap="round" />
        <path d={`${TREND} L204 130 L12 130 Z`} fill={paint.area} className="crm-scene-area" />
        <path d={TREND} pathLength="1" stroke={INK} strokeWidth="2.2" strokeLinecap="round" className="crm-scene-draw" />
        {/* The latest point shows up once the line reaches it */}
        <g className="crm-scene-area">
          <circle cx="204" cy="46" r="4" fill={SKY} className="crm-scene-ping" />
          <circle cx="204" cy="46" r="4" fill={INK} />
        </g>
        {[12, 44, 76, 108, 140, 172, 204].map((x) => (
          <rect key={x} x={x - 5} y="136" width="10" height="3" rx="1.5" fill={INK} fillOpacity="0.25" />
        ))}
      </g>

      <g transform="translate(300 128)">
        <rect width="104" height="148" rx="10" fill={INK} fillOpacity="0.06" />
        <rect x="12" y="12" width="44" height="6" rx="3" fill={INK} fillOpacity="0.5" />
        {FUNNEL.map((stage, index) => (
          <rect
            key={index}
            x="12"
            y={32 + index * 22}
            width={stage.width}
            height="13"
            rx="4"
            fill={stage.color}
            fillOpacity={stage.opacity}
            className="crm-scene-grow"
            style={delay(index * 0.15)}
          />
        ))}
      </g>
    </>
  )
}

/**
 * Moves the scene with the pointer: `--scene-x` / `--scene-y` on the SVG run from -1 to 1 (the
 * pointer's place across the picture) and ease towards it, so the blocks glide instead of jumping.
 * CSS turns the two numbers into the tilt and into each layer's shift. Off with "reduce motion".
 */
function usePointerDepth() {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)')
    const at = { x: 0, y: 0, toX: 0, toY: 0, frame: 0 }

    const step = () => {
      at.x += (at.toX - at.x) * 0.08
      at.y += (at.toY - at.y) * 0.08
      svg.style.setProperty('--scene-x', at.x.toFixed(4))
      svg.style.setProperty('--scene-y', at.y.toFixed(4))
      const settled = Math.abs(at.toX - at.x) < 0.001 && Math.abs(at.toY - at.y) < 0.001
      at.frame = settled ? 0 : requestAnimationFrame(step)
    }
    const aim = (x: number, y: number) => {
      at.toX = x
      at.toY = y
      if (!at.frame) at.frame = requestAnimationFrame(step)
    }
    const onMove = (event: PointerEvent) => {
      const box = svg.getBoundingClientRect()
      if (still.matches || box.width === 0) return
      const clamp = (value: number) => Math.max(-1, Math.min(1, value))
      aim(clamp(((event.clientX - box.left) / box.width) * 2 - 1), clamp(((event.clientY - box.top) / box.height) * 2 - 1))
    }
    const onLeave = () => {
      aim(0, 0)
    }

    window.addEventListener('pointermove', onMove)
    document.documentElement.addEventListener('pointerleave', onLeave)
    still.addEventListener('change', onLeave)
    return () => {
      cancelAnimationFrame(at.frame)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      still.removeEventListener('change', onLeave)
    }
  }, [])

  return ref
}

/**
 * The login panel's picture: the CRM as glass blocks floating at different depths around a
 * dashboard. They fly in one after another, then live: a lead's card walks the pipeline, the trend
 * draws itself, the funnel and the goal ring fill, tasks get ticked, the agent tree lights up level
 * by level, lights run round the orbits. The whole picture tilts towards the pointer and nearer blocks move more.
 * Decorative only (hidden from screen readers); with "reduce motion" on it stands still, fully
 * drawn. The motion lives in index.css (`crm-scene-*`).
 */
export function LoginScene({ className }: { className?: string }) {
  const ref = usePointerDepth()
  // Gradient ids must be unique in the document, and plain enough to use inside url(#…)
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const paint: Paint = { glass: `url(#${id}-glass)`, edge: `url(#${id}-edge)`, area: `url(#${id}-area)`, glow: `url(#${id}-glow)` }

  return (
    <svg ref={ref} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden className={`crm-scene-tilt overflow-visible ${className ?? ''}`} fill="none">
      <defs>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={INK} stopOpacity="0.2" />
          <stop offset="1" stopColor={INK} stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={INK} stopOpacity="0.6" />
          <stop offset="0.5" stopColor={INK} stopOpacity="0.12" />
          <stop offset="1" stopColor={SKY} stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={SKY} stopOpacity="0.55" />
          <stop offset="1" stopColor={SKY} stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor={SKY} stopOpacity="0.38" />
          <stop offset="1" stopColor={SKY} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Light behind the dashboard, and the orbits the blocks sit on */}
      <Layer x={CENTER.x} y={CENTER.y} depth={4} enter={0}>
        <ellipse rx="340" ry="290" fill={paint.glow} />
        <g className="crm-scene-spin" style={{ animationDuration: '90s' }}>
          <circle r="215" stroke={INK} strokeOpacity="0.2" strokeDasharray="2 10" strokeLinecap="round" />
        </g>
        <g className="crm-scene-spin" style={{ animationDuration: '16s' }}>
          <circle r="215" pathLength="100" stroke={SKY} strokeWidth="2" strokeDasharray="7 93" strokeLinecap="round" />
          <circle cx="215" r="4" fill={SKY} />
        </g>
        <g className="crm-scene-spin" style={{ animationDuration: '140s', animationDirection: 'reverse' }}>
          <circle r="290" stroke={INK} strokeOpacity="0.13" strokeDasharray="2 12" strokeLinecap="round" />
        </g>
        <g className="crm-scene-spin" style={{ animationDuration: '26s', animationDirection: 'reverse' }}>
          <circle r="290" pathLength="100" stroke={AMBER} strokeWidth="2" strokeDasharray="4 96" strokeLinecap="round" />
          <circle cx="290" r="3.5" fill={AMBER} />
        </g>
        <circle r="365" stroke={INK} strokeOpacity="0.08" />
      </Layer>

      <Layer x={170} y={214} depth={12} enter={0.05} float={0}>
        <Dashboard paint={paint} />
      </Layer>

      {/* Goal ring: fills to its mark */}
      <Layer x={100} y={326} depth={20} enter={0.6} float={-1}>
        <circle r="46" fill={DEEP} fillOpacity="0.75" />
        <circle r="46" fill={paint.glass} stroke={paint.edge} />
        <circle r="30" stroke={INK} strokeOpacity="0.16" strokeWidth="8" />
        <circle r="30" pathLength="100" stroke={GREEN} strokeWidth="8" strokeLinecap="round" transform="rotate(-90)" className="crm-scene-ring" />
        <rect x="-14" y="-7" width="28" height="8" rx="4" fill={INK} fillOpacity="0.9" />
        <rect x="-9" y="6" width="18" height="4" rx="2" fill={INK} fillOpacity="0.4" />
      </Layer>

      {/* Pipeline: one card moves from stage to stage */}
      <Layer x={24} y={470} depth={24} enter={0.4} float={-3}>
        <Glass paint={paint} width={252} height={172} />
        {[SKY, AMBER, GREEN].map((color, index) => (
          <g key={color} transform={`translate(${10 + index * 80} 10)`}>
            <rect width="72" height="152" rx="8" fill={INK} fillOpacity="0.06" />
            <circle cx="12" cy="14" r="3.5" fill={color} />
            <rect x="20" y="11.5" width="30" height="5" rx="2" fill={INK} fillOpacity="0.45" />
          </g>
        ))}
        <Card x={17} y={46} />
        <Card x={97} y={46} />
        <Card x={177} y={46} />
        <Card x={177} y={122} />
        <g className="crm-scene-card">
          <Card x={17} y={84} bright />
        </g>
      </Layer>

      {/* A deal just closed */}
      <Layer x={40} y={112} depth={26} enter={0.3} float={-2}>
        <Glass paint={paint} width={216} height={60} />
        <g className="crm-scene-pop">
          <circle cx="30" cy="30" r="16" fill={GREEN} />
          <path d="M23 30 l5 5 l9 -10" stroke={NAVY} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <rect x="56" y="19" width="96" height="7" rx="3.5" fill={INK} fillOpacity="0.9" />
        <rect x="56" y="34" width="64" height="5" rx="2.5" fill={INK} fillOpacity="0.4" />
        <rect x="168" y="22" width="34" height="16" rx="5" fill={GREEN} fillOpacity="0.22" />
        <rect x="176" y="27.5" width="18" height="5" rx="2.5" fill={GREEN} />
      </Layer>

      {/* Agent tree: lights up level by level */}
      <Layer x={486} y={500} depth={28} enter={0.5} float={-4}>
        <Glass paint={paint} width={250} height={170} />
        <rect x="16" y="15" width="70" height="6" rx="3" fill={INK} fillOpacity="0.5" />
        <rect x="200" y="11" width="34" height="14" rx="4" fill={INK} fillOpacity="0.14" />
        <g transform="translate(10 46)">
          <g stroke={INK} strokeOpacity="0.35" strokeWidth="1.5">
            <path d="M115 20 V30 H55 V40 M115 30 H175 V40" />
            <path d="M55 60 V70 H20 V80 M55 70 H90 V80" />
            <path d="M175 60 V70 H140 V80 M175 70 H210 V80" />
          </g>
          <Node x={95} y={0} level={0} />
          <Node x={35} y={40} level={1} />
          <Node x={155} y={40} level={1} />
          <Node x={0} y={80} level={2} />
          <Node x={70} y={80} level={2} />
          <Node x={120} y={80} level={2} />
          <Node x={190} y={80} level={2} />
        </g>
      </Layer>

      {/* A lead, with a new-notification ping */}
      <Layer x={520} y={44} depth={30} enter={0.2} float={-5}>
        <Glass paint={paint} width={206} height={108} />
        <Avatar x={34} y={36} radius={18} />
        <rect x="62" y="23" width="96" height="7" rx="3.5" fill={INK} fillOpacity="0.8" />
        <rect x="62" y="38" width="64" height="5" rx="2.5" fill={INK} fillOpacity="0.4" />
        <rect x="16" y="72" width="54" height="16" rx="5" fill={GREEN} fillOpacity="0.9" />
        <rect x="78" y="72" width="44" height="16" rx="5" fill={INK} fillOpacity="0.18" />
        <rect x="130" y="72" width="34" height="16" rx="5" fill={INK} fillOpacity="0.18" />
        <circle cx="190" cy="16" r="5" fill={AMBER} className="crm-scene-ping" />
        <circle cx="190" cy="16" r="5" fill={AMBER} />
      </Layer>

      {/* Today's tasks: done, done, one still due */}
      <Layer x={292} y={70} depth={32} enter={0.35} float={-2.5}>
        <Glass paint={paint} width={168} height={96} />
        {[0, 1, 2].map((row) => (
          <g key={row} transform={`translate(16 ${16 + row * 24})`}>
            {row < 2 ? (
              <g className={row === 1 ? 'crm-scene-pop' : undefined} style={delay(2)}>
                <rect width="14" height="14" rx="4" fill={GREEN} />
                <path d="M3.5 7 l2.5 2.5 l4.5 -5" stroke={NAVY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            ) : (
              <rect x="0.75" y="0.75" width="12.5" height="12.5" rx="3.5" stroke={INK} strokeOpacity="0.6" strokeWidth="1.5" />
            )}
            <rect x="24" y="4" width={[84, 64, 76][row]} height="6" rx="3" fill={INK} fillOpacity={row < 2 ? 0.4 : 0.85} />
            {row === 2 && <circle cx="130" cy="7" r="4" fill={AMBER} className="crm-scene-node" />}
          </g>
        ))}
      </Layer>

      {/* Someone is typing in the team chat */}
      <Layer x={616} y={286} depth={34} enter={0.7} float={-1.5}>
        <Glass paint={paint} width={116} height={64} radius={18} />
        <Avatar x={28} y={32} radius={13} fill={SKY} opacity={0.45} />
        {[56, 72, 88].map((x, index) => (
          <circle key={x} cx={x} cy="32" r="5" fill={INK} className="crm-scene-typing" style={delay(index * 0.18)} />
        ))}
      </Layer>

      {/* Nearest to the eye: loose hexagons and sparks */}
      <Layer depth={44} enter={0.8}>
        <polygon points={hexagon(16)} transform="translate(486 34)" stroke={SKY} strokeOpacity="0.8" strokeWidth="1.5" className="crm-scene-node" />
        <polygon points={hexagon(12)} transform="translate(732 420)" stroke={AMBER} strokeOpacity="0.8" strokeWidth="1.5" className="crm-scene-node" style={delay(1)} />
        <polygon points={hexagon(10)} transform="translate(262 56)" fill={INK} fillOpacity="0.14" stroke={INK} strokeOpacity="0.5" className="crm-scene-node" style={delay(2)} />
        <polygon points={hexagon(15)} transform="translate(382 640)" stroke={GREEN} strokeOpacity="0.7" strokeWidth="1.5" className="crm-scene-node" style={delay(0.5)} />
        {[
          [150, 66],
          [484, 188],
          [742, 240],
          [30, 412],
          [446, 690],
          [604, 428],
        ].map(([x, y], index) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" fill={INK} className="crm-scene-node" style={delay(index * 0.45)} />
        ))}
      </Layer>
    </svg>
  )
}
