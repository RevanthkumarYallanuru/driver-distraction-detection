import { toneBg, toneText, type Tone } from '../../lib/tone'

export function StatusDot({ tone, pulse = false, size = 7 }: { tone: Tone; pulse?: boolean; size?: number }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${toneBg[tone]} ${toneText[tone]} ${pulse ? 'dot-pulse' : ''}`}
      style={{ width: size, height: size }}
      aria-hidden
    />
  )
}
