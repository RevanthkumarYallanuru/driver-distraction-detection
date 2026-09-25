import { AnimatePresence, motion } from 'framer-motion'
import { ScanEye } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useDashboard } from '../../hooks/useDashboard'
import type { Tone } from '../../lib/tone'
import { toneText } from '../../lib/tone'
import { StatusDot } from '../ui/StatusDot'

const MIN_VISIBLE_MS = 1600

function Row({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="flex items-center justify-between border-b border-edge py-2.5 last:border-0">
      <span className="text-[12px] text-ink-2">{label}</span>
      <span className={`flex items-center gap-2 text-[12px] font-semibold tracking-[0.16em] ${toneText[tone]}`}>
        <StatusDot tone={tone} pulse={tone === 'info'} size={6} />
        {value}
      </span>
    </div>
  )
}

/** "SYSTEM STARTING" sequence shown until the backend reports a live system. */
export function BootOverlay() {
  const connection = useDashboard((s) => s.connection)
  const camera = useDashboard((s) => s.telemetry?.camera.connected)
  const ai = useDashboard((s) => s.telemetry?.ai.status)
  const [minElapsed, setMinElapsed] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS)
    return () => window.clearTimeout(id)
  }, [])

  const ready = connection === 'open' && ai !== undefined && ai !== 'STARTING'
  useEffect(() => {
    if (ready && minElapsed) {
      const id = window.setTimeout(() => setDismissed(true), 700)
      return () => window.clearTimeout(id)
    }
  }, [ready, minElapsed])

  const cam: [string, Tone] = camera === undefined ? ['CHECKING', 'info'] : camera ? ['CONNECTED', 'ok'] : ['NOT FOUND', 'crit']
  const aiRow: [string, Tone] =
    ai === undefined || ai === 'STARTING' ? ['LOADING MODELS', 'info'] : ai === 'ONLINE' ? ['ONLINE', 'ok'] : ai === 'DEGRADED' ? ['DEGRADED', 'warn'] : [ai, 'crit']
  const link: [string, Tone] = connection === 'open' ? ['CONNECTED', 'ok'] : connection === 'closed' ? ['UNREACHABLE', 'crit'] : ['CONNECTING', 'info']

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-base/95 backdrop-blur-sm"
          exit={{ opacity: 0, transition: { duration: 0.5 } }}
        >
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-[340px] text-center">
            <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl border border-info/25 bg-info/10 text-info">
              <ScanEye size={26} strokeWidth={1.5} />
            </div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">{ready ? 'System ready' : 'System starting'}</p>
            <h1 className="mb-6 font-display text-[17px] font-semibold">DriveSafe AI · Cockpit Analytics</h1>
            <div className="card px-4 py-1 text-left">
              <Row label="Backend" value={link[0]} tone={link[1]} />
              <Row label="Camera" value={cam[0]} tone={cam[1]} />
              <Row label="AI" value={aiRow[0]} tone={aiRow[1]} />
              <Row label="Vehicle" value="SIMULATED" tone="info" />
            </div>
            {connection === 'closed' && (
              <p className="mt-4 text-[11.5px] text-ink-3">
                Start the backend: <span className="font-mono text-ink-2">cd backend &amp;&amp; uvicorn main:app</span>
              </p>
            )}
            {connection === 'closed' && (
              <button type="button" onClick={() => setDismissed(true)} className="mt-3 text-[11px] tracking-[0.14em] text-ink-3 underline-offset-4 hover:text-ink-2 hover:underline">
                OPEN DASHBOARD ANYWAY
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
