import { AnimatePresence, motion } from 'framer-motion'
import { CameraOff, UserX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useDashboard } from '../../hooks/useDashboard'
import { attentionTone, pitchText, titleCase, toneText, yawText, type Tone } from '../../lib/tone'
import { STREAM_URL } from '../../services/config'
import { StatusDot } from '../ui/StatusDot'
import { DetectionOverlay } from './DetectionOverlay'

/** Re-mounts the <img> after a backend reconnect or camera reconnect. */
function useStreamSource() {
  const connection = useDashboard((s) => s.connection)
  const cameraConnected = useDashboard((s) => s.telemetry?.camera.connected)
  const [attempt, setAttempt] = useState(0)
  const wasClosed = useRef(false)

  useEffect(() => {
    if (connection === 'closed') wasClosed.current = true
    if (connection === 'open' && wasClosed.current) {
      wasClosed.current = false
      setAttempt((a) => a + 1)
    }
  }, [connection])

  useEffect(() => {
    if (cameraConnected) setAttempt((a) => a + 1)
  }, [cameraConnected])

  return { src: `${STREAM_URL}?session=${attempt}`, retry: () => setTimeout(() => setAttempt((a) => a + 1), 2000) }
}

function Row({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="flex items-center gap-1.5 text-[11.5px] leading-[1.55]">
      <span className="text-white/75">{label}:</span>
      <span className={`font-semibold tabular ${tone ? toneText[tone] : 'text-white'}`}>{value}</span>
    </div>
  )
}

const Chip = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`absolute flex items-center gap-2 rounded-md bg-black/60 px-2.5 py-1.5 text-[12px] font-semibold text-white backdrop-blur-sm ${className}`}>
    {children}
  </div>
)

export function CameraFeed() {
  const t = useDashboard((s) => s.telemetry)
  const connection = useDashboard((s) => s.connection)
  const { src, retry } = useStreamSource()

  const cameraConnected = t?.camera.connected ?? false
  const aiActive = t?.ai.status === 'ONLINE' || t?.ai.status === 'DEGRADED'
  const face = t?.face_detected ?? false
  const offline = connection === 'closed' || (t !== null && !cameraConnected)

  const phone = !t?.ai.phone_model
    ? { text: 'Unavailable', tone: 'muted' as Tone }
    : t.phone_detected
      ? { text: 'Detected', tone: 'crit' as Tone }
      : t.phone_visible
        ? { text: 'Possible', tone: 'warn' as Tone }
        : { text: 'Not Detected', tone: 'ok' as Tone }

  return (
    <div className="card relative h-full min-h-[240px] overflow-hidden bg-black !p-0">
      <img
        key={src}
        src={src}
        alt="Live driver camera"
        className="absolute inset-0 h-full w-full object-cover"
        onError={retry}
        draggable={false}
      />
      {aiActive && <DetectionOverlay />}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.5))]" />

      <Chip className="left-3 top-3">
        <StatusDot tone={cameraConnected ? 'ok' : 'crit'} pulse={cameraConnected} />
        Live Camera Feed
      </Chip>
      <Chip className="right-3 top-3 font-mono tabular">FPS: {t ? Math.round(t.camera.fps) : '--'}</Chip>

      {t && aiActive && face && (
        <div className="absolute bottom-3 left-3 rounded-lg bg-black/60 px-3 py-2 backdrop-blur-sm">
          <Row label="EAR" value={t.ear !== null ? t.ear.toFixed(2) : '—'} tone={t.eyes_state === 'CLOSED' ? 'warn' : undefined} />
          <Row label="Head" value={yawText(t.head_yaw)} tone={t.looking_away ? 'warn' : undefined} />
          <Row label="Pitch" value={pitchText(t.head_pitch)} />
          <Row label="Phone" value={phone.text} tone={phone.tone} />
          <Row label="State" value={titleCase(t.attention.label)} tone={attentionTone(t.attention.score)} />
        </div>
      )}

      <AnimatePresence>
        {t && aiActive && cameraConnected && !face && t.ai.face_model && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-black/65 px-3 py-2 text-[12px] font-semibold text-info backdrop-blur-sm"
          >
            <UserX size={14} /> No driver face detected
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(offline || (t && !aiActive)) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 grid place-items-center bg-[#050c18]/85 backdrop-blur-sm"
          >
            <div className="text-center">
              <CameraOff className="mx-auto mb-3 text-crit" size={28} strokeWidth={1.5} />
              <p className="font-display text-[15px] font-semibold tracking-wide text-crit">
                {connection === 'closed' ? 'Backend unreachable' : !cameraConnected ? 'Camera disconnected' : 'AI loading…'}
              </p>
              <p className="mt-1 text-[12px] text-white/55">AI system paused · retrying</p>
              {t?.camera.error && connection !== 'closed' && <p className="mt-2 font-mono text-[11px] text-white/45">{t.camera.error}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
