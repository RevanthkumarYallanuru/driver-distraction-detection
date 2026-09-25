import { AnimatePresence, motion } from 'framer-motion'
import { CameraOff, Cctv, UserX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useDashboard } from '../../hooks/useDashboard'
import { driverTone, toneSoft, toneText, type Tone } from '../../lib/tone'
import { STREAM_URL } from '../../services/config'
import { Panel } from '../ui/Panel'
import { StatusDot } from '../ui/StatusDot'
import { DetectionOverlay } from './DetectionOverlay'

function HudRow({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[10px] tracking-[0.14em] text-white/55">{label}</span>
      <span className={`font-mono text-[11px] font-semibold ${toneText[tone]}`}>{value}</span>
    </div>
  )
}

/** Re-mounts the <img> after stream errors or backend reconnects. */
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

export function CameraPanel() {
  const t = useDashboard((s) => s.telemetry)
  const connection = useDashboard((s) => s.connection)
  const { src, retry } = useStreamSource()

  const cameraConnected = t?.camera.connected ?? false
  const aiStatus = t?.ai.status
  const faceDetected = t?.face_detected ?? false
  const aiActive = aiStatus === 'ONLINE' || aiStatus === 'DEGRADED'
  const aspect = t?.overlay.frame_width ? `${t.overlay.frame_width} / ${t.overlay.frame_height}` : '4 / 3'

  const eyes = t?.eyes_state ?? 'UNKNOWN'
  const head = t?.head_direction ?? 'UNKNOWN'
  const phone = t?.phone_detected ? 'DETECTED' : t?.phone_visible ? 'VISIBLE' : t?.ai.phone_model ? 'NOT DETECTED' : 'N/A'

  const offline = connection === 'closed' || (t !== null && !cameraConnected)

  return (
    <Panel
      title="Live Driver Camera"
      icon={<Cctv size={14} />}
      right={
        <>
          <span className="font-mono text-[11px] text-ink-3 tabular">FPS {t ? t.camera.fps.toFixed(0) : '--'}</span>
          <span className="flex items-center gap-1.5">
            <StatusDot tone={cameraConnected ? 'crit' : 'muted'} pulse={cameraConnected} />
            <span className={`text-[10.5px] font-bold tracking-[0.16em] ${cameraConnected ? 'text-crit' : 'text-ink-3'}`}>LIVE</span>
          </span>
        </>
      }
      bodyClassName="p-3"
    >
      <div className="relative w-full overflow-hidden rounded-[10px] bg-black" style={{ aspectRatio: aspect }}>
        <img
          key={src}
          src={src}
          alt="Live driver camera"
          className="absolute inset-0 h-full w-full object-cover"
          onError={retry}
          draggable={false}
        />

        {aiActive && <DetectionOverlay />}

        {/* subtle vignette so HUD text stays readable */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.45))]" />

        {/* top-left AI chip */}
        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-md border border-white/10 bg-black/55 px-2.5 py-1.5 backdrop-blur-sm">
          <StatusDot tone={aiActive ? 'ok' : aiStatus === 'STARTING' ? 'info' : 'crit'} size={6} />
          <span className="text-[10px] font-semibold tracking-[0.14em] text-white/80">
            AI {aiStatus ?? '—'}
          </span>
          {t && aiActive && (
            <span className="font-mono text-[10px] text-white/45 tabular">
              {t.ai.fps.toFixed(0)} fps · {t.ai.inference_ms.toFixed(0)} ms
            </span>
          )}
        </div>

        {/* top-right driver state */}
        {t && aiActive && (
          <motion.div
            key={t.driver_status}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`absolute right-3 top-3 rounded-md border px-2.5 py-1.5 text-[10px] font-bold tracking-[0.14em] backdrop-blur-sm ${toneSoft[driverTone(t.driver_status)]}`}
          >
            DRIVER {t.driver_status}
          </motion.div>
        )}

        {/* bottom-left readout */}
        {t && aiActive && (
          <div className="absolute bottom-3 left-3 w-44 space-y-1 rounded-md border border-white/10 bg-black/55 px-3 py-2 backdrop-blur-sm">
            <HudRow label="EYES" value={eyes} tone={eyes === 'CLOSED' ? 'warn' : eyes === 'OPEN' ? 'ok' : 'muted'} />
            <HudRow label="HEAD" value={head} tone={head === 'CENTER' ? 'ok' : head === 'UNKNOWN' ? 'muted' : 'warn'} />
            <HudRow
              label="PHONE"
              value={phone}
              tone={phone === 'DETECTED' ? 'crit' : phone === 'VISIBLE' ? 'warn' : phone === 'N/A' ? 'muted' : 'ok'}
            />
          </div>
        )}

        {/* no face */}
        <AnimatePresence>
          {t && aiActive && cameraConnected && !faceDetected && t.ai.face_model && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-3 right-3 flex items-center gap-2 rounded-md border border-info/30 bg-black/60 px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.14em] text-info backdrop-blur-sm"
            >
              <UserX size={12} /> NO FACE DETECTED
            </motion.div>
          )}
        </AnimatePresence>

        {/* camera offline */}
        <AnimatePresence>
          {offline && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 grid place-items-center bg-base/85 backdrop-blur-sm"
            >
              <div className="text-center">
                <CameraOff className="mx-auto mb-3 text-crit" size={28} strokeWidth={1.5} />
                <p className="text-sm font-semibold tracking-[0.2em] text-crit">
                  {connection === 'closed' ? 'BACKEND UNREACHABLE' : 'CAMERA DISCONNECTED'}
                </p>
                <p className="mt-1 text-xs tracking-[0.18em] text-ink-3">AI SYSTEM PAUSED · RETRYING</p>
                {t?.camera.error && connection !== 'closed' && (
                  <p className="mt-3 font-mono text-[11px] text-ink-3">{t.camera.error}</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Panel>
  )
}
