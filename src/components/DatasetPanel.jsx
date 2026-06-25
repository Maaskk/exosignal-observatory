import { Database, Download, FlaskConical, ShieldAlert } from 'lucide-react'

function MiniBar({ label, value, total }) {
  const pct = total ? (value / total) * 100 : 0
  return (
    <div className="mini-bar">
      <span>{label}</span>
      <div><i style={{ width: `${Math.max(3, pct)}%` }} /></div>
      <strong>{value.toLocaleString()}</strong>
    </div>
  )
}

function formatStat(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (Math.abs(value) >= 10) return value.toFixed(1)
  return value.toFixed(3)
}

export default function DatasetPanel({ dataset, model, onTrain }) {
  const metrics = model?.metrics
  const eda = dataset?.eda
  const classTotal = eda?.class_distribution
    ? Object.values(eda.class_distribution).reduce((sum, value) => sum + Number(value), 0)
    : 0
  const missionTotal = eda?.mission_distribution
    ? Object.values(eda.mission_distribution).reduce((sum, value) => sum + Number(value), 0)
    : 0
  return (
    <section className="data-model-grid">
      <article className="panel">
        <div className="panel-title">
          <Database size={20} />
          <h3>Large Real Dataset</h3>
        </div>
        <p>
          Hugging Face multi-mission dataset with Kepler, K2, and TESS light curves, labels from NASA Exoplanet Archive,
          and MAST provenance.
        </p>
        <div className="file-grid">
          {dataset?.files &&
            Object.entries(dataset.files).map(([name, info]) => (
              <div key={name} className={info.exists ? 'file-chip ready' : 'file-chip'}>
                <span>{name}</span>
                <strong>{info.exists ? `${info.size_mb} MB` : 'missing'}</strong>
              </div>
            ))}
        </div>
        <div className="command-note">
          <Download size={15} />
          <code>npm run download:data:full</code>
        </div>
      </article>

      <article className="panel eda-panel">
        <div className="panel-title">
          <Database size={20} />
          <h3>EDA Snapshot</h3>
        </div>
        <p>{eda ? `${eda.row_count.toLocaleString()} labeled light-curve examples with class, mission, and transit metadata.` : 'Metadata EDA appears after download.'}</p>
        {eda && (
          <>
            <div className="eda-group">
              <strong>Class balance</strong>
              {Object.entries(eda.class_distribution).map(([label, value]) => (
                <MiniBar key={label} label={label} value={Number(value)} total={classTotal} />
              ))}
            </div>
            <div className="eda-group">
              <strong>Mission mix</strong>
              {Object.entries(eda.mission_distribution).map(([label, value]) => (
                <MiniBar key={label} label={label} value={Number(value)} total={missionTotal} />
              ))}
            </div>
            <div className="stat-strip">
              <span>Median period <b>{formatStat(eda.numeric_ranges?.period_days?.median)} d</b></span>
              <span>Median depth <b>{formatStat(eda.numeric_ranges?.depth_ppm?.median)} ppm</b></span>
            </div>
          </>
        )}
      </article>

      <article className="panel">
        <div className="panel-title">
          <FlaskConical size={20} />
          <h3>Baseline ML Model</h3>
        </div>
        {metrics ? (
          <>
            <p>{metrics.model_name} trained on {metrics.rows_used.toLocaleString()} rows and {metrics.features} engineered features.</p>
            <div className="score-grid">
              <span>Precision <strong>{metrics.precision.toFixed(3)}</strong></span>
              <span>Recall <strong>{metrics.recall.toFixed(3)}</strong></span>
              <span>F1 <strong>{metrics.f1.toFixed(3)}</strong></span>
              <span>ROC-AUC <strong>{metrics.roc_auc.toFixed(3)}</strong></span>
              <span>PR-AUC <strong>{metrics.pr_auc.toFixed(3)}</strong></span>
            </div>
          </>
        ) : (
          <p>No trained artifact yet. The app can still analyze curves with transparent feature heuristics until training finishes.</p>
        )}
        <button className="secondary-action" type="button" onClick={onTrain}>
          Start demo training
        </button>
      </article>

      <article className="panel caution-panel">
        <div className="panel-title">
          <ShieldAlert size={20} />
          <h3>Scientific Caution</h3>
        </div>
        <p>
          This system detects and prioritizes candidate transit signals. It does not officially confirm an exoplanet.
          Confirmation requires deeper vetting and follow-up observations.
        </p>
      </article>
    </section>
  )
}
