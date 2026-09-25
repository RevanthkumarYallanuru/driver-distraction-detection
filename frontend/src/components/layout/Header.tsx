import { ScanEye } from 'lucide-react'
import { useDashboard } from '../../hooks/useDashboard'
import type { Tone } from '../../lib/tone'
import { toneText } from '../../lib/tone'
import { StatusDot } from '../ui/StatusDot'

function Indicator({ tone, label, pulse }: { tone: Tone; label: string; pulse?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-edge bg-white/[0.02] px-3 py-1.5">
      <StatusDot tone={tone} pulse={pulse} />
      <span className={`text-[10.5px] font-semibold tracking-[0.12em] ${toneText[tone]}`}>{label}</span>
    </div>
  )
}

export function Header() {
  const connection = useDashboard((s) => s.connection)
  const system = useDashboard((s) => s.telemetry?.system_status)
  const cameraConnected = useDashboard((s) => s.telemetry?.camera.connected)
  const ai = useDashboard((s) => s.telemetry?.ai.status)

  const live = connection === 'open'
  const known = live && system !== undefined

  const systemIndicator: [Tone, string] = !known
    ? ['muted', 'SYSTEM OFFLINE']
    : system === 'ACTIVE'
      ? ['ok', 'SYSTEM ACTIVE']
      : system === 'STARTING'
        ? ['info', 'SYSTEM STARTING']
        : system === 'DEGRADED'
          ? ['warn', 'SYSTEM DEGRADED']
          : ['crit', 'SYSTEM PAUSED']

  const cameraIndicator: [Tone, string] = !known
    ? ['muted', 'CAMERA —']
    : cameraConnected
      ? ['ok', 'CAMERA CONNECTED']
      : ['crit', 'CAMERA DISCONNECTED']

  const aiIndicator: [Tone, string] = !known
    ? ['muted', 'AI —']
    : ai === 'ONLINE'
      ? ['ok', 'AI ONLINE']
      : ai === 'STARTING'
        ? ['info', 'AI LOADING']
        : ai === 'DEGRADED'
          ? ['warn', 'AI DEGRADED']
          : ['crit', `AI ${ai}`]

  const linkIndicator: [Tone, string] =
    connection === 'open'
      ? ['ok', 'LIVE']
      : connection === 'stale'
        ? ['warn', 'LINK STALE']
        : connection === 'connecting'
          ? ['info', 'CONNECTING']
          : ['crit', 'LINK LOST']

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-xl border border-info/25 bg-info/10 text-info">
          <ScanEye size={18} strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-[15px] font-semibold tracking-[0.18em] text-ink">AI DRIVER MONITORING SYSTEM</h1>
          <p className="text-[11px] tracking-wide text-ink-3">
            Real-time distraction detection · Simulated vehicle response · v2
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Indicator tone={systemIndicator[0]} label={systemIndicator[1]} pulse={systemIndicator[0] === 'ok'} />
        <Indicator tone={cameraIndicator[0]} label={cameraIndicator[1]} />
        <Indicator tone={aiIndicator[0]} label={aiIndicator[1]} />
        <Indicator tone={linkIndicator[0]} label={linkIndicator[1]} pulse={linkIndicator[0] === 'ok'} />
      </div>
    </header>
  )
}
