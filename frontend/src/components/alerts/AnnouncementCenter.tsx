import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CarFront, CheckCircle2, OctagonAlert, Volume2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useDashboard } from '../../hooks/useDashboard'
import { levelTone, toneHex, toneText } from '../../lib/tone'
import type { Announcement } from '../../types/telemetry'

const VISIBLE_MS: Record<string, number> = {
  CRITICAL: 7000,
  WARNING: 6000,
  NORMAL: 4000,
  INFO: 4000,
}

function Icon({ a }: { a: Announcement }) {
  if (a.level === 'CRITICAL') return <OctagonAlert size={20} />
  if (a.type === 'ATTENTION_RESTORED') return <CheckCircle2 size={20} />
  return <AlertTriangle size={20} />
}

/**
 * Floating JARVIS-style announcement. The same announcement is spoken by
 * the backend VoiceService; this is its visual counterpart.
 */
export function AnnouncementCenter() {
  const latest = useDashboard((s) => s.announcement)
  const [shown, setShown] = useState<Announcement | null>(null)

  useEffect(() => {
    if (!latest) return
    setShown(latest)
    const timer = window.setTimeout(() => setShown((cur) => (cur?.id === latest.id ? null : cur)), VISIBLE_MS[latest.level] ?? 5000)
    return () => window.clearTimeout(timer)
  }, [latest])

  const tone = shown ? levelTone(shown.level) : 'muted'
  const color = toneHex[tone]
  const critical = shown?.level === 'CRITICAL'

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4" aria-live="assertive">
      <AnimatePresence mode="wait">
        {shown && (
          <motion.div
            key={shown.id}
            role="alert"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, transition: { duration: 0.18 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="pointer-events-auto relative w-full max-w-[440px] overflow-hidden rounded-2xl border bg-panel/95 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-md"
            style={{ borderColor: `${color}55` }}
          >
            {/* subtle pulse ring */}
            <motion.div
              className="pointer-events-none absolute inset-0 rounded-2xl"
              style={{ boxShadow: `inset 0 0 0 1px ${color}` }}
              animate={{ opacity: critical ? [0.15, 0.6, 0.15] : [0.1, 0.35, 0.1] }}
              transition={{ duration: critical ? 1.1 : 1.8, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />

            <div className="flex gap-3.5 px-5 pb-4 pt-4">
              <div className={`mt-0.5 ${toneText[tone]}`}>
                <Icon a={shown} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h3 className={`text-[12.5px] font-bold tracking-[0.2em] ${toneText[tone]}`}>{shown.title}</h3>
                  <button
                    type="button"
                    onClick={() => setShown(null)}
                    className="rounded p-0.5 text-ink-3 hover:text-ink"
                    aria-label="Dismiss announcement"
                  >
                    <X size={14} />
                  </button>
                </div>
                <p className="mt-1.5 text-[15px] font-medium leading-snug text-ink">{shown.message}</p>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-edge pt-2.5 text-[11px] text-ink-2">
                  {shown.detail && (
                    <span className="flex items-center gap-1.5">
                      <CarFront size={12} className="text-ink-3" />
                      {shown.detail}
                    </span>
                  )}
                  {shown.voice && (
                    <span className="flex items-center gap-1.5 text-ink-3" title={shown.voice}>
                      <Volume2 size={12} />
                      {shown.spoken ? 'Voice announcement' : 'Voice skipped (busy)'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
