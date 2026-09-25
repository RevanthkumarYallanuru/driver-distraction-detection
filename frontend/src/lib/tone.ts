import type { AlertLevel, DriverStatus, VehicleStatus } from '../types/telemetry'

export type Tone = 'ok' | 'warn' | 'crit' | 'info' | 'muted'

export const toneText: Record<Tone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  crit: 'text-crit',
  info: 'text-info',
  muted: 'text-ink-3',
}

export const toneBg: Record<Tone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  crit: 'bg-crit',
  info: 'bg-info',
  muted: 'bg-ink-3',
}

export const toneSoft: Record<Tone, string> = {
  ok: 'bg-ok/10 text-ok border-ok/25',
  warn: 'bg-warn/10 text-warn border-warn/30',
  crit: 'bg-crit/10 text-crit border-crit/35',
  info: 'bg-info/10 text-info border-info/25',
  muted: 'bg-ink-3/10 text-ink-2 border-edge',
}

/** CSS colour values (theme-aware) for SVG fills and strokes. */
export const toneVar: Record<Tone, string> = {
  ok: 'var(--color-ok)',
  warn: 'var(--color-warn)',
  crit: 'var(--color-crit)',
  info: 'var(--color-info)',
  muted: 'var(--color-ink-3)',
}

export function levelTone(level: AlertLevel | undefined): Tone {
  switch (level) {
    case 'CRITICAL':
      return 'crit'
    case 'WARNING':
      return 'warn'
    case 'INFO':
      return 'info'
    case 'NORMAL':
      return 'ok'
    default:
      return 'muted'
  }
}

export function driverTone(status: DriverStatus | undefined): Tone {
  switch (status) {
    case 'NORMAL':
      return 'ok'
    case 'DISTRACTED':
    case 'DROWSY':
      return 'warn'
    case 'CRITICAL':
      return 'crit'
    case 'NO FACE':
      return 'info'
    default:
      return 'muted'
  }
}

export function vehicleTone(status: VehicleStatus | undefined): Tone {
  switch (status) {
    case 'MOVING':
      return 'ok'
    case 'ACCELERATING':
      return 'info'
    case 'SLOWING':
    case 'SLOWED':
    case 'HORNED':
    case 'WARNING':
      return 'warn'
    case 'STOPPING':
    case 'STOPPED':
      return 'crit'
    default:
      return 'muted'
  }
}

export function attentionTone(score: number | null | undefined): Tone {
  if (score === null || score === undefined) return 'muted'
  if (score >= 75) return 'ok'
  if (score >= 50) return 'info'
  if (score >= 25) return 'warn'
  return 'crit'
}

export function severityTone(label: string | undefined): Tone {
  switch (label) {
    case 'Low':
      return 'ok'
    case 'Moderate':
      return 'info'
    case 'High':
      return 'warn'
    case 'Critical':
      return 'crit'
    default:
      return 'muted'
  }
}

/** "12° Right" — yaw > 0 is the driver's left. */
export function yawText(yaw: number | null | undefined): string {
  if (yaw === null || yaw === undefined) return '—'
  const deg = Math.round(Math.abs(yaw))
  if (deg === 0) return '0° Center'
  return `${deg}° ${yaw > 0 ? 'Left' : 'Right'}`
}

/** "3° Down" — pitch > 0 is looking down. */
export function pitchText(pitch: number | null | undefined): string {
  if (pitch === null || pitch === undefined) return '—'
  const deg = Math.round(Math.abs(pitch))
  if (deg === 0) return '0° Level'
  return `${deg}° ${pitch > 0 ? 'Down' : 'Up'}`
}

export function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/([ -])/)
    .map((w) => (w.length > 1 ? w[0].toUpperCase() + w.slice(1) : w))
    .join('')
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}
