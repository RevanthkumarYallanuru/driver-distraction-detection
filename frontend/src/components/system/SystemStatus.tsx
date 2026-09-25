import { Camera, Clock3, Cpu, Database, Settings2, Volume2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useDashboard } from '../../hooks/useDashboard'
import { toneText, type Tone } from '../../lib/tone'
import { StatusDot } from '../ui/StatusDot'

function Row({ icon, label, value, tone, detail }: { icon: ReactNode; label: string; value: string; tone: Tone; detail?: string }) {
  return (
    <li className="flex items-center gap-3 py-[7px]">
      <span className="text-ink-2">{icon}</span>
      <span className="text-[13px] text-ink">{label}</span>
      {detail && <span className="hidden truncate font-mono text-[10.5px] text-ink-3 md:inline">{detail}</span>}
      <span className="ml-auto flex w-[118px] shrink-0 items-center gap-2">
        <StatusDot tone={tone} size={9} pulse={tone === 'ok' && value === 'Recording'} />
        <span className={`text-[13px] font-medium ${toneText[tone]}`}>{value}</span>
      </span>
    </li>
  )
}

export function SystemStatus() {
  const connection = useDashboard((s) => s.connection)
  const t = useDashboard((s) => s.telemetry)
  const live = connection === 'open' && t !== null

  const ai: [string, Tone] = !live
    ? ['Offline', 'crit']
    : t.ai.status === 'ONLINE'
      ? ['Online', 'ok']
      : t.ai.status === 'STARTING'
        ? ['Loading', 'info']
        : t.ai.status === 'DEGRADED'
          ? ['Degraded', 'warn']
          : [t.ai.status === 'PAUSED' ? 'Paused' : 'Offline', 'crit']

  const camera: [string, Tone] = !live ? ['Unknown', 'muted'] : t.camera.connected ? ['Connected', 'ok'] : ['Disconnected', 'crit']

  const processing: [string, Tone] = !live
    ? ['Stopped', 'crit']
    : t.system_status === 'ACTIVE' || t.system_status === 'DEGRADED'
      ? ['Active', 'ok']
      : t.system_status === 'STARTING'
        ? ['Starting', 'info']
        : ['Paused', 'warn']

  const logging: [string, Tone] = !live
    ? ['Unknown', 'muted']
    : t.logging.recording
      ? ['Recording', 'ok']
      : t.logging.enabled
        ? ['Error', 'crit']
        : ['Off', 'muted']

  const voice: [string, Tone] = !live ? ['Unknown', 'muted'] : !t.voice.enabled ? ['Off', 'muted'] : t.voice.speaking ? ['Speaking', 'info'] : ['Ready', 'ok']

  return (
    <div className="card flex h-full min-h-[200px] flex-col px-4 pb-2 pt-3.5">
      <div className="flex items-center gap-2.5 pb-1">
        <Settings2 size={18} className="text-brand" />
        <h2 className="card-title">System Status</h2>
      </div>
      <ul className="divide-y divide-edge/50">
        <Row icon={<Cpu size={17} />} label="AI Model" value={ai[0]} tone={ai[1]} detail={live ? `MediaPipe + YOLO11n` : undefined} />
        <Row icon={<Camera size={17} />} label="Camera" value={camera[0]} tone={camera[1]} />
        <Row
          icon={<Clock3 size={17} />}
          label="Real-time Processing"
          value={processing[0]}
          tone={processing[1]}
          detail={live && t.ai.fps ? `${t.ai.fps.toFixed(0)} fps · ${t.ai.inference_ms.toFixed(0)} ms` : undefined}
        />
        <Row
          icon={<Database size={17} />}
          label="Data Logging"
          value={logging[0]}
          tone={logging[1]}
          detail={live && t.logging.file ? `${t.logging.records} records` : undefined}
        />
        <Row icon={<Volume2 size={17} />} label="Voice Assistant" value={voice[0]} tone={voice[1]} />
      </ul>
    </div>
  )
}
