import { motion, useTransform } from 'framer-motion'
import { selectSpeed, useAnimatedValue } from '../../hooks/useAnimatedValue'
import { useDashboard } from '../../hooks/useDashboard'
import { GAUGE_MAX_KMH } from '../../services/config'

const CX = 150
const CY = 150
const R = 112
const START = 210 // degrees (maths convention), bottom-left
const SWEEP = 240 // clockwise to bottom-right

function point(value: number, radius: number) {
  const a = ((START - (SWEEP * value) / GAUGE_MAX_KMH) * Math.PI) / 180
  return { x: CX + radius * Math.cos(a), y: CY - radius * Math.sin(a) }
}

const s = point(0, R)
const e = point(GAUGE_MAX_KMH, R)
const ARC = `M ${s.x} ${s.y} A ${R} ${R} 0 1 1 ${e.x} ${e.y}`
const MAJOR = Array.from({ length: GAUGE_MAX_KMH / 20 + 1 }, (_, i) => i * 20)
const MINOR = Array.from({ length: GAUGE_MAX_KMH / 10 + 1 }, (_, i) => i * 10)

/** 240° speedometer; the fill and number spring toward the telemetry speed. */
export function Speedometer() {
  const speed = useAnimatedValue(selectSpeed)
  const target = useDashboard((st) => st.telemetry?.target_speed)
  const online = useDashboard((st) => st.connection === 'open' && st.telemetry !== null)
  const offset = useTransform(speed, (v) => 1 - Math.max(0, Math.min(1, v / GAUGE_MAX_KMH)))
  const shown = useTransform(speed, (v) => Math.round(v).toString())

  const tp = target !== undefined ? point(target, R + 13) : null
  const tAngle = target !== undefined ? -(START - (SWEEP * target) / GAUGE_MAX_KMH) + 90 : 0

  return (
    <svg viewBox="0 0 300 250" className="h-full max-h-[230px] w-full max-w-[300px]" role="img" aria-label="Simulated vehicle speed">
      <defs>
        <linearGradient id="speed-grad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="0.6" stopColor="#0ea5e9" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <filter id="speed-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      <path d={ARC} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={14} strokeLinecap="round" />
      {online && (
        <>
          <motion.path d={ARC} fill="none" stroke="url(#speed-grad)" strokeWidth={14} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" style={{ strokeDashoffset: offset }} filter="url(#speed-glow)" opacity={0.55} />
          <motion.path d={ARC} fill="none" stroke="url(#speed-grad)" strokeWidth={14} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" style={{ strokeDashoffset: offset }} />
        </>
      )}

      {MINOR.map((v) => {
        const a = point(v, R - 13)
        const b = point(v, R - (v % 20 === 0 ? 21 : 17))
        return <line key={v} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,255,255,0.45)" strokeWidth={v % 20 === 0 ? 1.6 : 1} />
      })}
      {MAJOR.map((v) => {
        const p = point(v, R - 36)
        return (
          <text key={v} x={p.x} y={p.y + 4} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize={12} fontFamily="Inter, sans-serif" fontWeight={500}>
            {v}
          </text>
        )
      })}

      {tp && online && (
        <motion.g animate={{ x: tp.x, y: tp.y, rotate: tAngle }} transition={{ type: 'spring', stiffness: 160, damping: 24 }} initial={false}>
          <path d="M 0 -6 L 5 3 L -5 3 Z" fill="#fbbf24" transform="rotate(180)" />
        </motion.g>
      )}

      <motion.text x={CX} y={CY + 14} textAnchor="middle" fill="#ffffff" fontSize={58} fontWeight={700} fontFamily="Poppins, Inter, sans-serif" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {online ? shown : '--'}
      </motion.text>
      <text x={CX} y={CY + 40} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={15} fontFamily="Inter, sans-serif">
        km/h
      </text>
    </svg>
  )
}
