import { AnimatePresence, motion } from 'framer-motion'
import { Bell, CarFront, ChevronDown, Moon, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useDashboard } from '../../hooks/useDashboard'
import { useTheme } from '../../hooks/useTheme'
import { formatTime, levelTone, toneText } from '../../lib/tone'
import { OPERATOR } from '../../services/config'
import { telemetryStore } from '../../services/telemetryStore'
import { StatusDot } from '../ui/StatusDot'

/** Closes a popover on outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

function Popover({ open, children, className = '' }: { open: boolean; children: React.ReactNode; className?: string }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className={`card absolute right-0 top-[calc(100%+8px)] z-50 !bg-panel shadow-2xl ${className}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Notifications() {
  const [open, setOpen] = useState(false)
  const unread = useDashboard((s) => s.unreadAlerts)
  const events = useDashboard((s) => s.events)
  const ref = useDismiss(open, () => setOpen(false))

  const toggle = () => {
    setOpen((o) => !o)
    telemetryStore.markAlertsRead()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={`Notifications${unread ? `, ${unread} unread alerts` : ''}`}
        className="relative grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-crit px-1 text-[9.5px] font-bold leading-4 text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      <Popover open={open} className="w-[340px] max-w-[calc(100vw-32px)]">
        <div className="flex items-center justify-between border-b border-edge px-4 py-3">
          <span className="card-title">Vehicle &amp; system events</span>
          <span className="text-[11px] text-ink-3">{events.length} recent</span>
        </div>
        <ul className="max-h-[360px] overflow-y-auto px-2 py-1">
          {events.length === 0 && <li className="px-2 py-6 text-center text-xs text-ink-3">No events yet</li>}
          {events.map((e) => (
            <li key={e.id} className="flex gap-2.5 rounded-lg px-2 py-2 hover:bg-panel-2">
              <span className="mt-1.5">
                <StatusDot tone={levelTone(e.level)} size={6} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-[11.5px] font-semibold ${toneText[levelTone(e.level)]}`}>{e.kind}</span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-3">{formatTime(e.timestamp)}</span>
                </div>
                <p className="truncate text-[12px] text-ink-2">{e.message}</p>
              </div>
            </li>
          ))}
        </ul>
      </Popover>
    </div>
  )
}

function Profile() {
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-panel-2"
        aria-expanded={open}
      >
        <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-brand-2 to-brand text-[12px] font-bold text-white">
          {OPERATOR.initials}
        </span>
        <span className="hidden text-[12.5px] font-medium text-ink-2 sm:block">{OPERATOR.role}</span>
        <ChevronDown size={14} className="text-ink-3" />
      </button>
      <Popover open={open} className="w-[280px] p-4 text-[12.5px] leading-relaxed text-ink-2">
        <p className="card-title mb-1">DriveSafe AI · v2</p>
        <p>AI-based real-time driver distraction detection and response prototype.</p>
        <p className="mt-2 rounded-lg border border-info/25 bg-info/10 px-3 py-2 text-info">
          Vehicle speed is <b>simulated</b>. This prototype does not control a real vehicle.
        </p>
      </Popover>
    </div>
  )
}

export function TopBar() {
  const connection = useDashboard((s) => s.connection)
  const { theme, toggle } = useTheme()
  const live = connection === 'open'

  return (
    <div className="flex items-center justify-between gap-4 border-b border-edge pb-3">
      <div className="flex items-center gap-2.5">
        <CarFront size={26} className="text-brand" strokeWidth={2} />
        <span className="font-display text-[19px] font-bold tracking-tight text-ink">
          DriveSafe <span className="text-brand">AI</span>
        </span>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3">
        <div className="hidden items-center gap-2 rounded-lg border border-edge bg-panel-2 px-3 py-1.5 sm:flex">
          <StatusDot tone={live ? 'ok' : connection === 'connecting' ? 'info' : 'crit'} pulse={live} />
          <span className="text-[12px] font-medium text-ink">
            {live ? 'Live Monitoring' : connection === 'connecting' ? 'Connecting…' : 'Offline'}
          </span>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <Notifications />
        <Profile />
      </div>
    </div>
  )
}
