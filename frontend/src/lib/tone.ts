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
  muted: 'bg-white/[0.03] text-ink-2 border-edge',
}

export const toneHex: Record<Tone, string> = {
  ok: '#34d399',
  warn: '#fbbf24',
  crit: '#f87171',
  info: '#38bdf8',
  muted: '#5d6a7c',
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

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}
