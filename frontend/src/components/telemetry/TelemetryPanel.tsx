import { Gauge } from 'lucide-react'
import { useDashboard } from '../../hooks/useDashboard'
import { driverTone, formatTime, levelTone, toneText, vehicleTone, type Tone } from '../../lib/tone'
import { Panel } from '../ui/Panel'
import { StatusDot } from '../ui/StatusDot'

function Cell({ label, value, tone = 'muted', mono = false }: { label: string; value: string; tone?: Tone; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-edge bg-white/[0.015] px-3 py-2">
      <div className="label !text-[9.5px]">{label}</div>
      <div
        className={`mt-0.5 truncate text-[13px] font-semibold ${tone === 'muted' ? 'text-ink' : toneText[tone]} ${mono ? 'font-mono tabular' : 'tracking-[0.06em]'}`}
        title={value}
      >
        {value}
      </div>
    </div>
  )
}

export function TelemetryPanel() {
  const t = useDashboard((s) => s.telemetry)

  if (!t) {
    return (
      <Panel title="Real-time Telemetry" icon={<Gauge size={14} />} bodyClassName="grid place-items-center p-6">
        <span className="text-xs tracking-[0.16em] text-ink-3">WAITING FOR TELEMETRY…</span>
      </Panel>
    )
  }

  const aiTone: Tone = t.ai.status === 'ONLINE' ? 'ok' : t.ai.status === 'DEGRADED' ? 'warn' : t.ai.status === 'STARTING' ? 'info' : 'crit'

  return (
    <Panel
      title="Real-time Telemetry"
      icon={<Gauge size={14} />}
      right={
        <span className="flex items-center gap-1.5 text-[10.5px] text-ink-3">
          <StatusDot tone={t.voice.speaking ? 'info' : 'muted'} pulse={t.voice.speaking} size={6} />
          {t.voice.enabled ? (t.voice.speaking ? 'VOICE SPEAKING' : 'VOICE READY') : 'VOICE OFF'}
        </span>
      }
      bodyClassName="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3"
    >
      <Cell label="Speed" value={`${t.speed.toFixed(1)} km/h`} mono />
      <Cell label="Target" value={`${t.target_speed.toFixed(0)} km/h`} mono />
      <Cell label="Vehicle" value={t.vehicle_status} tone={vehicleTone(t.vehicle_status)} />
      <Cell label="Driver" value={t.driver_status} tone={driverTone(t.driver_status)} />
      <Cell label="Alert level" value={t.alert_level} tone={levelTone(t.alert_level)} />
      <Cell label="EAR" value={t.ear !== null ? t.ear.toFixed(3) : '—'} mono />
      <Cell label="Head" value={t.head_direction} tone={t.head_direction === 'CENTER' ? 'ok' : t.head_direction === 'UNKNOWN' ? 'muted' : 'warn'} />
      <Cell label="Phone conf." value={t.phone_confidence ? `${Math.round(t.phone_confidence * 100)}%` : '—'} mono />
      <Cell label="AI" value={`${t.ai.status} · ${t.ai.inference_ms.toFixed(0)} ms`} tone={aiTone} />
      <Cell label="Camera" value={t.camera.connected ? `${t.camera.fps.toFixed(0)} FPS` : 'OFFLINE'} tone={t.camera.connected ? 'ok' : 'crit'} />
      <Cell
        label="Last alert"
        value={t.last_alert ? `${t.last_alert.title}` : 'NONE'}
        tone={t.last_alert ? 'muted' : 'ok'}
      />
      <Cell label="Alert time" value={t.last_alert ? formatTime(t.last_alert.timestamp) : '—'} mono />
    </Panel>
  )
}
