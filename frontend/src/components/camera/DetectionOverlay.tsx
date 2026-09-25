import { AnimatePresence, motion } from 'framer-motion'
import { memo } from 'react'
import { useDashboard } from '../../hooks/useDashboard'
import { attentionTone, toneVar } from '../../lib/tone'

/**
 * SVG overlay in frame pixel space on top of the MJPEG image
 * (same `slice` fit as the image's object-cover). Draws the face box,
 * eye landmarks, iris centres and phone boxes reported by the backend.
 */
export const DetectionOverlay = memo(function DetectionOverlay() {
  const overlay = useDashboard((s) => s.telemetry?.overlay)
  const score = useDashboard((s) => s.telemetry?.attention.score)
  const eyesClosed = useDashboard((s) => s.telemetry?.eyes_state === 'CLOSED')

  if (!overlay || !overlay.frame_width) return null

  const W = overlay.frame_width
  const H = overlay.frame_height
  const color = toneVar[attentionTone(score)]
  const eyeColor = eyesClosed ? toneVar.warn : toneVar.info

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
      {overlay.face_box && (
        <rect
          x={overlay.face_box[0] * W}
          y={overlay.face_box[1] * H}
          width={(overlay.face_box[2] - overlay.face_box[0]) * W}
          height={(overlay.face_box[3] - overlay.face_box[1]) * H}
          fill="none"
          stroke={color}
          strokeWidth={2}
          rx={2}
          style={{ transition: 'x 90ms linear, y 90ms linear, width 90ms linear, height 90ms linear, stroke 300ms' }}
        />
      )}

      {overlay.eye_points.map(([x, y], i) => (
        <circle key={i} cx={x * W} cy={y * H} r={1.6} fill={eyeColor} opacity={0.85} />
      ))}
      {overlay.iris_points.map(([x, y], i) => (
        <circle key={`iris${i}`} cx={x * W} cy={y * H} r={3} fill="none" stroke={toneVar.info} strokeWidth={1.2} />
      ))}

      <AnimatePresence>
        {overlay.phone_boxes.map((box, i) => {
          const x = box.x1 * W, y = box.y1 * H
          const w = (box.x2 - box.x1) * W, h = (box.y2 - box.y1) * H
          const label = `PHONE ${Math.round(box.confidence * 100)}%`
          return (
            <motion.g
              key={`phone-${i}`}
              initial={{ opacity: 0, scale: 1.08 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ transformOrigin: `${x + w / 2}px ${y + h / 2}px` }}
            >
              <rect x={x} y={y} width={w} height={h} rx={3} fill={toneVar.crit} fillOpacity={0.08} stroke={toneVar.crit} strokeWidth={2} />
              <rect x={x} y={y - 20} width={label.length * 7.4 + 10} height={18} rx={3} fill={toneVar.crit} />
              <text x={x + 5} y={y - 7} fill="#fff" fontSize={11} fontWeight={700} fontFamily="JetBrains Mono, monospace">
                {label}
              </text>
            </motion.g>
          )
        })}
      </AnimatePresence>
    </svg>
  )
})
