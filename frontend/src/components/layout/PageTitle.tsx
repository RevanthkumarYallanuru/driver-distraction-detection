import { Gauge } from 'lucide-react'
import { useEffect, useState } from 'react'

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

export function PageTitle() {
  const now = useClock()
  const date = `${now.toLocaleDateString('en-US', { weekday: 'short' })}, ${now.getDate()} ${now.toLocaleDateString('en-US', { month: 'short' })} ${now.getFullYear()}`
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3.5">
        <div className="hidden size-11 place-items-center rounded-xl border border-edge bg-panel-2 text-ink-2 sm:grid">
          <Gauge size={22} />
        </div>
        <div>
          <h1 className="font-display text-[22px] font-bold leading-tight tracking-tight text-ink sm:text-[26px]">
            Automotive <span className="text-brand">Cockpit Analytics</span>
          </h1>
          <p className="text-[12.5px] text-ink-2 sm:text-[13px]">AI-Based Real-Time Driver Distraction Detection and Response System</p>
        </div>
      </div>
      <div className="flex items-baseline gap-3 tabular">
        <span className="text-[12.5px] text-ink-2">{date}</span>
        <span className="font-display text-[18px] font-semibold text-ink">{time}</span>
      </div>
    </div>
  )
}
