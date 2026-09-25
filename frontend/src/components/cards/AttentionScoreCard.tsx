import { motion, useTransform } from 'framer-motion'
import { selectAttention, useAnimatedValue } from '../../hooks/useAnimatedValue'
import { useDashboard } from '../../hooks/useDashboard'
import { attentionTone, toneText, toneVar } from '../../lib/tone'

const R = 62
const CIRC = 2 * Math.PI * R

/** Ring gauge: 0-100 driver attention score computed by the backend. */
export function AttentionScoreCard() {
  const attention = useDashboard((s) => s.telemetry?.attention)
  const score = attention?.score ?? null
  const tone = attentionTone(score)

  const value = useAnimatedValue(selectAttention, { stiffness: 90, damping: 22, mass: 0.7 })
  const offset = useTransform(value, (v) => CIRC * (1 - Math.max(0, Math.min(100, v)) / 100))
  const shown = useTransform(value, (v) => Math.round(v).toString())

  return (
    <div className="card flex h-full min-h-[240px] flex-col items-center px-4 pb-4 pt-3.5">
      <h2 className="card-title self-center">Driver Attention Score</h2>

      <div className="relative my-auto grid place-items-center py-2">
        <svg viewBox="0 0 160 160" className="size-[148px] -rotate-90" aria-hidden>
          <defs>
            <linearGradient id="attn-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={toneVar[tone]} />
              <stop offset="1" stopColor="var(--color-brand-2)" stopOpacity={tone === 'ok' ? 0.9 : 1} />
            </linearGradient>
          </defs>
          <circle cx="80" cy="80" r={R} fill="none" stroke="var(--color-edge)" strokeWidth="11" />
          {score !== null && (
            <motion.circle
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke={tone === 'ok' ? 'url(#attn-grad)' : toneVar[tone]}
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              style={{ strokeDashoffset: offset }}
            />
          )}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            {score === null ? (
              <span className="font-display text-[38px] font-bold text-ink-3">--</span>
            ) : (
              <motion.span className="font-display text-[42px] font-bold leading-none text-ink tabular">{shown}</motion.span>
            )}
            <div className="mt-1 text-[12.5px] text-ink-2">/ 100</div>
          </div>
        </div>
      </div>

      <motion.p
        key={attention?.label}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className={`font-display text-[15px] font-bold tracking-wide ${toneText[tone]}`}
      >
        {attention?.label ?? 'NO DATA'}
      </motion.p>
      <p className="mt-0.5 text-center text-[12.5px] text-ink-2">{attention?.message ?? 'Waiting for telemetry'}</p>
    </div>
  )
}
