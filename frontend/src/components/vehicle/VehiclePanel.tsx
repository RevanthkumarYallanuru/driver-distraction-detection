import { AnimatePresence, motion, useTransform } from 'framer-motion'
import { CarFront, Megaphone } from 'lucide-react'
import { useState } from 'react'
import { useDashboard } from '../../hooks/useDashboard'
import { useSpeedMotion } from '../../hooks/useSpeedMotion'
import { toneSoft, toneText, vehicleTone } from '../../lib/tone'
import { HORN_URL } from '../../services/config'
import type { Telemetry } from '../../types/telemetry'
import { Panel } from '../ui/Panel'
import { VehicleScene } from './VehicleScene'

const GAUGE_MAX = 80

const REASONS: Record<string, string> = {
  LOOKING_AWAY: 'Driver looking away from the road',
  PHONE: 'Mobile phone usage detected',
  DROWSINESS: 'Driver eyes closed: possible drowsiness',
  CRITICAL: 'Multiple distraction indicators',
}

function reasonFor(t: Telemetry | null): { text: string; tone: 'ok' | 'warn' | 'crit' | 'info' | 'muted' } {
  if (!t) return { text: 'Waiting for telemetry', tone: 'muted' }
  if (t.ai.status !== 'ONLINE' && t.ai.status !== 'DEGRADED') return { text: 'AI paused: holding current speed', tone: 'muted' }
  if (t.alert_type && REASONS[t.alert_type]) {
    const verb = t.base_status === 'SLOWING' ? 'Slowing' : 'Speed limited'
    return { text: `${verb}: ${REASONS[t.alert_type]}`, tone: t.alert_level === 'CRITICAL' ? 'crit' : 'warn' }
  }
  if (t.base_status === 'ACCELERATING') return { text: 'Driver attention restored: resuming speed', tone: 'info' }
  return { text: 'Driver attentive · cruising at normal speed', tone: 'ok' }
}

function SpeedReadout() {
  const speed = useSpeedMotion()
  const rounded = useTransform(speed, (v) => Math.round(v).toString())
  const width = useTransform(speed, (v) => `${Math.max(0, Math.min(100, (v / GAUGE_MAX) * 100))}%`)
  const target = useDashboard((s) => s.telemetry?.target_speed)
  const normal = useDashboard((s) => s.telemetry?.normal_speed ?? 60)
  const reduced = useDashboard((s) => s.telemetry?.reduced_speed ?? 30)
  const status = useDashboard((s) => s.telemetry?.vehicle_status)
  const tone = vehicleTone(status)

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <div>
        <div className="label mb-1">Speed</div>
        <div className="flex items-baseline gap-2">
          <motion.span className="font-mono text-[56px] font-semibold leading-none tracking-tight text-ink tabular">
            {rounded}
          </motion.span>
          <span className="text-sm font-medium text-ink-3">km/h</span>
        </div>
      </div>

      <div className="flex items-end gap-6">
        <div>
          <div className="label mb-1.5">Target</div>
          <div className="font-mono text-xl font-semibold text-ink-2 tabular">
            {target !== undefined ? target.toFixed(0) : '--'}
            <span className="ml-1 text-xs font-medium text-ink-3">km/h</span>
          </div>
        </div>
        <div>
          <div className="label mb-1.5">Status</div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={status ?? 'none'}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className={`rounded-md border px-2.5 py-1 text-xs font-bold tracking-[0.16em] ${toneSoft[tone]}`}
            >
              {status ?? 'OFFLINE'}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* speed bar with reduced / normal markers */}
      <div className="relative w-full pt-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div className={`h-full rounded-full ${tone === 'ok' ? 'bg-ok' : tone === 'info' ? 'bg-info' : tone === 'crit' ? 'bg-crit' : 'bg-warn'}`} style={{ width }} />
        </div>
        {[reduced, normal].map((mark) => (
          <div key={mark} className="absolute top-0 h-3.5 w-px bg-ink-3" style={{ left: `${(mark / GAUGE_MAX) * 100}%` }}>
            <span className="absolute left-1/2 top-4 -translate-x-1/2 font-mono text-[10px] text-ink-3">{mark}</span>
          </div>
        ))}
        {target !== undefined && (
          <motion.div
            className="absolute -top-1 h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-ink-2"
            animate={{ left: `calc(${(target / GAUGE_MAX) * 100}% - 5px)` }}
            transition={{ type: 'spring', stiffness: 200, damping: 26 }}
          />
        )}
      </div>
    </div>
  )
}

function HornButton() {
  const [busy, setBusy] = useState(false)
  const online = useDashboard((s) => s.connection === 'open')
  const active = useDashboard((s) => s.telemetry?.horn_active ?? false)

  const press = async () => {
    setBusy(true)
    try {
      await fetch(HORN_URL, { method: 'POST' })
    } finally {
      setTimeout(() => setBusy(false), 600)
    }
  }

  return (
    <button
      type="button"
      onClick={press}
      disabled={!online || busy}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10.5px] font-semibold tracking-[0.14em] transition-colors disabled:opacity-40 ${
        active ? 'border-warn/40 bg-warn/15 text-warn' : 'border-edge text-ink-2 hover:border-edge-strong hover:text-ink'
      }`}
      title="Sound the simulated horn"
    >
      <Megaphone size={12} /> HORN
    </button>
  )
}

export function VehiclePanel() {
  const t = useDashboard((s) => s.telemetry)
  const reason = reasonFor(t)

  return (
    <Panel
      title="Vehicle Monitor"
      icon={<CarFront size={14} />}
      right={
        <>
          <span className="rounded border border-info/25 bg-info/10 px-2 py-0.5 text-[10px] font-bold tracking-[0.16em] text-info">
            SIMULATED VEHICLE
          </span>
          <HornButton />
        </>
      }
      bodyClassName="flex flex-col p-4 gap-4"
    >
      <SpeedReadout />

      <div className="relative min-h-[180px] flex-1 overflow-hidden rounded-[10px] border border-edge bg-panel-2/40">
        <VehicleScene />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={reason.text}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute left-3 top-3 flex max-w-[85%] items-center gap-2 rounded-md border border-white/[0.06] bg-base/70 px-2.5 py-1.5 backdrop-blur-sm"
          >
            <span className={`text-[11px] font-medium ${toneText[reason.tone]}`}>{reason.text}</span>
          </motion.div>
        </AnimatePresence>
      </div>
    </Panel>
  )
}
