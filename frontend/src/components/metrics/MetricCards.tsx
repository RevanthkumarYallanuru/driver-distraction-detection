import { motion, useTransform } from 'framer-motion'
import { Crosshair, Eye, Gauge, ScanFace, Smartphone, SquareUserRound } from 'lucide-react'
import { selectSeverity, useAnimatedValue } from '../../hooks/useAnimatedValue'
import { useDashboard } from '../../hooks/useDashboard'
import { pitchText, severityTone, titleCase, toneText, toneVar, yawText, type Tone } from '../../lib/tone'
import { MetricCard } from './MetricCard'

const Big = ({ children, tone }: { children: React.ReactNode; tone?: Tone }) => (
  <div className={`font-display text-[26px] font-bold leading-none tabular ${tone ? toneText[tone] : 'text-ink'}`}>{children}</div>
)
const Status = ({ children, tone }: { children: React.ReactNode; tone: Tone }) => (
  <motion.div key={String(children)} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className={`font-display text-[15px] font-semibold ${toneText[tone]}`}>
    {children}
  </motion.div>
)
const Sub = ({ children }: { children: React.ReactNode }) => <div className="mt-1 text-[12.5px] text-ink-2 tabular">{children}</div>

// ---------------------------------------------------------------- EAR

function Sparkline({ values, threshold }: { values: number[]; threshold: number }) {
  const W = 150
  const H = 30
  const lo = 0.1
  const hi = 0.4
  const y = (v: number) => H - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * H
  const step = W / Math.max(1, values.length - 1)
  let d = ''
  values.forEach((v, i) => {
    if (Number.isNaN(v)) return
    const prev = values[i - 1]
    d += `${i === 0 || prev === undefined || Number.isNaN(prev) ? 'M' : 'L'}${(i * step).toFixed(1)},${y(v).toFixed(1)} `
  })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-1.5 h-[30px] w-full" preserveAspectRatio="none" aria-hidden>
      <line x1={0} x2={W} y1={y(threshold)} y2={y(threshold)} stroke="var(--color-warn)" strokeOpacity={0.45} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke="var(--color-brand)" strokeWidth={1.8} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function EarCard() {
  const ear = useDashboard((s) => s.telemetry?.ear)
  const threshold = useDashboard((s) => s.telemetry?.ear_threshold ?? 0.22)
  const history = useDashboard((s) => s.earHistory)
  const closed = ear !== null && ear !== undefined && ear < threshold
  return (
    <MetricCard icon={<Eye size={22} />} title="Eye Aspect Ratio (EAR)" alert={closed ? 'warn' : null}>
      <Big tone={closed ? 'warn' : undefined}>{ear !== null && ear !== undefined ? ear.toFixed(2) : '--'}</Big>
      <Sparkline values={history} threshold={threshold} />
    </MetricCard>
  )
}

// ---------------------------------------------------------------- Head

export function HeadPositionCard() {
  const yaw = useDashboard((s) => s.telemetry?.head_yaw)
  const pitch = useDashboard((s) => s.telemetry?.head_pitch)
  const away = useDashboard((s) => s.telemetry?.looking_away ?? false)
  return (
    <MetricCard icon={<SquareUserRound size={22} />} title="Head Position" alert={away ? 'warn' : null}>
      <div className="space-y-1 text-[13.5px] tabular">
        <div className="flex gap-2">
          <span className="w-11 text-ink-2">Yaw:</span>
          <span className={`font-semibold ${away ? 'text-warn' : 'text-ink'}`}>{yawText(yaw)}</span>
        </div>
        <div className="flex gap-2">
          <span className="w-11 text-ink-2">Pitch:</span>
          <span className="font-semibold text-ink">{pitchText(pitch)}</span>
        </div>
      </div>
      {away && <div className="mt-1.5 text-[11.5px] font-semibold text-warn">Looking away</div>}
    </MetricCard>
  )
}

// ---------------------------------------------------------------- Phone

export function PhoneCard() {
  const model = useDashboard((s) => s.telemetry?.ai.phone_model)
  const detected = useDashboard((s) => s.telemetry?.phone_detected ?? false)
  const visible = useDashboard((s) => s.telemetry?.phone_visible ?? false)
  const score = useDashboard((s) => s.telemetry?.phone_score)

  const [text, tone]: [string, Tone] = !model
    ? ['Unavailable', 'muted']
    : detected
      ? ['Detected', 'crit']
      : visible
        ? ['Possible Phone', 'warn']
        : ['Not Detected', 'ok']

  return (
    <MetricCard icon={<Smartphone size={22} />} title="Phone Detection" alert={detected ? 'crit' : visible ? 'warn' : null}>
      <Status tone={tone}>{text}</Status>
      <Sub>Confidence: {score !== undefined && model ? score.toFixed(2) : '--'}</Sub>
    </MetricCard>
  )
}

// ---------------------------------------------------------------- Drowsiness

export function DrowsinessCard() {
  const state = useDashboard((s) => s.telemetry?.drowsiness_state ?? 'UNKNOWN')
  const earStatus = useDashboard((s) => s.telemetry?.ear_status ?? 'No data')
  const tone: Tone = state === 'DROWSY' ? 'crit' : state === 'EYES CLOSING' ? 'warn' : state === 'NOT DROWSY' ? 'ok' : 'muted'
  return (
    <MetricCard icon={<ScanFace size={22} />} title="Drowsiness" alert={state === 'DROWSY' ? 'crit' : state === 'EYES CLOSING' ? 'warn' : null}>
      <Status tone={tone}>{state === 'UNKNOWN' ? 'No Data' : titleCase(state)}</Status>
      <Sub>{earStatus}</Sub>
    </MetricCard>
  )
}

// ---------------------------------------------------------------- Gaze

const GAZE_RANGE_H = 45 // degrees shown at the ring edge
const GAZE_RANGE_V = 35

export function GazeCard() {
  const gaze = useDashboard((s) => s.telemetry?.gaze)
  const yaw = useDashboard((s) => s.telemetry?.head_yaw)
  const pitch = useDashboard((s) => s.telemetry?.head_pitch)
  const has = gaze && gaze.yaw !== null && gaze.pitch !== null

  // Plotted from the driver's point of view: their right is on the right.
  const clamp = (v: number) => Math.max(-1, Math.min(1, v))
  const dx = has ? clamp(-gaze!.yaw! / GAZE_RANGE_H) : 0
  const dy = has ? clamp(gaze!.pitch! / GAZE_RANGE_V) : 0
  const len = Math.hypot(dx, dy)
  const k = len > 1 ? 1 / len : 1
  const off = gaze?.direction && gaze.direction !== 'CENTER' && gaze.direction !== 'UNKNOWN'

  return (
    <MetricCard icon={<Crosshair size={22} />} title="Gaze Direction" alert={off ? 'warn' : null}>
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 64 64" className="size-[60px] shrink-0" aria-label={`Gaze ${gaze?.direction ?? 'unknown'}`}>
          <circle cx="32" cy="32" r="29" fill="none" stroke="var(--color-edge-strong)" strokeWidth="1.5" />
          <circle cx="32" cy="32" r="15" fill="none" stroke="var(--color-edge)" strokeWidth="1" />
          <line x1="3" y1="32" x2="61" y2="32" stroke="var(--color-edge-strong)" strokeWidth="1" />
          <line x1="32" y1="3" x2="32" y2="61" stroke="var(--color-edge-strong)" strokeWidth="1" />
          {has && (
            <motion.circle
              r="5"
              fill={off ? toneVar.warn : toneVar.ok}
              animate={{ cx: 32 + dx * k * 25, cy: 32 + dy * k * 25 }}
              transition={{ type: 'spring', stiffness: 200, damping: 22 }}
              initial={false}
            />
          )}
        </svg>
        <div className="min-w-0">
          <Status tone={off ? 'warn' : has ? 'ok' : 'muted'}>{has ? titleCase(gaze!.direction) : 'No Data'}</Status>
          <div className="mt-0.5 text-[11.5px] leading-snug text-ink-2 tabular">
            Yaw: {yaw !== null && yaw !== undefined ? `${Math.round(Math.abs(yaw))}°` : '--'}
            <br />
            Pitch: {pitch !== null && pitch !== undefined ? `${Math.round(Math.abs(pitch))}°` : '--'}
          </div>
        </div>
      </div>
    </MetricCard>
  )
}

// ---------------------------------------------------------------- Severity

const SR = 38
const HALF = Math.PI * SR

export function SeverityCard() {
  const severity = useDashboard((s) => s.telemetry?.severity)
  const value = useAnimatedValue(selectSeverity, { stiffness: 90, damping: 22, mass: 0.7 })
  const offset = useTransform(value, (v) => HALF * (1 - Math.max(0, Math.min(100, v)) / 100))
  const shown = useTransform(value, (v) => Math.round(v).toString())
  const tone = severityTone(severity?.label)
  const has = severity?.score !== null && severity?.score !== undefined

  return (
    <MetricCard icon={<Gauge size={22} />} title="Distraction Severity" alert={tone === 'crit' ? 'crit' : tone === 'warn' ? 'warn' : null}>
      <div className="relative mx-auto w-[120px]">
        <svg viewBox="0 0 100 56" className="w-full" aria-hidden>
          <path d={`M 12 50 A ${SR} ${SR} 0 0 1 88 50`} fill="none" stroke="var(--color-edge)" strokeWidth="9" strokeLinecap="round" />
          {has && (
            <motion.path
              d={`M 12 50 A ${SR} ${SR} 0 0 1 88 50`}
              fill="none"
              stroke={toneVar[tone]}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={HALF}
              style={{ strokeDashoffset: offset }}
            />
          )}
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center leading-none">
          {has ? (
            <motion.span className="font-display text-[22px] font-bold text-ink tabular">{shown}</motion.span>
          ) : (
            <span className="font-display text-[22px] font-bold text-ink-3">--</span>
          )}
          <span className="ml-0.5 text-[10.5px] text-ink-2">/ 100</span>
        </div>
      </div>
      <div className={`mt-1 text-center font-display text-[14px] font-semibold ${toneText[tone]}`}>{severity?.label ?? 'Unknown'}</div>
    </MetricCard>
  )
}
