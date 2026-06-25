function pointsFor(curve, width, height) {
  if (!curve || curve.length === 0) return ''
  const xs = curve.map((d) => d.time)
  const ys = curve.map((d) => d.flux)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const pad = Math.max((maxY - minY) * 0.12, 0.001)
  return curve
    .map((d) => {
      const x = ((d.time - minX) / Math.max(maxX - minX, 1e-9)) * width
      const y = height - ((d.flux - minY + pad) / Math.max(maxY - minY + pad * 2, 1e-9)) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

export default function LightCurveChart({ rawCurve, cleanedCurve, dips }) {
  const width = 920
  const height = 280
  const source = cleanedCurve?.length ? cleanedCurve : rawCurve || []
  const xs = source.map((d) => d.time)
  const ys = source.map((d) => d.flux)
  const minX = xs.length ? Math.min(...xs) : 0
  const maxX = xs.length ? Math.max(...xs) : 1
  const minY = ys.length ? Math.min(...ys) : 0
  const maxY = ys.length ? Math.max(...ys) : 1
  const pad = Math.max((maxY - minY) * 0.12, 0.001)

  const dipMarkers = (dips || []).slice(0, 8).map((dip) => {
    const x = ((dip.time - minX) / Math.max(maxX - minX, 1e-9)) * width
    const y = height - ((dip.flux - minY + pad) / Math.max(maxY - minY + pad * 2, 1e-9)) * height
    return { x, y, ...dip }
  })

  return (
    <div className="chart-shell">
      <div className="chart-header">
        <div>
          <span className="eyebrow">Light Curve</span>
          <h3>Brightness signal and detected transit-like dips</h3>
        </div>
        <div className="legend">
          <span><i className="raw-line" />raw</span>
          <span><i className="clean-line" />cleaned</span>
          <span><i className="dip-dot" />dip</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="light-curve" role="img" aria-label="Light curve chart">
        <defs>
          <linearGradient id="curveGlow" x1="0%" x2="100%">
            <stop offset="0%" stopColor="#72e4ff" />
            <stop offset="55%" stopColor="#8df7c9" />
            <stop offset="100%" stopColor="#ffcf70" />
          </linearGradient>
        </defs>
        {[0.2, 0.4, 0.6, 0.8].map((y) => (
          <line key={y} x1="0" x2={width} y1={height * y} y2={height * y} className="grid-line" />
        ))}
        <polyline points={pointsFor(rawCurve || [], width, height)} className="raw-path" />
        <polyline points={pointsFor(cleanedCurve || [], width, height)} className="clean-path" />
        {dipMarkers.map((dip) => (
          <g key={`${dip.time}-${dip.index}`}>
            <line x1={dip.x} x2={dip.x} y1="12" y2={height - 12} className="dip-line" />
            <circle cx={dip.x} cy={dip.y} r="5.5" className="dip-marker" />
          </g>
        ))}
      </svg>
    </div>
  )
}

