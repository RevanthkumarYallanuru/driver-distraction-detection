import { AnimatePresence, motion } from 'framer-motion'
import { ListChecks } from 'lucide-react'
import { memo } from 'react'
import { useDashboard } from '../../hooks/useDashboard'
import { formatTime, levelTone } from '../../lib/tone'
import { Panel } from '../ui/Panel'
import { StatusDot } from '../ui/StatusDot'

export const EventLog = memo(function EventLog() {
  const events = useDashboard((s) => s.events)

  return (
    <Panel title="Vehicle & System Events" icon={<ListChecks size={14} />} className="h-full" bodyClassName="relative">
      <div className="absolute inset-0 overflow-y-auto px-3 py-2">
        {events.length === 0 && <p className="py-6 text-center text-xs text-ink-3">No events yet</p>}
        <ul>
          <AnimatePresence initial={false}>
            {events.map((e) => (
              <motion.li
                key={e.id}
                layout="position"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-start gap-2.5 border-b border-edge/60 py-2 last:border-0"
              >
                <span className="mt-1.5">
                  <StatusDot tone={levelTone(e.level)} size={6} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[11px] font-semibold tracking-[0.1em] text-ink">{e.kind}</span>
                    <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular">{formatTime(e.timestamp)}</span>
                  </div>
                  <p className="truncate text-[11.5px] text-ink-2">{e.message}</p>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </Panel>
  )
})
