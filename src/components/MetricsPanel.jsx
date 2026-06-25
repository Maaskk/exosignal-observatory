import { Activity, Crosshair, Gauge, Orbit, Radar, Waves } from 'lucide-react'

const metricCards = [
  ['period_estimate', 'Period', 'days/index', Orbit],
  ['depth_estimate', 'Depth', 'relative flux', Waves],
  ['duration_estimate', 'Duration', 'time units', Crosshair],
  ['snr_estimate', 'SNR', 'signal/noise', Gauge],
  ['dip_count', 'Dips', 'detected', Radar],
  ['variability', 'Noise', 'delta std', Activity]
]

function formatValue(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  const n = Number(value)
  if (Math.abs(n) >= 100) return n.toFixed(0)
  if (Math.abs(n) >= 10) return n.toFixed(2)
  if (Math.abs(n) >= 1) return n.toFixed(3)
  return n.toFixed(5)
}

export default function MetricsPanel({ features, prediction }) {
  return (
    <section className="metrics-grid" aria-label="Extracted transit features">
      {metricCards.map(([key, label, unit, Icon]) => (
        <article className="metric-tile" key={key}>
          <Icon size={18} />
          <span>{label}</span>
          <strong>{formatValue(features?.[key])}</strong>
          <small>{unit}</small>
        </article>
      ))}
      <article className="candidate-tile">
        <span>Candidate probability</span>
        <strong>{prediction ? `${Math.round(prediction.candidate_probability * 100)}%` : '—'}</strong>
        <small>{prediction?.source || 'waiting for analysis'}</small>
      </article>
    </section>
  )
}

