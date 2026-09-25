import { AnimatePresence, motion } from 'framer-motion'
import { Megaphone } from 'lucide-react'
import { useState } from 'react'
import { useDashboard } from '../../hooks/useDashboard'
import { toneSoft, vehicleTone } from '../../lib/tone'
import { HORN_URL } from '../../services/config'
import type { Telemetry } from '../../types/telemetry'
import { RoadScene } from './RoadScene'
import { Speedometer } from './Speedometer'

const REASONS: Record<string, string> = {
  LOOKING_AWAY: 'driver looking away',
  PHONE: 'phone usage detected',
  DROWSINESS: 'eyes closed (drowsiness)',
  CRITICAL: 'multiple distractions',
}

function reasonFor(t: Telemetry | null): string | null {
  if (!t) return null
  if (t.ai.status !== 'ONLINE' && t.ai.status !== 'DEGRADED') return 'AI paused · holding speed'
  if (t.alert_type && REASONS[t.alert_type]) {
    return `${t.base_status === 'SLOWING' ? 'Slowing to' : 'Limited to'} ${t.target_speed.toFixed(0)} km/h · ${REASONS[t.alert_type]}`
  }
  if (t.base_status === 'ACCELERATING') return `Attention restored · resuming ${t.target_speed.toFixed(0)} km/h`
  return null
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
      title="Sound the simulated horn"
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold backdrop-blur-sm transition-colors disabled:opacity-40 ${
        active ? 'border-warn/50 bg-warn/20 text-warn' : 'border-white/15 bg-black/40 text-white/80 hover:text-white'
      }`}
    >
      <Megaphone size={12} className={active ? 'animate-pulse' : ''} /> {active ? 'HORN' : 'Horn'}
    </button>
  )
}

export function VehicleSpeedCard() {
  const t = useDashboard((s) => s.telemetry)
  const status = t?.vehicle_status
  const reason = reasonFor(t)

  return (
    <div className="card relative h-full min-h-[240px] overflow-hidden !p-0">
      <RoadScene />

      <div className="absolute left-3 top-3 rounded-md bg-black/45 px-2.5 py-1.5 font-display text-[13.5px] font-semibold text-white backdrop-blur-sm">
        Vehicle Speed
      </div>

      <div className="absolute right-3 top-3 flex items-center gap-1.5">
        <span className="rounded-md border border-info/40 bg-black/45 px-2 py-1 text-[10px] font-bold tracking-[0.12em] text-[#22d3ee] backdrop-blur-sm">
          SIMULATED
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={status ?? 'none'}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18 }}
            className={`rounded-md border px-2 py-1 text-[10px] font-bold tracking-[0.12em] backdrop-blur-sm ${toneSoft[vehicleTone(status)]} !bg-black/45`}
          >
            {status ?? 'OFFLINE'}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="absolute inset-x-0 bottom-9 top-10 grid place-items-center">
        <Speedometer />
      </div>

      <div className="absolute inset-x-3 bottom-2.5 flex items-center justify-between gap-2">
        <AnimatePresence mode="wait" initial={false}>
          {reason ? (
            <motion.span
              key={reason}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`truncate rounded-md px-2 py-1 text-[11px] font-medium backdrop-blur-sm ${
                t?.alert_type ? 'bg-warn/20 text-[#fcd34d]' : 'bg-black/45 text-white/80'
              }`}
            >
              {reason}
            </motion.span>
          ) : (
            <span className="rounded-md bg-black/40 px-2 py-1 text-[11px] text-white/70 backdrop-blur-sm tabular">
              Target {t ? t.target_speed.toFixed(0) : '--'} km/h
            </span>
          )}
        </AnimatePresence>
        <HornButton />
      </div>
    </div>
  )
}
