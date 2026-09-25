import type { ReactNode } from 'react'

interface PanelProps {
  title: string
  icon?: ReactNode
  right?: ReactNode
  className?: string
  bodyClassName?: string
  children: ReactNode
}

export function Panel({ title, icon, right, className = '', bodyClassName = '', children }: PanelProps) {
  return (
    <section className={`panel flex min-w-0 flex-col ${className}`}>
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-edge px-4">
        <div className="flex min-w-0 items-center gap-2">
          {icon && <span className="text-ink-3">{icon}</span>}
          <h2 className="label truncate !text-ink-2">{title}</h2>
        </div>
        {right && <div className="flex shrink-0 items-center gap-3">{right}</div>}
      </header>
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  )
}
