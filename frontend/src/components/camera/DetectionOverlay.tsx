import { AnimatePresence, motion } from 'framer-motion'
import { memo } from 'react'
import { useDashboard } from '../../hooks/useDashboard'
import { driverTone, toneHex } from '../../lib/tone'

const BRACKET = 0.22 // fraction of box side used by each corner bracket

/**
 * SVG overlay drawn in frame pixel space on top of the MJPEG image.
 * Kept deliberately light: corner brackets instead of a full face box,
 * tiny eye landmarks, and phone boxes only when YOLO sees a phone.
 */
export const DetectionOverlay = memo(function DetectionOverlay() {
  const overlay = useDashboard((s) => s.telemetry?.overlay)
  const driverStatus = useDashboard((s) => s.telemetry?.driver_status)
  const eyesClosed = useDashboard((s) => s.telemetry?.eyes_state === 'CLOSED')

  if (!overlay || !overlay.frame_width) return null

  const W = overlay.frame_width
  const H = overlay.frame_height
  const color = toneHex[driverTone(driverStatus)]
  const eyeColor = eyesClosed ? toneHex.warn : toneHex.info

  let brackets: string | null = null
  if (overlay.face_box) {
    const [x1, y1, x2, y2] = overlay.face_box
    const l = x1 * W, t = y1 * H, r = x2 * W, b = y2 * H
    const dx = (r - l) * BRACKET, dy = (b - t) * BRACKET
    brackets = [
      `M${l},${t + dy} V${t} H${l + dx}`,
      `M${r - dx},${t} H${r} V${t + dy}`,
      `M${r},${b - dy} V${b} H${r - dx}`,
      `M${l + dx},${b} H${l} V${b - dy}`,
    ].join(' ')
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
    >
      {brackets && (
        <path
          d={brackets}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.85}
          style={{ transition: 'd 90ms linear, stroke 300ms' }}
        />
      )}

      {overlay.eye_points.map(([x, y], i) => (
        <circle key={i} cx={x * W} cy={y * H} r={1.8} fill={eyeColor} opacity={0.9} />
      ))}

      {overlay.pose_points.map(([x, y], i) => (
        <circle key={`p${i}`} cx={x * W} cy={y * H} r={2.4} fill="none" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={1} />
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
              <rect x={x} y={y} width={w} height={h} rx={4} fill={toneHex.crit} fillOpacity={0.08} stroke={toneHex.crit} strokeWidth={2} />
              <rect x={x} y={y - 20} width={label.length * 7.4 + 10} height={18} rx={3} fill={toneHex.crit} />
              <text x={x + 5} y={y - 7} fill="#1a0707" fontSize={11} fontWeight={700} fontFamily="JetBrains Mono, monospace">
                {label}
              </text>
            </motion.g>
          )
        })}
      </AnimatePresence>
    </svg>
  )
})
