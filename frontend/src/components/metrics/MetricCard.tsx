import type { ReactNode } from 'react'

interface MetricCardProps {
  icon: ReactNode
  title: string
  children: ReactNode
  /** Subtle pulsing border when the metric is in an alert state. */
  alert?: 'warn' | 'crit' | null
}

export function MetricCard({ icon, title, children, alert = null }: MetricCardProps) {
  return (
    <div
      className={`card flex h-full min-h-[128px] flex-col px-4 py-3 transition-colors duration-300 ${
        alert === 'crit' ? '!border-crit/60' : alert === 'warn' ? '!border-warn/50' : ''
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 text-brand">{icon}</span>
        <h3 className="card-title leading-snug">{title}</h3>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center pt-1.5">{children}</div>
    </div>
  )
}
