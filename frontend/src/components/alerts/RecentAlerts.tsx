import { AnimatePresence, motion } from 'framer-motion'
import { Bell, CircleAlert, Info, TriangleAlert } from 'lucide-react'
import { memo } from 'react'
import { useDashboard } from '../../hooks/useDashboard'
import type { AlertLogEntry } from '../../types/telemetry'

function Icon({ level }: { level: AlertLogEntry['level'] }) {
  if (level === 'CRITICAL') return <CircleAlert size={17} className="shrink-0 fill-crit text-panel" />
  if (level === 'WARNING') return <TriangleAlert size={17} className="shrink-0 fill-warn text-panel" />
  return <Info size={17} className="shrink-0 fill-info text-panel" />
}

const messageTone: Record<string, string> = {
  CRITICAL: 'text-crit',
  WARNING: 'text-warn',
  INFO: 'text-ink',
  NORMAL: 'text-ink',
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour12: false })
}

/** Alerts raised by the AlertManager, each with the measurement that triggered it. */
export const RecentAlerts = memo(function RecentAlerts() {
  const alerts = useDashboard((s) => s.alerts)

  return (
    <div className="card flex h-full min-h-[200px] flex-col">
      <div className="flex items-center gap-2.5 px-4 pb-2 pt-3.5">
        <Bell size={18} className="text-brand" />
        <h2 className="card-title">Recent Alerts</h2>
        {alerts.length > 0 && <span className="ml-auto text-[11px] text-ink-3">{alerts.length} this session</span>}
      </div>
      <div className="relative min-h-0 flex-1">
        <ul className="absolute inset-0 overflow-y-auto px-4 pb-3">
          {alerts.length === 0 && <li className="py-6 text-center text-[12.5px] text-ink-3">No alerts yet: driver attentive</li>}
          <AnimatePresence initial={false}>
            {alerts.map((a) => (
              <motion.li
                key={a.id}
                layout="position"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.22 }}
                className="flex items-center gap-3 border-b border-edge/60 py-[7px] last:border-0"
              >
                <Icon level={a.level} />
                <span className="w-[62px] shrink-0 font-mono text-[12px] text-ink-2 tabular">{time(a.timestamp)}</span>
                <span className={`truncate text-[13px] ${messageTone[a.level] ?? 'text-ink'}`}>{a.message}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  )
})
