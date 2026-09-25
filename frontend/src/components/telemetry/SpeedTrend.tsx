import { Activity } from 'lucide-react'
import { memo } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDashboard } from '../../hooks/useDashboard'
import { Panel } from '../ui/Panel'

const SPEED = '#38bdf8'
const TARGET = '#5d6a7c'

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: { t: number; speed: number; target: number } }[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-md border border-edge-strong bg-panel-2 px-2.5 py-1.5 text-[11px] shadow-lg">
      <div className="mb-1 font-mono text-ink-3">{new Date(p.t).toLocaleTimeString([], { hour12: false })}</div>
      <div className="flex items-center gap-2 text-ink">
        <span className="h-0.5 w-3 rounded" style={{ background: SPEED }} /> Speed
        <span className="ml-auto font-mono tabular">{p.speed.toFixed(1)}</span>
      </div>
      <div className="flex items-center gap-2 text-ink-2">
        <span className="h-0 w-3 border-t border-dashed" style={{ borderColor: TARGET }} /> Target
        <span className="ml-auto font-mono tabular">{p.target.toFixed(0)}</span>
      </div>
    </div>
  )
}

/** Last 60 s of simulated speed vs target (sampled at 2 Hz by the store). */
export const SpeedTrend = memo(function SpeedTrend() {
  const history = useDashboard((s) => s.speedHistory)
  const max = useDashboard((s) => s.telemetry?.normal_speed ?? 60)

  return (
    <Panel
      title="Speed Trend · 60 s"
      icon={<Activity size={14} />}
      right={
        <div className="flex items-center gap-3 text-[10.5px] text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded" style={{ background: SPEED }} /> Speed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 border-t border-dashed" style={{ borderColor: TARGET }} /> Target
          </span>
        </div>
      }
      bodyClassName="p-3 pr-4"
    >
      <div className="h-[168px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history} margin={{ top: 6, right: 4, bottom: 0, left: -18 }}>
            <XAxis dataKey="t" hide />
            <YAxis
              domain={[0, Math.max(70, max + 10)]}
              ticks={[0, 30, 60]}
              tick={{ fill: '#5d6a7c', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: '#2a3544', strokeWidth: 1 }} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="target" stroke={TARGET} strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="speed" stroke={SPEED} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: '#0c1016', strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
})
