import { AnimatePresence, motion } from 'framer-motion'
import { memo, useEffect, useRef } from 'react'
import { useDashboard } from '../../hooks/useDashboard'
import { telemetryStore } from '../../services/telemetryStore'

// Scene geometry (SVG user units)
const VIEW_W = 800
const VIEW_H = 340
const ROAD_TOP = 236
const LANE_Y = 306
const DASH_PERIOD = 90
const LAMP_PERIOD = 260
const SKYLINE_PERIOD = 800
const PX_PER_KMH = 7 // 60 km/h -> 420 px/s of road motion
const WHEEL_R = 24

const CAR_X = 232
const CAR_Y = 176
const WHEELS = [
  { cx: 78, cy: 95 },
  { cx: 262, cy: 95 },
]

const BRAKING = new Set(['SLOWING', 'STOPPING', 'STOPPED'])

function Skyline({ x }: { x: number }) {
  // Deterministic low-contrast city silhouette.
  const blocks = [
    [0, 58], [46, 34], [80, 72], [132, 46], [170, 88], [214, 40], [262, 64], [318, 30],
    [350, 78], [402, 52], [446, 96], [496, 44], [540, 70], [596, 36], [632, 84], [690, 50], [742, 66],
  ]
  return (
    <g transform={`translate(${x},0)`}>
      {blocks.map(([bx, h], i) => {
        const w = (blocks[i + 1]?.[0] ?? SKYLINE_PERIOD) - bx - 6
        return <rect key={i} x={bx} y={ROAD_TOP - 26 - h} width={w} height={h} rx={1.5} />
      })}
    </g>
  )
}

function Lamp({ x }: { x: number }) {
  return (
    <g transform={`translate(${x},0)`}>
      <rect x={0} y={96} width={2.5} height={ROAD_TOP - 96} fill="#1a2330" />
      <path d="M1 98 Q 1 90 16 90 L 26 90" fill="none" stroke="#1a2330" strokeWidth={2.5} />
      <rect x={20} y={88} width={14} height={4} rx={2} fill="#9fdcff" opacity={0.55} />
      <ellipse cx={27} cy={ROAD_TOP + 2} rx={34} ry={4} fill="#38bdf8" opacity={0.05} />
    </g>
  )
}

function Wheel({ cx, cy, innerRef }: { cx: number; cy: number; innerRef: (el: SVGGElement | null) => void }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={WHEEL_R} fill="#07090c" stroke="#2c3949" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={WHEEL_R - 6} fill="#0e141c" />
      <g ref={innerRef}>
        {[0, 72, 144, 216, 288].map((a) => (
          <line
            key={a}
            x1={cx}
            y1={cy}
            x2={cx + Math.cos((a * Math.PI) / 180) * (WHEEL_R - 8)}
            y2={cy + Math.sin((a * Math.PI) / 180) * (WHEEL_R - 8)}
            stroke="#5d6a7c"
            strokeWidth={3}
            strokeLinecap="round"
          />
        ))}
        <circle cx={cx} cy={cy} r={WHEEL_R - 7} fill="none" stroke="#3a4859" strokeWidth={1.2} />
      </g>
      <circle cx={cx} cy={cy} r={4} fill="#9aa7b8" />
    </g>
  )
}

