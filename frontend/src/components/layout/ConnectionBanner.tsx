import { AnimatePresence, motion } from 'framer-motion'
import { WifiOff } from 'lucide-react'
import { useDashboard } from '../../hooks/useDashboard'

export function ConnectionBanner() {
  const connection = useDashboard((s) => s.connection)
  const everConnected = useDashboard((s) => s.telemetry !== null)
  const show = connection === 'closed' || connection === 'stale' || (connection === 'connecting' && everConnected)

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
        >
          <div className="flex items-center gap-3 rounded-xl border border-crit/30 bg-crit/10 px-4 py-2.5 text-[12px] text-crit">
            <WifiOff size={14} />
            <span className="font-semibold tracking-[0.14em]">
              {connection === 'stale' ? 'TELEMETRY DELAYED' : 'BACKEND CONNECTION LOST'}
            </span>
            <span className="text-crit/70">
              {connection === 'stale'
                ? 'No data for a few seconds; the display may be out of date.'
                : 'Reconnecting automatically… check that the FastAPI backend is running on port 8000.'}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
