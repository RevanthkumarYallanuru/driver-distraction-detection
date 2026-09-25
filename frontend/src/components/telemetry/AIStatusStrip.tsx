import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, BrainCircuit, Eye, EyeOff, Smartphone, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { useDashboard } from '../../hooks/useDashboard'
import { driverTone, toneBg, toneText, type Tone } from '../../lib/tone'
import type { Condition } from '../../types/telemetry'
import { Panel } from '../ui/Panel'

interface CardProps {
  icon: ReactNode
  label: string
  value: string
  tone: Tone
  sub?: ReactNode
  progress?: number // 0..1 towards temporal confirmation
  confirmed?: boolean
}

function StatusCard({ icon, label, value, tone, sub, progress = 0, confirmed = false }: CardProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-edge bg-white/[0.015] px-4 py-3">
      {confirmed && (
        <motion.div
          className={`pointer-events-none absolute inset-0 ${toneBg[tone]}`}
          animate={{ opacity: [0.04, 0.1, 0.04] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <div className="relative flex items-center justify-between">
        <span className="label flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        {sub}
      </div>
      <motion.div
        key={value}
        initial={{ opacity: 0.4 }}
        animate={{ opacity: 1 }}
        className={`relative mt-1.5 text-[15px] font-semibold tracking-[0.08em] ${toneText[tone]}`}
      >
        {value}
      </motion.div>
      <div className="relative mt-2.5 h-[3px] overflow-hidden rounded-full bg-white/[0.05]" title="Temporal validation progress">
        <motion.div
          className={`h-full ${confirmed ? toneBg[tone] : 'bg-ink-3'}`}
          animate={{ width: `${Math.round(progress * 100)}%` }}
          transition={{ duration: 0.12, ease: 'linear' }}
        />
      </div>
    </div>
  )
}

function EarMeter({ ear, threshold }: { ear: number | null; threshold: number }) {
  const scale = 0.45
  return (
    <span className="flex items-center gap-2 font-mono text-[10.5px] text-ink-3 tabular">
      EAR {ear !== null ? ear.toFixed(3) : '—'}
      <span className="relative h-1 w-10 rounded-full bg-white/[0.06]">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${ear !== null && ear < threshold ? 'bg-warn' : 'bg-info'}`}
          style={{ width: `${Math.min(100, ((ear ?? 0) / scale) * 100)}%` }}
        />
        <span className="absolute -inset-y-0.5 w-px bg-ink-2" style={{ left: `${(threshold / scale) * 100}%` }} />
      </span>
    </span>
  )
}

export function AIStatusStrip() {
  const t = useDashboard((s) => s.telemetry)
  const active = t && (t.ai.status === 'ONLINE' || t.ai.status === 'DEGRADED')
  const progress = (c: Condition) => (active ? t!.condition_progress[c] ?? 0 : 0)

  const eyes = active ? t!.eyes_state : 'UNKNOWN'
  const head = active ? t!.head_direction : 'UNKNOWN'
  const phone = !active
    ? 'UNKNOWN'
    : !t!.ai.phone_model
      ? 'UNAVAILABLE'
      : t!.phone_detected
        ? 'DETECTED'
        : t!.phone_visible
          ? 'VISIBLE'
          : 'NONE'
  const driver = t?.driver_status ?? 'UNKNOWN'

  return (
    <Panel
      title="AI Driver Status"
      icon={<BrainCircuit size={14} />}
      right={
        t?.ai.simulated?.length ? (
          <span className="rounded border border-warn/30 px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-warn">
            TEST INJECTION: {t.ai.simulated.join(', ')}
          </span>
        ) : (
          <span className="text-[10.5px] text-ink-3">Bars show sustained-duration validation</span>
        )
      }
      bodyClassName="grid grid-cols-2 gap-3 p-3 xl:grid-cols-4"
    >
      <StatusCard
        icon={eyes === 'CLOSED' ? <EyeOff size={12} /> : <Eye size={12} />}
        label="Eyes"
        value={t?.drowsiness_detected ? 'CLOSED · DROWSY' : eyes}
        tone={t?.drowsiness_detected ? 'warn' : eyes === 'OPEN' ? 'ok' : eyes === 'CLOSED' ? 'warn' : 'muted'}
        sub={<EarMeter ear={active ? t!.ear : null} threshold={t?.ear_threshold ?? 0.22} />}
        progress={progress('DROWSINESS')}
        confirmed={!!t?.drowsiness_detected}
      />
      <StatusCard
        icon={head === 'LEFT' ? <ArrowLeft size={12} /> : head === 'RIGHT' ? <ArrowRight size={12} /> : <UserRound size={12} />}
        label="Head"
        value={t?.looking_away ? `${head} · LOOKING AWAY` : head}
        tone={t?.looking_away ? 'warn' : head === 'CENTER' ? 'ok' : head === 'UNKNOWN' ? 'muted' : 'warn'}
        progress={progress('LOOKING_AWAY')}
        confirmed={!!t?.looking_away}
      />
      <StatusCard
        icon={<Smartphone size={12} />}
        label="Phone"
        value={phone === 'NONE' ? 'NOT DETECTED' : phone}
        tone={phone === 'DETECTED' ? 'crit' : phone === 'VISIBLE' ? 'warn' : phone === 'NONE' ? 'ok' : 'muted'}
        sub={
          t?.phone_confidence ? (
            <span className="font-mono text-[10.5px] text-ink-3 tabular">{Math.round(t.phone_confidence * 100)}%</span>
          ) : undefined
        }
        progress={progress('PHONE')}
        confirmed={!!t?.phone_detected}
      />
      <StatusCard
        icon={<UserRound size={12} />}
        label="Driver"
        value={driver}
        tone={driverTone(driver)}
        sub={
          t?.distraction_detected ? (
            <span className="text-[10px] font-semibold tracking-[0.14em] text-warn">DISTRACTION</span>
          ) : undefined
        }
        progress={t?.distraction_detected ? 1 : 0}
        confirmed={!!t?.distraction_detected}
      />
    </Panel>
  )
}