export const VehicleScene = memo(function VehicleScene() {
  const status = useDashboard((s) => s.telemetry?.vehicle_status)
  const hornActive = useDashboard((s) => s.telemetry?.horn_active ?? false)
  const alertLevel = useDashboard((s) => s.telemetry?.alert_level)
  const online = useDashboard((s) => s.connection === 'open' && s.telemetry !== null)

  const dashRef = useRef<SVGGElement>(null)
  const lampRef = useRef<SVGGElement>(null)
  const skyRef = useRef<SVGGElement>(null)
  const bodyRef = useRef<SVGGElement>(null)
  const wheelRefs = useRef<(SVGGElement | null)[]>([])

  // Animation loop: reads speed from the store directly (no React renders).
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let shown = telemetryStore.getState().telemetry?.speed ?? 0
    let distance = 0
    let wheelDeg = 0
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now

      const state = telemetryStore.getState()
      const live = state.connection === 'open' && state.telemetry
      const target = live ? state.telemetry!.speed : 0
      // Interpolate between 10 Hz telemetry samples for fluid motion.
      shown += (target - shown) * Math.min(1, dt * 5)

      const velocity = shown * PX_PER_KMH
      distance += velocity * dt
      wheelDeg = (wheelDeg + ((velocity * dt) / WHEEL_R) * (180 / Math.PI)) % 360

      dashRef.current?.setAttribute('transform', `translate(${-(distance % DASH_PERIOD)},0)`)
      lampRef.current?.setAttribute('transform', `translate(${-((distance * 0.55) % LAMP_PERIOD)},0)`)
      skyRef.current?.setAttribute('transform', `translate(${-((distance * 0.06) % SKYLINE_PERIOD)},0)`)
      wheelRefs.current.forEach((el, i) => {
        el?.setAttribute('transform', `rotate(${wheelDeg} ${WHEELS[i].cx} ${WHEELS[i].cy})`)
      })

      if (!reduced) {
        const bob = shown > 1 ? Math.sin(now / 90) * 0.35 * Math.min(1, shown / 60) : 0
        bodyRef.current?.setAttribute('transform', `translate(0,${bob.toFixed(2)})`)
      }

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  const braking = status !== undefined && BRAKING.has(status)
  const hazard = alertLevel === 'WARNING' || alertLevel === 'CRITICAL'
  const hazardColor = alertLevel === 'CRITICAL' ? '#f87171' : '#fbbf24'

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Simulated vehicle, ${status ?? 'offline'}`}>
      <defs>
        <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#233042" />
          <stop offset="0.55" stopColor="#141b25" />
          <stop offset="1" stopColor="#0b1017" />
        </linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#38bdf8" stopOpacity="0.22" />
          <stop offset="1" stopColor="#0b1017" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e0f2fe" stopOpacity="0.22" />
          <stop offset="1" stopColor="#e0f2fe" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="brakeGlow">
          <stop offset="0" stopColor="#ef4444" stopOpacity="0.75" />
          <stop offset="1" stopColor="#ef4444" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f141b" />
          <stop offset="1" stopColor="#090c11" />
        </linearGradient>
        <linearGradient id="fadeX" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0c1016" stopOpacity="1" />
          <stop offset="0.12" stopColor="#0c1016" stopOpacity="0" />
          <stop offset="0.88" stopColor="#0c1016" stopOpacity="0" />
          <stop offset="1" stopColor="#0c1016" stopOpacity="1" />
        </linearGradient>
        <filter id="soft" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* horizon grid */}
      <g stroke="#ffffff" strokeOpacity={0.035}>
        {[60, 100, 140, 180].map((y) => (
          <line key={y} x1={0} x2={VIEW_W} y1={y} y2={y} />
        ))}
      </g>

      {/* skyline (slow parallax) */}
      <g ref={skyRef} fill="#ffffff" fillOpacity={0.035}>
        <Skyline x={0} />
        <Skyline x={SKYLINE_PERIOD} />
      </g>

      {/* lamps (mid parallax) */}
      <g ref={lampRef}>
        {Array.from({ length: 6 }, (_, i) => (
          <Lamp key={i} x={i * LAMP_PERIOD - 40} />
        ))}
      </g>

      {/* road */}
      <rect x={0} y={ROAD_TOP} width={VIEW_W} height={VIEW_H - ROAD_TOP} fill="url(#road)" />
      <line x1={0} x2={VIEW_W} y1={ROAD_TOP} y2={ROAD_TOP} stroke="#2a3544" strokeWidth={1.5} />
      <line x1={0} x2={VIEW_W} y1={VIEW_H - 8} y2={VIEW_H - 8} stroke="#1c2430" strokeWidth={1} />
      <g ref={dashRef}>
        {Array.from({ length: Math.ceil(VIEW_W / DASH_PERIOD) + 2 }, (_, i) => (
          <rect key={i} x={i * DASH_PERIOD} y={LANE_Y} width={44} height={3} rx={1.5} fill="#9aa7b8" opacity={0.55} />
        ))}
        {Array.from({ length: Math.ceil(VIEW_W / DASH_PERIOD) + 2 }, (_, i) => (
          <rect key={`k${i}`} x={i * DASH_PERIOD + 20} y={ROAD_TOP + 5} width={2} height={5} fill="#2a3544" />
        ))}
      </g>

      {/* vehicle */}
      <g transform={`translate(${CAR_X},${CAR_Y})`}>
        <ellipse cx={170} cy={122} rx={170} ry={9} fill="#000" opacity={0.6} filter="url(#soft)" />

        {/* headlight beam */}
        <path d="M 336 64 L 560 40 L 560 110 Z" fill="url(#beam)" opacity={online ? 1 : 0.2} />

        {/* brake glow */}
        <motion.ellipse
          cx={6}
          cy={62}
          rx={42}
          ry={26}
          fill="url(#brakeGlow)"
          initial={false}
          animate={{ opacity: braking ? 1 : 0.12 }}
          transition={{ duration: 0.35 }}
        />

        <g ref={bodyRef}>
          {/* body */}
          <path
            d="M 12 92 L 7 72 Q 6 58 20 55 L 74 50 Q 100 22 152 14 L 206 12 Q 242 14 272 42 L 320 51 Q 338 55 340 70 L 340 84 Q 338 92 327 92 L 292 92 A 30 30 0 0 0 232 92 L 108 92 A 30 30 0 0 0 48 92 Z"
            fill="url(#body)"
            stroke="#3b4a5e"
            strokeWidth={1.2}
          />
          {/* roof highlight */}
          <path d="M 80 50 Q 104 24 152 16 L 206 14 Q 240 16 268 42" fill="none" stroke="#38bdf8" strokeOpacity={0.35} strokeWidth={1} />
          {/* glasshouse */}
          <path d="M 88 50 Q 108 29 152 21 L 162 21 L 162 49 Z" fill="url(#glass)" stroke="#2a3544" strokeWidth={0.8} />
          <path d="M 168 21 L 204 20 Q 232 22 256 46 L 168 48 Z" fill="url(#glass)" stroke="#2a3544" strokeWidth={0.8} />
          {/* belt line accent */}
          <path d="M 22 60 L 320 57" stroke="#38bdf8" strokeOpacity={0.28} strokeWidth={1} />
          {/* doors */}
          <path d="M 165 50 L 165 88 M 250 48 Q 252 70 246 88" stroke="#000" strokeOpacity={0.45} strokeWidth={1} fill="none" />
          <rect x={196} y={62} width={14} height={2.5} rx={1.2} fill="#5d6a7c" />
          <rect x={120} y={63} width={14} height={2.5} rx={1.2} fill="#5d6a7c" />
          {/* mirror */}
          <path d="M 252 44 L 262 42 L 264 50 L 254 50 Z" fill="#1b2430" stroke="#3b4a5e" strokeWidth={0.8} />
          {/* headlight */}
          <path d="M 322 60 L 338 63 L 338 68 L 324 67 Z" fill="#e0f2fe" opacity={0.9} />
          {/* tail light */}
          <motion.path
            d="M 8 60 L 20 58 L 20 66 L 9 67 Z"
            initial={false}
            animate={{ fill: braking ? '#ff4d4d' : '#7f1d1d' }}
            transition={{ duration: 0.25 }}
          />
          {/* hazard indicators */}
          {hazard && (
            <g>
              <motion.rect
                x={24} y={70} width={8} height={4} rx={2} fill={hazardColor}
                animate={{ opacity: [0.15, 1, 0.15] }}
                transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.rect
                x={314} y={72} width={8} height={4} rx={2} fill={hazardColor}
                animate={{ opacity: [0.15, 1, 0.15] }}
                transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
              />
            </g>
          )}
          {/* sensor pod: AI monitoring */}
          <circle cx={214} cy={18} r={2.4} fill={online ? '#34d399' : '#5d6a7c'} />
        </g>

        {WHEELS.map((w, i) => (
          <Wheel key={i} cx={w.cx} cy={w.cy} innerRef={(el) => (wheelRefs.current[i] = el)} />
        ))}

        {/* horn waves */}
        <AnimatePresence>
          {hornActive && (
            <g>
              {[0, 1, 2].map((i) => (
                <motion.path
                  key={i}
                  d="M 352 50 Q 366 70 352 90"
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth={2}
                  strokeLinecap="round"
                  initial={{ opacity: 0, x: 0 }}
                  animate={{ opacity: [0, 0.9, 0], x: [0, 26 + i * 4] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.25, ease: 'easeOut' }}
                />
              ))}
            </g>
          )}
        </AnimatePresence>
      </g>

      {/* edge fade into panel */}
      <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="url(#fadeX)" pointerEvents="none" />
    </svg>
  )
})
