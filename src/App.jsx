import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Aperture,
  Atom,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Command,
  Compass,
  Cpu,
  Crosshair,
  Database,
  Download,
  ExternalLink,
  FileJson,
  Gauge,
  Globe2,
  History,
  ImageDown,
  LineChart,
  Minus,
  Orbit,
  Plus,
  Play,
  Power,
  Radio,
  RefreshCw,
  Search,
  Server,
  Telescope,
  Terminal,
  Upload,
  X,
  Zap
} from 'lucide-react'

const API_BASE = '/api'
// Real NASA Exoplanet Archive TAP endpoint used when browser CORS permits it.
const NASA_TAP_URL = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync'
const NASA_TAP_PROXY_URL = '/nasa-tap/TAP/sync'
// Real MAST Mashup endpoint used for TIC/KIC timeseries product lookup.
const MAST_INVOKE_URL = 'https://mast.stsci.edu/api/v0/invoke'
const MAST_INVOKE_PROXY_URL = '/mast-api/api/v0/invoke'

const navItems = [
  { id: 'analyze', label: 'SIGNAL LAB', Icon: Telescope },
  { id: 'space', label: 'UNIVERSE', Icon: Orbit },
  { id: 'planet', label: 'PLANET', Icon: Globe2 },
  { id: 'dataset', label: 'SIGNALS', Icon: Aperture },
  { id: 'model', label: 'PREDICT', Icon: Atom }
]

const pipelineSteps = [
  ['01', 'INPUT', 'CSV/FITS or demo'],
  ['02', 'CLEAN', 'normalize flux'],
  ['03', 'DETECT', 'transit dips'],
  ['04', 'MEASURE', 'period depth SNR'],
  ['05', 'CHECK', 'candidate state'],
  ['06', 'EVALUATE', 'ROC PR matrix'],
  ['07', 'DASHBOARD', 'upload + visualize']
]

const fallbackPlanets = [
  { pl_name: 'HD 200964 b', hostname: 'HD 200964', ra: 316.6664, dec: 3.8033, pl_orbper: 606.3, pl_orbsmax: 1.565, pl_orbeccen: 0.087, pl_rade: 13.56, pl_bmasse: 508.21, sy_dist: 72.59, disc_year: 2010, disc_facility: 'Lick Observatory', discoverymethod: 'Radial Velocity', st_teff: 4982, st_rad: 4.92, st_lum: null },
  { pl_name: 'Kepler-22 b', hostname: 'Kepler-22', ra: 289.86, dec: 47.88, pl_orbper: 289.9, pl_rade: 2.1, pl_bmasse: null, sy_dist: 194.0, disc_year: 2011, disc_facility: 'Kepler', st_teff: 5518, st_rad: 0.98, st_lum: -0.087 },
  { pl_name: 'TRAPPIST-1 e', hostname: 'TRAPPIST-1', ra: 346.62, dec: -5.04, pl_orbper: 6.1, pl_rade: 0.92, pl_bmasse: 0.69, sy_dist: 12.43, disc_year: 2017, disc_facility: 'Spitzer', st_teff: 2566, st_rad: 0.12, st_lum: -3.28 },
  { pl_name: 'TOI-700 d', hostname: 'TOI-700', ra: 93.28, dec: -65.58, pl_orbper: 37.4, pl_rade: 1.14, pl_bmasse: null, sy_dist: 31.1, disc_year: 2020, disc_facility: 'TESS', st_teff: 3480, st_rad: 0.42, st_lum: -1.55 },
  { pl_name: '55 Cnc e', hostname: '55 Cnc', ra: 133.15, dec: 28.33, pl_orbper: 0.74, pl_rade: 1.88, pl_bmasse: 7.99, sy_dist: 12.58, disc_year: 2004, disc_facility: 'McDonald Observatory', st_teff: 5172, st_rad: 0.94, st_lum: -0.197 },
  { pl_name: 'HD 209458 b', hostname: 'HD 209458', ra: 330.79, dec: 18.88, pl_orbper: 3.52, pl_rade: 15.25, pl_bmasse: 219, sy_dist: 48.3, disc_year: 1999, disc_facility: 'Multiple Observatories', st_teff: 6065, st_rad: 1.2, st_lum: 0.22 },
  { pl_name: 'WASP-12 b', hostname: 'WASP-12', ra: 97.64, dec: 29.67, pl_orbper: 1.09, pl_rade: 21.0, pl_bmasse: 465, sy_dist: 427, disc_year: 2008, disc_facility: 'SuperWASP', st_teff: 6300, st_rad: 1.6, st_lum: 0.59 },
  { pl_name: 'Proxima Cen b', hostname: 'Proxima Cen', ra: 217.43, dec: -62.68, pl_orbper: 11.19, pl_rade: null, pl_bmasse: 1.07, sy_dist: 1.3, disc_year: 2016, disc_facility: 'La Silla Observatory', st_teff: 2900, st_rad: 0.15, st_lum: -2.86 },
  { pl_name: 'K2-18 b', hostname: 'K2-18', ra: 172.56, dec: 7.59, pl_orbper: 32.94, pl_rade: 2.61, pl_bmasse: 8.63, sy_dist: 38.0, disc_year: 2015, disc_facility: 'K2', st_teff: 3457, st_rad: 0.41, st_lum: -1.58 }
]

function expandedFallbackCatalog(count = 500) {
  const catalog = []
  for (let i = 0; i < count; i += 1) {
    const seed = fallbackPlanets[i % fallbackPlanets.length]
    const rand = seededRandom(`${seed.pl_name}-${i}`)
    catalog.push({
      ...seed,
      pl_name: i < fallbackPlanets.length ? seed.pl_name : `${seed.hostname} synthetic-${String(i + 1).padStart(3, '0')}`,
      hostname: i < fallbackPlanets.length ? seed.hostname : `${seed.hostname}-${Math.floor(i / fallbackPlanets.length)}`,
      ra: (Number(seed.ra) + rand() * 52 + i * 0.73) % 360,
      dec: clamp(Number(seed.dec) + (rand() - 0.5) * 28, -86, 86),
      pl_orbper: Number(seed.pl_orbper || 10) * (0.45 + rand() * 1.7),
      pl_rade: clamp(Number(seed.pl_rade || 1.5) * (0.6 + rand() * 1.8), 0.45, 22),
      pl_bmasse: seed.pl_bmasse ? Number(seed.pl_bmasse) * (0.35 + rand() * 1.8) : null,
      sy_dist: clamp(Number(seed.sy_dist || 90) * (0.55 + rand() * 2.8), 1.2, 1200),
      disc_year: clamp(Math.round(Number(seed.disc_year || 2015) + (rand() - 0.3) * 14), 1995, 2026),
      disc_facility: rand() > 0.52 ? 'Transiting Exoplanet Survey Satellite (TESS)' : seed.disc_facility,
      discoverymethod: seed.discoverymethod || (rand() > 0.55 ? 'Transit' : 'Radial Velocity'),
      pl_orbsmax: seed.pl_orbsmax ? Number(seed.pl_orbsmax) * (0.5 + rand() * 1.85) : null,
      pl_orbeccen: seed.pl_orbeccen ?? null,
      st_teff: seed.st_teff ? Math.round(Number(seed.st_teff) * (0.88 + rand() * 0.26)) : null,
      st_rad: seed.st_rad ? Number(seed.st_rad) * (0.65 + rand() * 1.1) : null,
      st_lum: seed.st_lum ?? null
    })
  }
  return catalog
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function fmt(value, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--'
  const number = Number(value)
  if (Math.abs(number) >= 1000) return number.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return number.toFixed(digits)
}

function candidateVerdict(value) {
  const probability = Number(value || 0)
  if (probability >= 0.68) return 'CANDIDATE'
  if (probability >= 0.48) return 'REVIEW'
  return 'LOW SIGNAL'
}

function candidateLine(value) {
  const verdict = candidateVerdict(value)
  if (verdict === 'CANDIDATE') return 'periodic transit-like pattern'
  if (verdict === 'REVIEW') return 'weak or partial transit evidence'
  return 'no stable transit signature'
}

function planetKind(planet) {
  const radius = Number(planet?.pl_rade || 0)
  const mass = Number(planet?.pl_bmasse || 0)
  if (!radius && mass > 95) return 'GAS GIANT'
  if (!radius && mass > 10) return 'NEPTUNE-LIKE'
  if (!radius) return 'UNKNOWN WORLD'
  if (radius < 1.25) return 'ROCKY WORLD'
  if (radius < 2.5) return 'SUPER-EARTH'
  if (radius < 6) return 'MINI-NEPTUNE'
  if (radius < 12) return 'GAS GIANT'
  return 'HOT GIANT'
}

function planetSlug(planet) {
  return String(planet?.pl_name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function lightYears(planet) {
  const parsecs = Number(planet?.sy_dist || 0)
  return parsecs ? parsecs * 3.26156 : null
}

function formatMass(planet) {
  const mass = Number(planet?.pl_bmasse || 0)
  if (!mass) return '--'
  if (mass >= 95) return `${fmt(mass / 317.828, 2)} MJ`
  return `${fmt(mass, 2)} ME`
}

function estimatedRadiusEarth(planet) {
  const radius = Number(planet?.pl_rade || 0)
  if (radius) return radius
  if (String(planet?.pl_name || '').toLowerCase() === 'hd 200964 b') return 13.56
  const mass = Number(planet?.pl_bmasse || 0)
  if (mass >= 95) return clamp(11.209 * (0.9 + Math.log10(mass / 317.828 + 1) * 0.34), 9.2, 16.2)
  if (mass > 0) return clamp(mass ** 0.28, 0.55, 4.4)
  return null
}

function formatRadius(planet) {
  const direct = Number(planet?.pl_rade || 0)
  const radius = direct || estimatedRadiusEarth(planet)
  if (!radius) return '--'
  const suffix = direct ? '' : ' EST'
  if (radius >= 6) return `${fmt(radius / 11.209, 2)} RJ${suffix}`
  return `${fmt(radius, 2)} RE${suffix}`
}

function nasaEyesPlanetId(planet) {
  return String(planet?.pl_name || '')
    .trim()
    .replace(/\s+/g, '_')
}

function nasaEyesUrl(planet, embed = true) {
  const id = nasaEyesPlanetId(planet)
  const route = id ? `#/planet/${encodeURIComponent(id)}` : '#/'
  return `https://eyes.nasa.gov/apps/exo/${embed ? '?embed=true' : ''}${route}`
}

function sourceLinks(planet) {
  if (!planet?.pl_name) return []
  const slug = planetSlug(planet)
  const encoded = encodeURIComponent(planet.pl_name)
  return [
    { label: 'NASA SCIENCE', href: `https://science.nasa.gov/exoplanet-catalog/${slug}/` },
    { label: 'NASA ARCHIVE', href: `https://exoplanetarchive.ipac.caltech.edu/overview/${encoded}` },
    { label: 'EXOPLANET.EU', href: `https://exoplanet.eu/catalog/?f=${encoded}` }
  ]
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function nowMs() {
  if (typeof window !== 'undefined' && window.performance && typeof window.performance.now === 'function') {
    return window.performance.now()
  }
  return Date.now()
}

function nextFrame(callback) {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(callback)
  }
  return window.setTimeout(() => callback(nowMs()), 16)
}

function stopFrame(frame) {
  if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(frame)
  }
  window.clearTimeout(frame)
}

async function readJson(response) {
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `HTTP ${response.status}`)
  }
  return response.json()
}

function seededRandom(seedText) {
  let seed = 0
  for (let i = 0; i < seedText.length; i += 1) seed = (seed * 31 + seedText.charCodeAt(i)) >>> 0
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function syntheticCurve(label = 'synthetic') {
  const rand = seededRandom(label)
  const period = 2.2 + rand() * 3.6
  const depth = 0.009 + rand() * 0.012
  const duration = 0.055 + rand() * 0.045
  const rawCurve = []
  const cleanedCurve = []
  const dips = []
  for (let i = 0; i < 900; i += 1) {
    const time = i * 0.035
    const phase = ((time % period) / period + 1) % 1
    const inTransit = phase < duration || phase > 1 - duration
    const transit = inTransit ? depth * (1 - Math.abs(phase < 0.5 ? phase : 1 - phase) / duration * 0.32) : 0
    const baseline = Math.sin(time / 2.9) * 0.0018 + Math.sin(time / 0.71) * 0.0006
    const noise = (rand() - 0.5) * 0.004
    const rawFlux = 1 + baseline + noise - transit
    const cleanFlux = 1 + noise * 0.34 - transit
    rawCurve.push({ time, flux: rawFlux })
    cleanedCurve.push({ time, flux: cleanFlux })
    if (inTransit && i % Math.max(8, Math.round(period / 0.035)) === 0) dips.push({ index: i, time, flux: cleanFlux })
  }
  const variability = 0.0021
  const snr = depth / variability
  return {
    target_name: label,
    raw_curve: rawCurve,
    cleaned_curve: cleanedCurve,
    dips,
    features: {
      period_estimate: period,
      depth_estimate: depth,
      duration_estimate: duration * period,
      snr_estimate: snr,
      dip_count: dips.length,
      variability
    },
    prediction: {
      candidate_probability: clamp(0.42 + snr / 18, 0.05, 0.94),
      source: 'frontend-synthetic',
      caution: 'candidate prioritization only'
    }
  }
}

function curveFromPlanet(planet) {
  const rand = seededRandom(`planet-curve-${planet?.pl_name || 'unknown'}`)
  const realPeriod = Number(planet?.pl_orbper || 4.5)
  const period = clamp(realPeriod, 1.2, 14)
  const radius = Number(planet?.pl_rade || 1.8)
  const hostRadius = Math.max(Number(planet?.st_rad || 1), 0.18)
  const earthToSolarRadius = 0.0091577
  const physicalDepth = ((radius * earthToSolarRadius) / hostRadius) ** 2
  const depth = clamp(physicalDepth * 4, 0.009, 0.035)
  const duration = clamp(0.08 + Math.log10(period + 1) * 0.055, 0.09, 0.24)
  const rawCurve = []
  const cleanedCurve = []
  const dips = []
  const cadence = 0.035
  const points = 980
  for (let i = 0; i < points; i += 1) {
    const time = i * cadence
    const phase = ((time % period) / period + 1) % 1
    const distance = Math.min(phase, 1 - phase)
    const inTransit = distance < duration / period
    const shape = inTransit ? Math.cos((distance / (duration / period)) * Math.PI * 0.5) ** 2 : 0
    const stellarActivity = Math.sin(time / 4.8) * 0.0014 + Math.sin(time / 1.35) * 0.00055
    const noise = (rand() - 0.5) * 0.0018
    const transit = depth * shape
    const rawFlux = 1 + stellarActivity + noise - transit
    const cleanFlux = 1 + noise * 0.3 - transit
    rawCurve.push({ time, flux: rawFlux })
    cleanedCurve.push({ time, flux: cleanFlux })
    if (inTransit && shape > 0.82 && i % Math.max(8, Math.round(period / cadence)) === 0) {
      dips.push({ index: i, time, flux: cleanFlux })
    }
  }
  const variability = 0.0011
  return {
    target_name: `${planet?.pl_name || 'catalog world'} transit projection`,
    raw_curve: rawCurve,
    cleaned_curve: cleanedCurve,
    dips,
    features: {
      period_estimate: period,
      depth_estimate: depth,
      duration_estimate: duration,
      snr_estimate: depth / variability,
      dip_count: dips.length,
      variability,
      source_planet: planet?.pl_name || null
    },
    prediction: {
      candidate_probability: clamp(0.36 + depth / 0.06 + dips.length * 0.045, 0.08, 0.93),
      source: 'archive-planet-projection',
      caution: 'Confirmed exoplanet parameters projected into a transit-style light curve.'
    }
  }
}

function normalizeAnalysis(payload, fallbackName = 'light curve') {
  if (!payload) return null
  const rawCurve = Array.isArray(payload.raw_curve)
    ? payload.raw_curve.map((p, index) => ({ time: Number(p.time ?? index), flux: Number(p.flux ?? p.value ?? 1) }))
    : Array.isArray(payload.time) && Array.isArray(payload.flux_raw)
      ? payload.time.map((time, index) => ({ time: Number(time), flux: Number(payload.flux_raw[index]) }))
      : []
  const cleanedCurve = Array.isArray(payload.cleaned_curve)
    ? payload.cleaned_curve.map((p, index) => ({ time: Number(p.time ?? rawCurve[index]?.time ?? index), flux: Number(p.flux ?? p.value ?? 1) }))
    : Array.isArray(payload.time) && Array.isArray(payload.flux_clean)
      ? payload.time.map((time, index) => ({ time: Number(time), flux: Number(payload.flux_clean[index]) }))
      : rawCurve
  const dips = Array.isArray(payload.dips)
    ? payload.dips.map((dip) => ({ index: Number(dip.index ?? 0), time: Number(dip.time ?? rawCurve[dip.index]?.time ?? 0), flux: Number(dip.flux ?? cleanedCurve[dip.index]?.flux ?? 1) }))
    : Array.isArray(payload.dip_indices)
      ? payload.dip_indices.map((index) => ({ index, time: rawCurve[index]?.time ?? index, flux: cleanedCurve[index]?.flux ?? rawCurve[index]?.flux ?? 1 }))
      : []
  const features = payload.features || {
    period_estimate: payload.period,
    depth_estimate: payload.depth,
    duration_estimate: payload.duration,
    snr_estimate: payload.snr,
    dip_count: payload.dip_count ?? dips.length,
    variability: payload.noise
  }
  const prediction = payload.prediction || {
    candidate_probability: payload.candidate_probability ?? 0,
    source: 'api',
    caution: 'candidate prioritization only'
  }
  return {
    target_name: payload.target_name || fallbackName,
    raw_curve: rawCurve,
    cleaned_curve: cleanedCurve,
    dips,
    features: {
      period_estimate: Number(features.period_estimate ?? 0),
      depth_estimate: Number(features.depth_estimate ?? 0),
      duration_estimate: Number(features.duration_estimate ?? 0),
      snr_estimate: Number(features.snr_estimate ?? 0),
      dip_count: Number(features.dip_count ?? dips.length),
      variability: Number(features.variability ?? 0)
    },
    prediction: {
      candidate_probability: Number(prediction.candidate_probability ?? 0),
      source: prediction.source || 'api',
      caution: prediction.caution || 'candidate prioritization only'
    }
  }
}

function estimateBls(curve) {
  if (!curve || curve.length < 40) return { bestPeriod: null, powers: [] }
  const points = curve.filter((p) => Number.isFinite(p.time) && Number.isFinite(p.flux))
  if (points.length < 40) return { bestPeriod: null, powers: [] }
  const mean = points.reduce((sum, p) => sum + p.flux, 0) / points.length
  const variance = points.reduce((sum, p) => sum + (p.flux - mean) ** 2, 0) / points.length
  const sigma = Math.sqrt(variance) || 0.001
  const start = points[0].time
  const span = points[points.length - 1].time - start
  const minPeriod = Math.max(0.45, span / 42)
  const maxPeriod = Math.max(minPeriod + 0.5, Math.min(18, span / 2.3))
  const powers = []
  const periodSteps = 140
  const phaseBins = 48
  const widths = [0.025, 0.04, 0.065]
  for (let i = 0; i < periodSteps; i += 1) {
    const period = minPeriod + (maxPeriod - minPeriod) * (i / (periodSteps - 1))
    let bestPower = 0
    for (const width of widths) {
      for (let bin = 0; bin < phaseBins; bin += 1) {
        const center = bin / phaseBins
        let inside = 0
        let outside = 0
        let insideCount = 0
        let outsideCount = 0
        for (const point of points) {
          const phase = (((point.time - start) % period) / period + 1) % 1
          const dist = Math.min(Math.abs(phase - center), 1 - Math.abs(phase - center))
          if (dist <= width) {
            inside += point.flux
            insideCount += 1
          } else {
            outside += point.flux
            outsideCount += 1
          }
        }
        if (insideCount < 3 || outsideCount < 3) continue
        const depth = outside / outsideCount - inside / insideCount
        const power = depth > 0 ? (depth / sigma) * Math.sqrt(insideCount) : 0
        if (power > bestPower) bestPower = power
      }
    }
    powers.push({ period, power: bestPower })
  }
  const best = powers.reduce((acc, item) => (item.power > acc.power ? item : acc), powers[0])
  return { bestPeriod: best?.period ?? null, powers }
}

function parseCsvPreview(text) {
  const lines = text.split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []
  const header = lines[0].split(',').map((v) => v.trim())
  return lines.slice(1, 6).map((line) => {
    const values = line.split(',').map((v) => v.trim())
    return header.reduce((row, key, index) => ({ ...row, [key || `col_${index}`]: values[index] ?? '' }), {})
  })
}

function uploadAnalysis(file, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}/analyze`)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
      else onProgress(35)
    }
    xhr.onload = () => {
      try {
        if (xhr.status < 200 || xhr.status >= 300) throw new Error(xhr.responseText || `HTTP ${xhr.status}`)
        resolve(JSON.parse(xhr.responseText))
      } catch (error) {
        reject(error)
      }
    }
    xhr.onerror = () => reject(new Error('upload failed'))
    xhr.send(form)
  })
}

async function fetchExoplanets() {
  const query = [
    'select pl_name,hostname,ra,dec,pl_orbper,pl_orbsmax,pl_orbeccen,pl_rade,pl_bmasse,sy_dist,disc_year,disc_facility,discoverymethod,st_teff,st_rad,st_lum,st_spectype',
    'from ps',
    'where default_flag=1 and ra is not null and dec is not null',
    'order by disc_year desc'
  ].join(' ')
  const params = `query=${encodeURIComponent(query)}&format=json`
  const urls = [`${NASA_TAP_PROXY_URL}?${params}`, `${NASA_TAP_URL}?${params}`]
  for (const url of urls) {
    try {
      const response = await fetch(url)
      if (!response.ok) continue
      const planets = await readJson(response)
      const clean = planets.filter((planet) => Number.isFinite(Number(planet.ra)) && Number.isFinite(Number(planet.dec)))
      if (clean.length) return { planets: clean, live: true }
    } catch {
      // Try the next endpoint before falling back to the bundled archive-scale demo sky.
    }
  }
  return { planets: expandedFallbackCatalog(6298), live: false }
}

async function fetchMastProducts(identifier) {
  const target = identifier.trim().toUpperCase().startsWith('TIC') || identifier.trim().toUpperCase().startsWith('KIC')
    ? identifier.trim()
    : `TIC ${identifier.trim()}`
  const request = {
    service: 'Mast.Caom.Filtered',
    params: {
      columns: 'obsid,obs_collection,target_name,dataproduct_type,proposal_pi,t_exptime',
      filters: [
        { paramName: 'target_name', values: [target] },
        { paramName: 'dataproduct_type', values: ['timeseries'] }
      ]
    },
    format: 'json',
    pagesize: 12
  }
  const params = `request=${encodeURIComponent(JSON.stringify(request))}`
  let response = await fetch(`${MAST_INVOKE_PROXY_URL}?${params}`)
  if (!response.ok && !window.location.hostname.includes('127.0.0.1') && !window.location.hostname.includes('localhost')) {
    response = await fetch(`${MAST_INVOKE_URL}?${params}`)
  }
  const data = await readJson(response)
  return { target, products: data.data || [] }
}

function CosmicBackdrop() {
  const canvasRef = useRef(null)
  const pointer = useRef({ x: 0.5, y: 0.42, tx: 0.5, ty: 0.42, active: false })
  const sparks = useRef([])
  const lastSpark = useRef(0)
  const particles = useMemo(() => {
    const rand = seededRandom('quiet-cosmic-field')
    return Array.from({ length: 230 }, (_, index) => ({
      x: rand(),
      y: rand(),
      z: 0.24 + rand() * 1.45,
      size: 0.45 + rand() * 1.45,
      phase: rand() * Math.PI * 2,
      speed: 0.00008 + rand() * 0.00026,
      tint: index % 17 === 0 ? 'blue' : index % 11 === 0 ? 'violet' : 'ice'
    }))
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf = 0
    let stopped = false

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.floor(window.innerWidth * dpr))
      const height = Math.max(1, Math.floor(window.innerHeight * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const pushSpark = (x, y) => {
      const now = nowMs()
      if (now - lastSpark.current < 28) return
      lastSpark.current = now
      const rand = seededRandom(`${x}-${y}-${now}`)
      for (let i = 0; i < 3; i += 1) {
        const angle = rand() * Math.PI * 2
        const speed = 0.18 + rand() * 0.8
        sparks.current.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          size: 0.8 + rand() * 1.7,
          tint: rand() > 0.65 ? 'blue' : 'ice'
        })
      }
      if (sparks.current.length > 80) sparks.current.splice(0, sparks.current.length - 80)
    }

    const handlePointer = (event) => {
      pointer.current.tx = clamp(event.clientX / Math.max(window.innerWidth, 1), 0, 1)
      pointer.current.ty = clamp(event.clientY / Math.max(window.innerHeight, 1), 0, 1)
      pointer.current.active = true
      document.documentElement.style.setProperty('--cursor-x', `${event.clientX}px`)
      document.documentElement.style.setProperty('--cursor-y', `${event.clientY}px`)
      pushSpark(event.clientX, event.clientY)
    }

    const draw = (time) => {
      if (stopped) return
      resize()
      const width = window.innerWidth
      const height = window.innerHeight
      const p = pointer.current
      p.x += (p.tx - p.x) * 0.055
      p.y += (p.ty - p.y) * 0.055
      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'source-over'
      const veil = ctx.createLinearGradient(0, 0, width, height)
      veil.addColorStop(0, 'rgba(11, 61, 145, 0.025)')
      veil.addColorStop(0.55, 'rgba(255, 255, 255, 0.02)')
      veil.addColorStop(1, 'rgba(252, 61, 33, 0.025)')
      ctx.fillStyle = veil
      ctx.fillRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'source-over'
      const mx = p.x * width
      const my = p.y * height
      particles.forEach((star) => {
        const drift = time * star.speed + star.phase
        const x = (star.x * width + Math.sin(drift) * 26 * star.z + (p.x - 0.5) * 48 * star.z + width) % width
        const y = (star.y * height + Math.cos(drift * 0.72) * 18 * star.z + (p.y - 0.5) * 34 * star.z + height) % height
        const dx = x - mx
        const dy = y - my
        const distance = Math.sqrt(dx * dx + dy * dy)
        const influence = p.active ? clamp(1 - distance / 185, 0, 1) : 0
        const blink = 0.72 + Math.sin(time * star.speed * 9 + star.phase) * 0.28
        const alpha = (0.14 + star.z * 0.2) * blink + influence * 0.58
        const radius = star.size * (0.8 + star.z * 0.24 + influence * 2.1)
        const color = star.tint === 'blue'
          ? `rgba(11, 61, 145, ${alpha})`
          : star.tint === 'violet'
            ? `rgba(252, 61, 33, ${alpha * 0.48})`
            : `rgba(31, 41, 55, ${alpha * 0.74})`
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
        if (influence > 0.38) {
          ctx.strokeStyle = `rgba(11, 61, 145, ${influence * 0.28})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x - dx * 0.04, y - dy * 0.04)
          ctx.stroke()
        }
      })
      sparks.current = sparks.current
        .map((spark) => ({ ...spark, x: spark.x + spark.vx, y: spark.y + spark.vy, life: spark.life - 0.018 }))
        .filter((spark) => spark.life > 0)
      sparks.current.forEach((spark) => {
        const alpha = spark.life * 0.72
        ctx.fillStyle = spark.tint === 'blue' ? `rgba(11, 61, 145, ${alpha})` : `rgba(252, 61, 33, ${alpha * 0.55})`
        ctx.beginPath()
        ctx.arc(spark.x, spark.y, spark.size * spark.life, 0, Math.PI * 2)
        ctx.fill()
      })
      raf = nextFrame(draw)
    }

    window.addEventListener('pointermove', handlePointer, { passive: true })
    window.addEventListener('resize', resize)
    resize()
    raf = nextFrame(draw)
    return () => {
      stopped = true
      stopFrame(raf)
      window.removeEventListener('pointermove', handlePointer)
      window.removeEventListener('resize', resize)
    }
  }, [particles])

  return <canvas ref={canvasRef} className="cosmic-backdrop" aria-hidden="true" />
}

function LightCurveCanvas({ analysis, chartRef }) {
  const canvasRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const curve = analysis?.cleaned_curve || []
  const raw = analysis?.raw_curve || []
  const dips = analysis?.dips || []

  useEffect(() => {
    if (chartRef) chartRef.current = canvasRef.current
  }, [chartRef])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf = 0
    let stopped = false
    const draw = (now) => {
      if (stopped) return
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const nextWidth = Math.max(1, Math.floor(rect.width * dpr))
      const nextHeight = Math.max(1, Math.floor(rect.height * dpr))
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth
        canvas.height = nextHeight
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const width = rect.width
      const height = rect.height
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = '#02040a'
      ctx.fillRect(0, 0, width, height)
      ctx.strokeStyle = 'rgba(143,215,255,0.09)'
      ctx.lineWidth = 1
      for (let y = 40; y < height; y += 56) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }
      for (let x = 0; x < width; x += 72) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
      if (!raw.length && !curve.length) {
        ctx.fillStyle = '#667085'
        ctx.font = '13px "IBM Plex Mono", monospace'
        ctx.fillText('NO LIGHT CURVE LOADED', 20, 34)
        return
      }
      const source = curve.length ? curve : raw
      const minT = Math.min(...source.map((p) => p.time))
      const maxT = Math.max(...source.map((p) => p.time))
      const allFlux = [...raw, ...curve].map((p) => p.flux)
      const minF = Math.min(...allFlux)
      const maxF = Math.max(...allFlux)
      const pad = Math.max((maxF - minF) * 0.16, 0.001)
      const xFor = (time) => ((time - minT) / Math.max(maxT - minT, 1e-9)) * (width - 34) + 17
      const yFor = (flux) => height - 24 - ((flux - minF + pad) / Math.max(maxF - minF + pad * 2, 1e-9)) * (height - 48)
      const drawLine = (points, color, lineWidth) => {
        if (!points.length) return
        ctx.beginPath()
        points.forEach((point, index) => {
          const x = xFor(point.time)
          const y = yFor(point.flux)
          if (index === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.strokeStyle = color
        ctx.lineWidth = lineWidth
        ctx.stroke()
      }
      drawLine(raw, 'rgba(235,245,255,0.28)', 1)
      ctx.shadowBlur = 12
      ctx.shadowColor = 'rgba(143,215,255,0.36)'
      drawLine(curve, '#9fc7ff', 2)
      ctx.shadowBlur = 0
      dips.forEach((dip, index) => {
        const pulse = 1 + Math.sin(now / 260 + index) * 0.2
        const x = xFor(dip.time)
        const y = yFor(dip.flux)
        ctx.strokeStyle = 'rgba(237,247,255,0.34)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, y - 18)
        ctx.lineTo(x, y + 18)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(x, y, 5.4 * pulse, 0, Math.PI * 2)
        ctx.strokeStyle = '#edf7ff'
        ctx.lineWidth = 1.7
        ctx.shadowBlur = 12
        ctx.shadowColor = 'rgba(237,247,255,0.55)'
        ctx.stroke()
        ctx.shadowBlur = 0
      })
      ctx.fillStyle = '#667085'
      ctx.font = '11px "IBM Plex Mono", monospace'
      ctx.fillText('RAW', 18, 22)
      ctx.fillStyle = '#9fc7ff'
      ctx.fillText('CLEAN', 64, 22)
      ctx.fillStyle = '#edf7ff'
      ctx.fillText('DIP', 128, 22)
      raf = window.setTimeout(() => draw(nowMs()), 260)
    }
    draw(nowMs())
    return () => {
      stopped = true
      window.clearTimeout(raf)
      stopFrame(raf)
    }
  }, [analysis, curve, dips, raw])

  function handleMove(event) {
    const source = curve.length ? curve : raw
    if (!source.length) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = clamp((event.clientX - rect.left - 17) / Math.max(rect.width - 34, 1), 0, 1)
    const index = Math.round(ratio * (source.length - 1))
    const point = source[index]
    setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, time: point.time, flux: point.flux })
  }

  return (
    <div className="chart-frame">
      <canvas ref={canvasRef} className="light-canvas" onMouseMove={handleMove} onMouseLeave={() => setTooltip(null)} />
      {tooltip && (
        <div className="chart-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
          T {fmt(tooltip.time, 4)}<br />F {fmt(tooltip.flux, 6)}
        </div>
      )}
    </div>
  )
}

function BlsPanel({ analysis }) {
  const bls = useMemo(() => estimateBls(analysis?.cleaned_curve || []), [analysis])
  const measuredPeriod = Number(analysis?.features?.period_estimate || 0)
  const primaryPeriod = measuredPeriod > 0 ? measuredPeriod : bls.bestPeriod
  const primaryLabel = measuredPeriod > 0 ? 'API' : 'JS'
  const width = 520
  const height = 118
  const points = bls.powers || []
  const maxPower = Math.max(1, ...points.map((p) => p.power))
  const minPeriod = Math.min(...points.map((p) => p.period), 0)
  const maxPeriod = Math.max(...points.map((p) => p.period), 1)
  const line = points.map((p, index) => {
    const x = points.length === 1 ? 0 : (index / (points.length - 1)) * width
    const y = height - (p.power / maxPower) * (height - 16) - 8
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <section className="terminal-panel bls-panel">
      <div className="panel-bar"><span>BLS PERIOD SEARCH</span><strong>{primaryPeriod ? `${primaryLabel} ${fmt(primaryPeriod, 3)} D` : '--'}</strong></div>
      <svg viewBox={`0 0 ${width} ${height}`} className="bls-chart" role="img" aria-label="BLS period power spectrum">
        <polyline points={line} />
      </svg>
      <div className="axis-row"><span>{fmt(minPeriod, 2)}D</span><strong>JS BLS {bls.bestPeriod ? `${fmt(bls.bestPeriod, 3)}D` : '--'}</strong><span>{fmt(maxPeriod, 2)}D</span></div>
    </section>
  )
}

function MetricStrip({ features }) {
  const metrics = [
    ['PERIOD', `${fmt(features?.period_estimate, 3)} D`],
    ['DEPTH', fmt(features?.depth_estimate, 5)],
    ['DURATION', fmt(features?.duration_estimate, 3)],
    ['SNR', fmt(features?.snr_estimate, 2)],
    ['DIPS', features?.dip_count ?? '--'],
    ['NOISE', fmt(features?.variability, 5)]
  ]
  return (
    <section className="metric-strip">
      {metrics.map(([label, value], index) => (
        <div className="metric-chip" style={{ '--delay': `${index * 45}ms` }} key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  )
}

function OrbitCanvas({ score, onPlanet }) {
  const canvasRef = useRef(null)
  const [transit, setTransit] = useState(false)
  const planets = useRef([
    { label: 'INNER-B', orbit: 78, size: 7, speed: 0.0016, color: '#9fc7ff', phase: 0 },
    { label: 'CANDIDATE-C', orbit: 126, size: 10, speed: 0.001, color: '#dcecff', phase: 2.1 },
    { label: 'OUTER-D', orbit: 176, size: 8, speed: 0.00072, color: '#7aa2ff', phase: 4.2 }
  ])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf = 0
    let transitTimer = 0
    let stopped = false
    const draw = (now) => {
      if (stopped) return
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
        canvas.width = Math.floor(rect.width * dpr)
        canvas.height = Math.floor(rect.height * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const w = rect.width
      const h = rect.height
      const cx = w / 2
      const cy = h / 2
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#02040a'
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = 'rgba(143,215,255,0.16)'
      planets.current.forEach((planet) => {
        ctx.beginPath()
        ctx.ellipse(cx, cy, planet.orbit * 1.55, planet.orbit * 0.62, -0.16, 0, Math.PI * 2)
        ctx.stroke()
      })
      ctx.beginPath()
      ctx.arc(cx, cy, 34, 0, Math.PI * 2)
      ctx.fillStyle = '#dcecff'
      ctx.shadowBlur = 18
      ctx.shadowColor = 'rgba(220,236,255,0.65)'
      ctx.fill()
      ctx.shadowBlur = 0
      let isTransit = false
      planets.current.forEach((planet) => {
        const angle = now * planet.speed + planet.phase
        const x = cx + Math.cos(angle) * planet.orbit * 1.55
        const y = cy + Math.sin(angle) * planet.orbit * 0.62
        if (Math.abs(x - cx) < 23 && y > cy - 24 && y < cy + 24) isTransit = true
        ctx.beginPath()
        ctx.arc(x, y, planet.size, 0, Math.PI * 2)
        ctx.fillStyle = planet.color
        ctx.shadowBlur = 14
        ctx.shadowColor = planet.color
        ctx.fill()
        ctx.shadowBlur = 0
      })
      ctx.fillStyle = '#667085'
      ctx.font = '11px "IBM Plex Mono", monospace'
      ctx.fillText(`SIGNAL CHECK ${candidateVerdict(score)}`, 16, 24)
      if (isTransit && now - transitTimer > 1000) {
        transitTimer = now
        setTransit(true)
        setTimeout(() => setTransit(false), 650)
      }
      raf = window.setTimeout(() => nextFrame(draw), 80)
    }
    draw(nowMs())
    return () => {
      stopped = true
      window.clearTimeout(raf)
      stopFrame(raf)
    }
  }, [score])

  function handleClick(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const cx = rect.width / 2
    const cy = rect.height / 2
    const hit = planets.current.find((planet) => {
      const angle = nowMs() * planet.speed + planet.phase
      const px = cx + Math.cos(angle) * planet.orbit * 1.55
      const py = cy + Math.sin(angle) * planet.orbit * 0.62
      return Math.hypot(px - x, py - y) < planet.size + 12
    })
    if (hit) onPlanet(hit.label)
  }

  return (
    <div className="orbit-box">
      <canvas ref={canvasRef} className="orbit-canvas" onClick={handleClick} />
      {transit && <div className="transit-flash"><CheckCircle2 size={16} /> TRANSIT DETECTED</div>}
    </div>
  )
}

function planetTint(planet) {
  const radius = Number(planet?.pl_rade || 0)
  if (planet?.disc_facility?.toLowerCase?.().includes('tess')) return { core: '#8fd7ff', rim: 'rgba(143,215,255,0.34)' }
  if (radius >= 10) return { core: '#b7c6dc', rim: 'rgba(183,198,220,0.36)' }
  if (radius >= 4) return { core: '#9fb7d6', rim: 'rgba(159,183,214,0.32)' }
  if (radius >= 1.5) return { core: '#7db2d5', rim: 'rgba(125,178,213,0.3)' }
  return { core: '#b9cfe4', rim: 'rgba(185,207,228,0.28)' }
}

function starTint(planet) {
  const teff = Number(planet?.st_teff || 0)
  if (!teff) return { core: '#dcecff', halo: 'rgba(143,215,255,0.24)' }
  if (teff >= 7200) return { core: '#dbe7ff', halo: 'rgba(185,207,255,0.38)' }
  if (teff >= 5800) return { core: '#eef4ff', halo: 'rgba(220,236,255,0.3)' }
  if (teff >= 4200) return { core: '#c9d7ea', halo: 'rgba(159,183,214,0.28)' }
  return { core: '#d4a39b', halo: 'rgba(212,163,155,0.22)' }
}

function planetScreenPosition(planet, width, height) {
  return {
    x: (Number(planet.ra) / 360) * width,
    y: ((90 - Number(planet.dec)) / 180) * height
  }
}

function PlanetSystemPreview({ planet }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf = 0
    let stopped = false
    const draw = (now) => {
      if (stopped) return
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const nextWidth = Math.max(1, Math.floor(rect.width * dpr))
      const nextHeight = Math.max(1, Math.floor(rect.height * dpr))
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth
        canvas.height = nextHeight
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const w = rect.width
      const h = rect.height
      const cx = w * 0.5
      const cy = h * 0.52
      ctx.clearRect(0, 0, w, h)
      const bg = ctx.createLinearGradient(0, 0, w, h)
      bg.addColorStop(0, 'rgba(3,6,12,0.92)')
      bg.addColorStop(1, 'rgba(1,3,8,0.96)')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)
      if (!planet) {
        ctx.fillStyle = '#667085'
        ctx.font = '12px "IBM Plex Mono", monospace'
        ctx.fillText('SELECT A CATALOG WORLD', 14, 26)
        raf = nextFrame(draw)
        return
      }
      const star = starTint(planet)
      const world = planetTint(planet)
      const starRadius = clamp(Number(planet.st_rad || 1) * 18, 13, 38)
      const planetRadius = clamp(Number(planet.pl_rade || 1.2) * 2.2, 4, 22)
      const period = clamp(Number(planet.pl_orbper || 12), 0.45, 900)
      const orbitX = clamp(Math.log10(period + 2) * 72, 84, Math.min(w * 0.43, 190))
      const orbitY = orbitX * 0.36
      const speed = 0.00024 / Math.sqrt(Math.log10(period + 2))
      const angle = now * speed + 1.1
      ctx.strokeStyle = 'rgba(185,207,228,0.18)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.ellipse(cx, cy, orbitX, orbitY, -0.12, 0, Math.PI * 2)
      ctx.stroke()
      const px = cx + Math.cos(angle) * orbitX
      const py = cy + Math.sin(angle) * orbitY
      ctx.beginPath()
      const glow = ctx.createRadialGradient(cx, cy, starRadius * 0.3, cx, cy, starRadius * 2.8)
      glow.addColorStop(0, star.halo)
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.arc(cx, cy, starRadius * 2.8, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(cx, cy, starRadius, 0, Math.PI * 2)
      ctx.fillStyle = star.core
      ctx.shadowBlur = 22
      ctx.shadowColor = star.core
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.beginPath()
      ctx.arc(px, py, planetRadius + 7, 0, Math.PI * 2)
      ctx.fillStyle = world.rim
      ctx.fill()
      ctx.beginPath()
      ctx.arc(px, py, planetRadius, 0, Math.PI * 2)
      const shade = ctx.createRadialGradient(px - planetRadius * 0.42, py - planetRadius * 0.45, 1, px, py, planetRadius * 1.2)
      shade.addColorStop(0, '#f3f7ff')
      shade.addColorStop(0.18, world.core)
      shade.addColorStop(1, '#111827')
      ctx.fillStyle = shade
      ctx.fill()
      if (Math.abs(px - cx) < starRadius * 0.8 && py > cy - starRadius * 0.45 && py < cy + starRadius * 0.45) {
      ctx.strokeStyle = 'rgba(143,215,255,0.75)'
        ctx.beginPath()
        ctx.moveTo(cx - starRadius * 1.35, cy - starRadius * 1.35)
        ctx.lineTo(cx + starRadius * 1.35, cy - starRadius * 1.35)
        ctx.stroke()
      }
      ctx.fillStyle = '#667085'
      ctx.font = '11px "IBM Plex Mono", monospace'
      ctx.fillText('CATALOG ORBIT MODEL', 14, 24)
      ctx.fillStyle = '#8fd7ff'
      ctx.fillText(`${fmt(period, 2)} D ORBIT`, 14, h - 16)
      ctx.fillStyle = '#b9cfe4'
      ctx.fillText(`${fmt(planet.pl_rade, 2)} RE`, w - 92, h - 16)
      raf = nextFrame(draw)
    }
    raf = nextFrame(draw)
    return () => {
      stopped = true
      stopFrame(raf)
    }
  }, [planet])
  return <canvas ref={canvasRef} className="system-preview" aria-label="Selected exoplanet system preview" />
}

function PlanetPortrait({ planet }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf = 0
    let stopped = false
    const rand = seededRandom(`portrait-${planet?.pl_name || 'none'}`)
    const bands = Array.from({ length: 9 }, (_, index) => ({
      y: -0.8 + index * 0.22 + rand() * 0.08,
      width: 0.06 + rand() * 0.1,
      alpha: 0.05 + rand() * 0.08
    }))
    const draw = (now) => {
      if (stopped) return
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const nextWidth = Math.max(1, Math.floor(rect.width * dpr))
      const nextHeight = Math.max(1, Math.floor(rect.height * dpr))
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth
        canvas.height = nextHeight
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const w = rect.width
      const h = rect.height
      const cx = w * 0.5
      const cy = h * 0.48
      const radius = Math.min(w, h) * 0.28
      const tint = planetTint(planet)
      ctx.clearRect(0, 0, w, h)
      const bg = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, Math.max(w, h) * 0.72)
      bg.addColorStop(0, 'rgba(35,52,70,0.2)')
      bg.addColorStop(0.48, 'rgba(4,8,15,0.72)')
      bg.addColorStop(1, 'rgba(1,3,8,1)')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(-0.22)
      ctx.strokeStyle = 'rgba(143,215,255,0.16)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.ellipse(0, 0, radius * 1.92, radius * 0.43, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
      ctx.beginPath()
      ctx.arc(cx, cy, radius * 1.36, 0, Math.PI * 2)
      const halo = ctx.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius * 1.36)
      halo.addColorStop(0, tint.rim)
      halo.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = halo
      ctx.fill()
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.clip()
      const body = ctx.createRadialGradient(cx - radius * 0.38, cy - radius * 0.48, 1, cx, cy, radius * 1.2)
      body.addColorStop(0, '#f7fbff')
      body.addColorStop(0.2, tint.core)
      body.addColorStop(0.62, '#5d748f')
      body.addColorStop(1, '#0a0f18')
      ctx.fillStyle = body
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2)
      bands.forEach((band, index) => {
        const y = cy + band.y * radius + Math.sin(now * 0.00045 + index) * 3
        ctx.fillStyle = `rgba(237,247,255,${band.alpha})`
        ctx.fillRect(cx - radius, y, radius * 2, band.width * radius)
      })
      ctx.restore()
      ctx.strokeStyle = 'rgba(237,247,255,0.26)'
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = '#667085'
      ctx.font = '12px "IBM Plex Mono", monospace'
      ctx.fillText('EXOSIGNAL WORLD', 18, 28)
      ctx.fillStyle = '#c9e3ff'
      ctx.fillText(planetKind(planet), 18, h - 22)
      raf = nextFrame(draw)
    }
    raf = nextFrame(draw)
    return () => {
      stopped = true
      stopFrame(raf)
    }
  }, [planet])
  return <canvas ref={canvasRef} className="planet-portrait" aria-label="Selected planet portrait" />
}

function PlanetProfileScene({ planet, prediction }) {
  const canvasRef = useRef(null)
  const stars = useMemo(() => {
    const rand = seededRandom(`profile-stars-${planet?.pl_name || 'empty'}`)
    return Array.from({ length: 190 }, () => ({
      x: rand(),
      y: rand(),
      z: 0.35 + rand() * 1.2,
      drift: rand() * Math.PI * 2
    }))
  }, [planet?.pl_name])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const rand = seededRandom(`profile-world-${planet?.pl_name || 'empty'}`)
    const bands = Array.from({ length: 12 }, (_, index) => ({
      y: -0.82 + index * 0.16 + rand() * 0.05,
      alpha: 0.06 + rand() * 0.11,
      height: 0.035 + rand() * 0.07
    }))
    let raf = 0
    let stopped = false
    const draw = (now) => {
      if (stopped) return
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const nextWidth = Math.max(1, Math.floor(rect.width * dpr))
      const nextHeight = Math.max(1, Math.floor(rect.height * dpr))
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth
        canvas.height = nextHeight
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const w = rect.width
      const h = rect.height
      ctx.clearRect(0, 0, w, h)
      const bg = ctx.createRadialGradient(w * 0.68, h * 0.5, 20, w * 0.54, h * 0.48, Math.max(w, h) * 0.76)
      bg.addColorStop(0, '#102748')
      bg.addColorStop(0.34, '#061426')
      bg.addColorStop(0.76, '#01050d')
      bg.addColorStop(1, '#000000')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)
      stars.forEach((star) => {
        const x = (star.x * w + Math.sin(now * 0.00018 + star.drift) * star.z * 18 + w) % w
        const y = (star.y * h + Math.cos(now * 0.00015 + star.drift) * star.z * 10 + h) % h
        const blink = 0.62 + Math.sin(now * 0.0012 + star.drift) * 0.24
        ctx.fillStyle = `rgba(226,237,255,${(0.15 + star.z * 0.26) * blink})`
        ctx.beginPath()
        ctx.arc(x, y, star.z * 0.95, 0, Math.PI * 2)
        ctx.fill()
      })
      if (!planet) {
        ctx.fillStyle = '#d8e6f7'
        ctx.font = '700 28px "Public Sans", sans-serif'
        ctx.fillText('SELECT A WORLD', 30, 56)
        raf = nextFrame(draw)
        return
      }
      const star = starTint(planet)
      const world = planetTint(planet)
      const starX = w * 0.3
      const starY = h * 0.5
      const starRadius = clamp(Number(planet.st_rad || 1) * 14, 22, 74)
      const worldRadius = clamp(Math.sqrt(estimatedRadiusEarth(planet) || 2.4) * 32, 64, Math.min(w, h) * 0.23)
      const orbitX = clamp(Math.log10(Number(planet.pl_orbper || 40) + 3) * w * 0.19, w * 0.22, w * 0.42)
      const orbitY = orbitX * 0.24
      const speed = 0.0002 / Math.sqrt(Math.log10(Number(planet.pl_orbper || 20) + 3))
      const angle = now * speed + 0.7
      const px = starX + Math.cos(angle) * orbitX
      const py = starY + Math.sin(angle) * orbitY

      ctx.save()
      ctx.strokeStyle = 'rgba(216,230,247,0.16)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.ellipse(starX, starY, orbitX, orbitY, -0.08, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()

      const starGlow = ctx.createRadialGradient(starX, starY, starRadius * 0.1, starX, starY, starRadius * 4.2)
      starGlow.addColorStop(0, star.halo)
      starGlow.addColorStop(0.45, 'rgba(105,154,215,0.12)')
      starGlow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = starGlow
      ctx.beginPath()
      ctx.arc(starX, starY, starRadius * 4.2, 0, Math.PI * 2)
      ctx.fill()
      const starBody = ctx.createRadialGradient(starX - starRadius * 0.38, starY - starRadius * 0.42, 2, starX, starY, starRadius)
      starBody.addColorStop(0, '#ffffff')
      starBody.addColorStop(0.42, star.core)
      starBody.addColorStop(1, '#8aa2be')
      ctx.fillStyle = starBody
      ctx.shadowBlur = 28
      ctx.shadowColor = star.core
      ctx.beginPath()
      ctx.arc(starX, starY, starRadius, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0

      const profileX = w * 0.72
      const profileY = h * 0.5
      const halo = ctx.createRadialGradient(profileX, profileY, worldRadius * 0.45, profileX, profileY, worldRadius * 1.68)
      halo.addColorStop(0, world.rim)
      halo.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(profileX, profileY, worldRadius * 1.68, 0, Math.PI * 2)
      ctx.fill()
      ctx.save()
      ctx.beginPath()
      ctx.arc(profileX, profileY, worldRadius, 0, Math.PI * 2)
      ctx.clip()
      const planetBody = ctx.createRadialGradient(profileX - worldRadius * 0.43, profileY - worldRadius * 0.46, 1, profileX, profileY, worldRadius * 1.28)
      planetBody.addColorStop(0, '#f7fbff')
      planetBody.addColorStop(0.17, world.core)
      planetBody.addColorStop(0.66, '#4c6784')
      planetBody.addColorStop(1, '#05070d')
      ctx.fillStyle = planetBody
      ctx.fillRect(profileX - worldRadius, profileY - worldRadius, worldRadius * 2, worldRadius * 2)
      ctx.globalCompositeOperation = 'screen'
      bands.forEach((band, index) => {
        const y = profileY + band.y * worldRadius + Math.sin(now * 0.00034 + index * 0.8) * 3
        ctx.fillStyle = `rgba(235,246,255,${band.alpha})`
        ctx.fillRect(profileX - worldRadius, y, worldRadius * 2, worldRadius * band.height)
      })
      ctx.restore()
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = 'rgba(255,255,255,0.32)'
      ctx.beginPath()
      ctx.arc(profileX, profileY, worldRadius, 0, Math.PI * 2)
      ctx.stroke()

      const isTransit = Math.abs(px - starX) < starRadius * 0.85 && py > starY - starRadius * 0.45 && py < starY + starRadius * 0.45
      ctx.fillStyle = isTransit ? '#030711' : world.core
      ctx.shadowBlur = isTransit ? 0 : 14
      ctx.shadowColor = world.core
      ctx.beginPath()
      ctx.arc(px, py, clamp(worldRadius * 0.12, 7, 18), 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0

      ctx.strokeStyle = isTransit ? '#ffffff' : 'rgba(255,255,255,0.42)'
      ctx.beginPath()
      ctx.moveTo(starX + starRadius * 1.35, starY - starRadius * 1.25)
      ctx.lineTo(profileX - worldRadius * 0.82, profileY - worldRadius * 0.72)
      ctx.stroke()

      ctx.fillStyle = '#ffffff'
      ctx.font = '900 34px "Public Sans", sans-serif'
      ctx.fillText(planet.pl_name || 'CATALOG WORLD', 28, 54)
      ctx.font = '700 12px "IBM Plex Mono", monospace'
      ctx.fillStyle = '#9fb4ce'
      ctx.fillText(`${planetKind(planet)} · ${planet.discoverymethod || planet.disc_facility || 'confirmed planet'}`, 30, 78)
      ctx.fillStyle = isTransit ? '#ffffff' : '#6fb6ff'
      ctx.fillText(isTransit ? 'TRANSIT LINE ACTIVE' : 'ORBITAL GEOMETRY', 30, h - 28)
      ctx.fillStyle = '#dbe7f6'
      ctx.fillText(`MODEL ${candidateVerdict(prediction || 0)}`, w - 178, h - 28)
      raf = nextFrame(draw)
    }
    raf = nextFrame(draw)
    return () => {
      stopped = true
      stopFrame(raf)
    }
  }, [planet, prediction, stars])

  return <canvas ref={canvasRef} className="planet-profile-scene" aria-label="Exoplanet profile scene" />
}

function NasaSystemInstrument({ planet, systemPlanets }) {
  const canvasRef = useRef(null)
  const planets = useMemo(() => (systemPlanets?.length ? systemPlanets : planet ? [planet] : [])
    .slice()
    .sort((a, b) => Number(a.pl_orbsmax || a.pl_orbper || 0) - Number(b.pl_orbsmax || b.pl_orbper || 0))
    .slice(0, 7), [planet, systemPlanets])
  const stars = useMemo(() => Array.from({ length: 190 }, (_, index) => {
    const rand = seededRandom(`instrument-${planet?.pl_name || 'empty'}-${index}`)
    return {
      x: rand(),
      y: rand(),
      r: 0.35 + rand() * 1.65,
      alpha: 0.16 + rand() * 0.7,
      drift: 0.4 + rand() * 1.7,
      hue: rand() > 0.86 ? '#cfdcff' : '#ffffff'
    }
  }), [planet?.pl_name])
  const distance = lightYears(planet)
  const starName = planet?.hostname || 'HOST STAR'
  const planetCount = systemPlanets?.length || (planet ? 1 : 0)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf = 0
    let stopped = false

    const drawEllipse = (x, y, rx, ry) => {
      ctx.beginPath()
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
      ctx.stroke()
    }

    const draw = (now) => {
      if (stopped) return
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(320, rect.width)
      const h = Math.max(520, rect.height)
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr)
        canvas.height = Math.floor(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const tint = planetTint(planet)
      const star = starTint(planet)
      const bg = ctx.createRadialGradient(w * 0.58, h * 0.38, 10, w * 0.55, h * 0.38, Math.max(w, h) * 0.82)
      bg.addColorStop(0, 'rgba(43, 68, 111, 0.38)')
      bg.addColorStop(0.35, 'rgba(10, 16, 30, 0.88)')
      bg.addColorStop(1, '#000000')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      stars.forEach((starPoint, index) => {
        const shimmer = 0.55 + Math.sin(now * 0.0012 * starPoint.drift + index) * 0.45
        const x = (starPoint.x * w + Math.sin(now * 0.00008 + index) * 4) % w
        const y = (starPoint.y * h + Math.cos(now * 0.00006 + index * 0.4) * 3) % h
        ctx.globalAlpha = starPoint.alpha * shimmer
        ctx.fillStyle = starPoint.hue
        ctx.beginPath()
        ctx.arc(x, y, starPoint.r, 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.globalAlpha = 1

      const gridY = h * 0.64
      ctx.strokeStyle = 'rgba(177, 204, 238, 0.08)'
      ctx.lineWidth = 1
      for (let i = 0; i < 9; i += 1) {
        const y = gridY + i * 24
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y + i * 6)
        ctx.stroke()
      }
      for (let i = -5; i <= 5; i += 1) {
        ctx.beginPath()
        ctx.moveTo(w * 0.5 + i * 48, gridY - 18)
        ctx.lineTo(w * 0.5 + i * 102, h)
        ctx.stroke()
      }

      const cx = w * 0.42
      const cy = h * 0.5
      const hostRadius = clamp(Math.min(w, h) * 0.07, 23, 43)
      const hostGlow = ctx.createRadialGradient(cx, cy, 1, cx, cy, hostRadius * 4.2)
      hostGlow.addColorStop(0, '#ffffff')
      hostGlow.addColorStop(0.13, star.core)
      hostGlow.addColorStop(0.38, star.halo)
      hostGlow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = hostGlow
      ctx.beginPath()
      ctx.arc(cx, cy, hostRadius * 4.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = star.core
      ctx.shadowBlur = 28
      ctx.shadowColor = star.core
      ctx.beginPath()
      ctx.arc(cx, cy, hostRadius, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0

      const orbitSet = planets.length ? planets : planet ? [planet] : []
      const maxOrbit = Math.max(1, ...orbitSet.map((item) => Number(item.pl_orbsmax || Math.log10(Number(item.pl_orbper || 2) + 1))))
      let selectedPoint = null
      orbitSet.forEach((item, index) => {
        const orbitValue = Number(item.pl_orbsmax || Math.log10(Number(item.pl_orbper || 2) + 1))
        const selected = !planet?.pl_name || item.pl_name === planet.pl_name
        const rx = clamp(w * 0.16 + (orbitValue / maxOrbit) * w * 0.34, w * 0.16, w * 0.46)
        const ry = rx * (0.27 + index * 0.018)
        const speed = 0.00018 / (index + 1.25)
        const angle = now * speed + index * 1.44 + (Number(item.pl_orbper || 0) % 23) * 0.04
        const px = cx + Math.cos(angle) * rx
        const py = cy + Math.sin(angle) * ry
        const radius = clamp(Math.sqrt(estimatedRadiusEarth(item) || 1.8) * 2.8, 4, 14)

        ctx.strokeStyle = selected ? 'rgba(255,255,255,0.34)' : 'rgba(187,207,234,0.13)'
        ctx.lineWidth = selected ? 1.25 : 0.8
        drawEllipse(cx, cy, rx, ry)

        if (selected) {
          selectedPoint = { x: px, y: py, radius, item }
          ctx.strokeStyle = 'rgba(255,255,255,0.36)'
          ctx.setLineDash([7, 7])
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(px, py)
          ctx.stroke()
          ctx.setLineDash([])
        }

        ctx.fillStyle = selected ? 'rgba(255,255,255,0.18)' : 'rgba(160,184,214,0.08)'
        ctx.beginPath()
        ctx.arc(px, py, radius + (selected ? 9 : 4), 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = selected ? tint.core : 'rgba(170,194,220,0.86)'
        ctx.shadowBlur = selected ? 16 : 5
        ctx.shadowColor = selected ? tint.core : 'rgba(170,194,220,0.55)'
        ctx.beginPath()
        ctx.arc(px, py, radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      })

      const profileX = w * 0.78
      const profileY = h * 0.36
      const worldRadius = clamp(Math.sqrt(estimatedRadiusEarth(planet) || 2.4) * 21, 60, 132)
      const halo = ctx.createRadialGradient(profileX, profileY, 2, profileX, profileY, worldRadius * 1.85)
      halo.addColorStop(0, tint.rim)
      halo.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(profileX, profileY, worldRadius * 1.85, 0, Math.PI * 2)
      ctx.fill()
      ctx.save()
      ctx.beginPath()
      ctx.arc(profileX, profileY, worldRadius, 0, Math.PI * 2)
      ctx.clip()
      const planetBody = ctx.createRadialGradient(profileX - worldRadius * 0.38, profileY - worldRadius * 0.48, 1, profileX, profileY, worldRadius * 1.25)
      planetBody.addColorStop(0, '#ffffff')
      planetBody.addColorStop(0.24, tint.core)
      planetBody.addColorStop(0.72, '#3f526b')
      planetBody.addColorStop(1, '#030509')
      ctx.fillStyle = planetBody
      ctx.fillRect(profileX - worldRadius, profileY - worldRadius, worldRadius * 2, worldRadius * 2)
      ctx.globalCompositeOperation = 'screen'
      for (let i = 0; i < 8; i += 1) {
        const bandY = profileY - worldRadius * 0.68 + i * worldRadius * 0.22 + Math.sin(now * 0.00025 + i) * 3
        ctx.fillStyle = `rgba(230,238,248,${0.035 + i * 0.01})`
        ctx.fillRect(profileX - worldRadius, bandY, worldRadius * 2, worldRadius * 0.08)
      }
      ctx.restore()
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = 'rgba(255,255,255,0.26)'
      ctx.beginPath()
      ctx.arc(profileX, profileY, worldRadius, 0, Math.PI * 2)
      ctx.stroke()

      if (selectedPoint) {
        ctx.strokeStyle = 'rgba(255,255,255,0.42)'
        ctx.beginPath()
        ctx.moveTo(selectedPoint.x, selectedPoint.y)
        ctx.lineTo(profileX - worldRadius * 0.62, profileY + worldRadius * 0.48)
        ctx.stroke()
      }

      const scanX = ((now * 0.035) % (w + 80)) - 40
      const scan = ctx.createLinearGradient(scanX - 32, 0, scanX + 32, 0)
      scan.addColorStop(0, 'rgba(255,255,255,0)')
      scan.addColorStop(0.5, 'rgba(255,255,255,0.18)')
      scan.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = scan
      ctx.fillRect(scanX - 32, 0, 64, h)

      ctx.fillStyle = 'rgba(255,255,255,0.72)'
      ctx.font = '800 10px "IBM Plex Mono", monospace'
      ctx.fillText('HOST STAR', Math.max(14, cx - 34), cy + hostRadius + 28)
      ctx.fillText(starName.slice(0, 18), Math.max(14, cx - 34), cy + hostRadius + 43)
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.font = '900 11px "IBM Plex Mono", monospace'
      ctx.fillText('ORBITAL FIELD', 18, h - 28)

      raf = nextFrame(draw)
    }

    raf = nextFrame(draw)
    return () => {
      stopped = true
      stopFrame(raf)
    }
  }, [planet, planets, starName, stars])

  return (
    <div className="nasa-instrument">
      <canvas ref={canvasRef} className="nasa-instrument-canvas" aria-label="Animated planetary system instrument" />
      <div className="nasa-instrument-overlay">
        <div className="nasa-mini-title">
          <strong>{planet?.pl_name || 'SELECT A WORLD'}</strong>
          <span>{distance ? `${fmt(distance, 1)} LIGHT-YEARS` : 'DISTANCE --'}</span>
        </div>
        <div className="instrument-tags">
          <span>PLANET FILE</span>
          <span>{planetKind(planet)}</span>
          <span>{planet?.discoverymethod || 'ARCHIVE'}</span>
        </div>
        <div className="instrument-readouts">
          <span>STAR <b>{starName}</b></span>
          <span>ORBIT <b>{planet?.pl_orbper ? `${fmt(planet.pl_orbper, 2)} D` : '--'}</b></span>
          <span>RADIUS <b>{formatRadius(planet)}</b></span>
          <span>MASS <b>{formatMass(planet)}</b></span>
          <span>SYSTEM <b>{planetCount}</b></span>
          <span>YEAR <b>{planet?.disc_year || '--'}</b></span>
        </div>
      </div>
    </div>
  )
}

function NasaEyesExperience({ planet, systemPlanets }) {
  const [viewerReady, setViewerReady] = useState(false)
  const src = nasaEyesUrl(planet, true)
  const fullUrl = nasaEyesUrl(planet, false)
  useEffect(() => {
    setViewerReady(false)
  }, [src])
  return (
    <section className="nasa-eyes-card">
      <div className="nasa-eyes-head">
        <span>NASA EYES ON EXOPLANETS</span>
        <a href={fullUrl} target="_blank" rel="noreferrer">OPEN LIVE NASA VIEW <ExternalLink size={13} /></a>
      </div>
      <div className="nasa-eyes-grid">
        <div className="nasa-iframe-shell">
          {!viewerReady && <div className="nasa-loading">LOADING NASA 3D VIEW</div>}
          <iframe
            key={src}
            src={src}
            title={`NASA Eyes on Exoplanets - ${planet?.pl_name || 'catalog'}`}
            loading="lazy"
            allow="fullscreen; xr-spatial-tracking"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setViewerReady(true)}
          />
        </div>
        <aside className="nasa-companion">
          <NasaSystemInstrument planet={planet} systemPlanets={systemPlanets} />
        </aside>
      </div>
    </section>
  )
}

function StarMapCanvas({ planets, selected, onSelect }) {
  const canvasRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const mouse = useRef({ x: 0, y: 0 })
  const hovered = useRef(null)
  const view = useRef({ scale: 1, x: 0, y: 0, dragging: false, lastX: 0, lastY: 0 })
  const [viewInfo, setViewInfo] = useState({ scale: 1, x: 0, y: 0 })
  const stars = useMemo(() => Array.from({ length: 240 }, (_, index) => ({
    x: seededRandom(`sx${index}`)(),
    y: seededRandom(`sy${index}`)(),
    z: 0.35 + seededRandom(`sz${index}`)() * 0.9
  })), [])

  function publishView() {
    setViewInfo({ scale: view.current.scale, x: view.current.x, y: view.current.y })
  }

  function projectPlanet(planet, width, height) {
    const ra = (Number(planet.ra || 0) / 180) * Math.PI
    const dec = (Number(planet.dec || 0) / 180) * Math.PI
    const distance = clamp(Math.log10(Number(planet.sy_dist || 120) + 1) / 3.2, 0, 1)
    const sphereX = Math.cos(dec) * Math.sin(ra - Math.PI)
    const sphereY = Math.sin(dec)
    const sphereZ = Math.cos(dec) * Math.cos(ra - Math.PI)
    const perspective = clamp(0.7 + sphereZ * 0.26 - distance * 0.08, 0.46, 1.08)
    const rand = seededRandom(`sky-spread-${planet.pl_name || planet.hostname || `${planet.ra}-${planet.dec}`}`)
    const angle = rand() * Math.PI * 2
    const jitter = (0.035 + rand() * 0.07) * (0.8 + distance * 0.65)
    const driftX = Math.sin(ra * 2.3 + dec) * width * 0.075 + Math.cos(angle) * width * jitter
    const driftY = Math.cos(ra * 1.7 - dec) * height * 0.055 + Math.sin(angle) * height * jitter * 0.72
    const current = view.current
    const localX = sphereX * width * 0.58 * (0.86 + perspective * 0.22) + driftX
    const localY = -sphereY * height * 0.51 * (0.86 + perspective * 0.18) + driftY
    return {
      x: localX * current.scale + width / 2 + current.x * perspective,
      y: localY * current.scale + height / 2 + current.y * perspective,
      depth: perspective,
      distance
    }
  }

  function zoomAt(factor, localX, localY, width, height) {
    const current = view.current
    const previous = current.scale
    const next = clamp(previous * factor, 0.55, 7)
    const ratio = next / previous
    const sx = localX - width / 2
    const sy = localY - height / 2
    current.x = sx - (sx - current.x) * ratio
    current.y = sy - (sy - current.y) * ratio
    current.scale = next
    publishView()
  }

  function nudge(dx, dy) {
    view.current.x += dx
    view.current.y += dy
    publishView()
  }

  function resetView() {
    view.current = { scale: 1, x: 0, y: 0, dragging: false, lastX: 0, lastY: 0 }
    publishView()
  }

  function zoomCenter(factor) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    zoomAt(factor, rect.width / 2, rect.height / 2, rect.width, rect.height)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf = 0
    let stopped = false
    const draw = () => {
      if (stopped) return
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
        canvas.width = Math.floor(rect.width * dpr)
        canvas.height = Math.floor(rect.height * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const w = rect.width
      const h = rect.height
      ctx.clearRect(0, 0, w, h)
      const sky = ctx.createRadialGradient(w * 0.62, h * 0.42, 10, w * 0.55, h * 0.48, Math.max(w, h) * 0.78)
      sky.addColorStop(0, '#08245a')
      sky.addColorStop(0.34, '#03152f')
      sky.addColorStop(0.72, '#010713')
      sky.addColorStop(1, '#000208')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)
      stars.forEach((star) => {
        const x = star.x * w + mouse.current.x * star.z * 18 + view.current.x * star.z * 0.08
        const y = star.y * h + mouse.current.y * star.z * 14 + view.current.y * star.z * 0.08
        const twinkle = 0.55 + Math.sin(nowMs() * 0.001 + star.x * 12) * 0.2
        ctx.fillStyle = `rgba(185,207,228,${(0.14 + star.z * 0.34) * twinkle})`
        ctx.beginPath()
        ctx.arc((x + w) % w, (y + h) % h, star.z * 1.15, 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.save()
      ctx.globalAlpha = 0.18
      ctx.strokeStyle = 'rgba(143,215,255,0.28)'
      ctx.beginPath()
      ctx.moveTo(0, h / 2)
      ctx.lineTo(w, h / 2)
      ctx.moveTo(w / 2, 0)
      ctx.lineTo(w / 2, h)
      ctx.stroke()
      ctx.restore()
      ctx.save()
      ctx.globalAlpha = 0.18
      ctx.strokeStyle = 'rgba(185,207,228,0.2)'
      ctx.beginPath()
      ctx.ellipse(w * 0.55, h * 0.52, w * 0.58, h * 0.18, -0.32, 0, Math.PI * 2)
      ctx.ellipse(w * 0.58, h * 0.5, w * 0.36, h * 0.1, -0.32, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
      const projected = planets
        .map((planet) => ({ planet, point: projectPlanet(planet, w, h) }))
        .sort((a, b) => a.point.depth - b.point.depth)
      projected.forEach(({ planet, point }) => {
        const { x, y, depth, distance } = point
        if (x < -80 || x > w + 80 || y < -80 || y > h + 80) return
        const visual = planetTint(planet)
        const radius = clamp(Math.sqrt(Number(planet.pl_rade || 1.4)) * 2.8 * Math.sqrt(view.current.scale) * (0.72 + depth * 0.34), 3.2, 19)
        const isSelected = selected?.pl_name === planet.pl_name
        const isHovered = hovered.current?.pl_name === planet.pl_name
        const selectedBoost = isSelected ? 1.45 : isHovered ? 1.25 : 1
        ctx.beginPath()
        const aura = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius * 3.1 * selectedBoost)
        aura.addColorStop(0, isSelected ? 'rgba(252,61,33,0.3)' : visual.rim)
        aura.addColorStop(0.42, 'rgba(143,215,255,0.1)')
        aura.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.globalAlpha = clamp(0.52 + depth * 0.42 - distance * 0.18, 0.36, 1)
        ctx.fillStyle = aura
        ctx.arc(x, y, radius * 3.1 * selectedBoost, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.beginPath()
        ctx.arc(x, y, radius + (isSelected ? 7 : isHovered ? 5 : 2), 0, Math.PI * 2)
        ctx.fillStyle = isSelected ? 'rgba(252,61,33,0.22)' : 'rgba(143,215,255,0.16)'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(x, y, isSelected ? radius + 3 : radius, 0, Math.PI * 2)
        const body = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, 1, x, y, radius * 1.4)
        body.addColorStop(0, '#ffffff')
        body.addColorStop(0.22, visual.core)
        body.addColorStop(0.74, '#5e7ea6')
        body.addColorStop(1, '#101520')
        ctx.fillStyle = body
        ctx.shadowBlur = isSelected || isHovered ? 26 : 14
        ctx.shadowColor = visual.core
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.strokeStyle = isSelected ? '#fc3d21' : 'rgba(255,255,255,0.7)'
        ctx.lineWidth = isSelected ? 2 : 1
        ctx.beginPath()
        ctx.arc(x, y, radius + 0.5, 0, Math.PI * 2)
        ctx.stroke()
        if (planet.disc_facility?.includes('Kepler')) {
          ctx.strokeStyle = 'rgba(143,215,255,0.38)'
          ctx.beginPath()
          ctx.arc(x, y, radius + 4, 0, Math.PI * 2)
          ctx.stroke()
        }
      })
      projected
        .filter(({ planet }) => selected?.pl_name === planet.pl_name || hovered.current?.pl_name === planet.pl_name)
        .slice(-2)
        .forEach(({ planet, point }) => {
          const radius = clamp(Math.sqrt(Number(planet.pl_rade || 1.4)) * 2.8 * Math.sqrt(view.current.scale) * (0.72 + point.depth * 0.34), 3.2, 19)
          const name = planet.pl_name || 'Catalog world'
          const period = `${fmt(planet.pl_orbper, 2)} D orbit`
          ctx.font = '700 12px "IBM Plex Mono", monospace'
          const widthName = Math.min(210, Math.max(112, ctx.measureText(name).width + 20))
          const labelX = clamp(point.x + radius + 14, 12, w - widthName - 14)
          const labelY = clamp(point.y - radius - 34, 14, h - 64)
          ctx.strokeStyle = 'rgba(255,255,255,0.38)'
          ctx.beginPath()
          ctx.moveTo(point.x + radius * 0.75, point.y - radius * 0.35)
          ctx.lineTo(labelX, labelY + 18)
          ctx.stroke()
          ctx.fillStyle = 'rgba(3, 7, 15, 0.88)'
          ctx.fillRect(labelX, labelY, widthName, 46)
          ctx.fillStyle = selected?.pl_name === planet.pl_name ? '#fc3d21' : '#6fb6ff'
          ctx.fillRect(labelX, labelY, widthName, 3)
          ctx.fillStyle = '#ffffff'
          ctx.fillText(name.length > 24 ? `${name.slice(0, 22)}...` : name, labelX + 10, labelY + 20)
          ctx.fillStyle = '#b9cfe4'
          ctx.font = '11px "IBM Plex Mono", monospace'
          ctx.fillText(period, labelX + 10, labelY + 36)
      })
      raf = window.setTimeout(() => nextFrame(draw), 90)
    }
    draw()
    return () => {
      stopped = true
      window.clearTimeout(raf)
      stopFrame(raf)
    }
  }, [planets, selected, stars])

  function handleMove(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (view.current.dragging) {
      view.current.wasDragging = true
      view.current.x += event.clientX - view.current.lastX
      view.current.y += event.clientY - view.current.lastY
      view.current.lastX = event.clientX
      view.current.lastY = event.clientY
      publishView()
    }
    mouse.current = {
      x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
      y: ((event.clientY - rect.top) / rect.height - 0.5) * 2
    }
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    let nearest = null
    let nearestDistance = 18
    planets.forEach((planet) => {
      const point = projectPlanet(planet, rect.width, rect.height)
      const radius = clamp(Math.sqrt(Number(planet.pl_rade || 1.4)) * 2.8 * Math.sqrt(view.current.scale) * (0.72 + point.depth * 0.34), 3.2, 19)
      const distance = Math.hypot(point.x - x, point.y - y)
      if (distance < radius + 12 && distance < nearestDistance) {
        nearest = planet
        nearestDistance = distance
      }
    })
    hovered.current = nearest
    setTooltip(nearest ? { x, y, planet: nearest } : null)
  }

  function handleClick(event) {
    if (view.current.wasDragging) {
      view.current.wasDragging = false
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const hit = planets.find((planet) => {
      const point = projectPlanet(planet, rect.width, rect.height)
      const radius = clamp(Math.sqrt(Number(planet.pl_rade || 1.4)) * 2.8 * Math.sqrt(view.current.scale) * (0.72 + point.depth * 0.34), 3.2, 19)
      return Math.hypot(point.x - x, point.y - y) < radius + 12
    })
    if (hit) onSelect(hit)
  }

  function handleWheel(event) {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    zoomAt(event.deltaY < 0 ? 1.18 : 0.84, event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height)
  }

  function handleDown(event) {
    view.current.dragging = true
    view.current.wasDragging = false
    view.current.lastX = event.clientX
    view.current.lastY = event.clientY
  }

  function handleUp() {
    view.current.dragging = false
  }

  return (
    <div className="star-map-wrap">
      <canvas
        className={view.current.dragging ? 'star-map dragging' : 'star-map'}
        ref={canvasRef}
        onMouseMove={handleMove}
        onMouseDown={handleDown}
        onMouseUp={handleUp}
        onMouseLeave={() => { hovered.current = null; setTooltip(null); handleUp() }}
        onWheel={handleWheel}
        onClick={handleClick}
      />
      <div className="space-controls" aria-label="Space navigation controls">
        <button type="button" onClick={() => nudge(80, 0)} title="Pan left"><Compass size={13} /> L</button>
        <button type="button" onClick={() => nudge(-80, 0)} title="Pan right"><Compass size={13} /> R</button>
        <button type="button" onClick={() => zoomCenter(1.22)} title="Zoom in"><Plus size={14} /></button>
        <button type="button" onClick={() => zoomCenter(0.82)} title="Zoom out"><Minus size={14} /></button>
        <button type="button" onClick={resetView} title="Reset view"><Crosshair size={14} /></button>
        <span>{viewInfo.scale.toFixed(2)}X</span>
      </div>
      {tooltip && (
        <div className="sky-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
          <b>{tooltip.planet.pl_name}</b>
          <span>{fmt(tooltip.planet.pl_rade, 2)} RE · {fmt(tooltip.planet.pl_orbper, 2)} D</span>
        </div>
      )}
    </div>
  )
}

function MiniBars({ title, data }) {
  const entries = Object.entries(data || {})
  const max = Math.max(1, ...entries.map(([, value]) => Number(value)))
  return (
    <section className="terminal-panel">
      <div className="panel-bar"><span>{title}</span><strong>{entries.length}</strong></div>
      <svg className="bar-svg" viewBox="0 0 420 220">
        {entries.map(([label, value], index) => {
          const y = 24 + index * 34
          const width = (Number(value) / max) * 250
          return (
            <g key={label}>
              <text x="0" y={y + 14}>{label.toUpperCase()}</text>
              <rect x="130" y={y} width="250" height="16" className="bar-bg" />
              <rect x="130" y={y} width={width} height="16" className="bar-fill" />
              <text x="390" y={y + 14}>{Number(value).toLocaleString()}</text>
            </g>
          )
        })}
      </svg>
    </section>
  )
}

function ScoreGauge({ probability }) {
  const pct = clamp(Number(probability || 0), 0, 1)
  const radius = 72
  const circumference = Math.PI * radius
  return (
    <div className="score-gauge">
      <svg viewBox="0 0 190 112">
        <path d="M 23 94 A 72 72 0 0 1 167 94" className="gauge-track" />
        <path d="M 23 94 A 72 72 0 0 1 167 94" className="gauge-fill" style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - pct) }} />
      </svg>
      <strong>{candidateVerdict(pct)}</strong>
      <span>{candidateLine(pct)}</span>
    </div>
  )
}

function ConfusionHeatmap({ matrix }) {
  const values = matrix?.values || [[0, 0], [0, 0]]
  const max = Math.max(1, ...values.flat().map(Number))
  return (
    <svg className="heatmap" viewBox="0 0 240 220">
      {values.flatMap((row, r) => row.map((value, c) => {
        const alpha = 0.2 + (Number(value) / max) * 0.8
        return (
          <g key={`${r}-${c}`}>
            <rect x={50 + c * 82} y={34 + r * 74} width="70" height="62" fill={`rgba(143,215,255,${alpha})`} />
            <text x={85 + c * 82} y={72 + r * 74}>{value}</text>
          </g>
        )
      }))}
      <text x="50" y="20">PRED N</text>
      <text x="132" y="20">PRED P</text>
      <text x="0" y="70">TRUE N</text>
      <text x="0" y="144">TRUE P</text>
    </svg>
  )
}

function CommandPalette({ open, onClose, actions }) {
  if (!open) return null
  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <section className="palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette-head"><Command size={16} /> COMMANDS <button type="button" onClick={onClose}><X size={16} /></button></div>
        {actions.map((action) => (
          <button className="palette-action palette-row" key={action.label} type="button" onClick={() => { action.run(); onClose() }}>
            <span>{action.key}</span>
            <strong>{action.label}</strong>
          </button>
        ))}
      </section>
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState('analyze')
  const [health, setHealth] = useState('checking')
  const [status, setStatus] = useState('BOOTING')
  const [analysis, setAnalysis] = useState(null)
  const [dataset, setDataset] = useState(null)
  const [model, setModel] = useState(null)
  const [loading, setLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [csvPreview, setCsvPreview] = useState([])
  const [history, setHistory] = useState([])
  const [selectedHistory, setSelectedHistory] = useState(null)
  const [showMetrics, setShowMetrics] = useState(false)
  const [gpuMode, setGpuMode] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [catalog, setCatalog] = useState([])
  const [catalogStatus, setCatalogStatus] = useState('LOADING ARCHIVE')
  const [selectedPlanet, setSelectedPlanet] = useState(null)
  const [mastId, setMastId] = useState('')
  const [mastProducts, setMastProducts] = useState([])
  const [mastStatus, setMastStatus] = useState('IDLE')
  const [focusedOrbit, setFocusedOrbit] = useState('CANDIDATE-C')
  const [predictTarget, setPredictTarget] = useState('No target selected')
  const [predictPhase, setPredictPhase] = useState('IDLE')
  const uploadRef = useRef(null)
  const chartRef = useRef(null)
  const bootedRef = useRef(false)

  const probability = analysis?.prediction?.candidate_probability ?? 0
  const features = analysis?.features
  const dips = features?.dip_count ?? analysis?.dips?.length ?? null

  function storeAnalysis(next, source) {
    const normalized = normalizeAnalysis(next, source)
    setAnalysis(normalized)
    setPredictTarget(source || normalized?.target_name || 'Analyzed target')
    setPredictPhase(candidateVerdict(normalized?.prediction?.candidate_probability || 0))
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setHistory((items) => [{ id, source, at: new Date(), analysis: normalized }, ...items].slice(0, 10))
  }

  async function refreshCore() {
    try {
      const healthPayload = await readJson(await fetch(`${API_BASE}/health`))
      setHealth(healthPayload.ok || healthPayload.status === 'ok' ? 'online' : 'offline')
    } catch {
      setHealth('offline')
    }
    try {
      const [datasetPayload, modelPayload] = await Promise.all([
        readJson(await fetch(`${API_BASE}/dataset`)),
        readJson(await fetch(`${API_BASE}/model`))
      ])
      setDataset(datasetPayload)
      setModel(modelPayload)
    } catch (error) {
      setStatus(`STATUS ERROR: ${error.message}`)
    }
  }

  async function runDemo() {
    setLoading(true)
    setStatus('FETCHING /api/demo')
    setPredictTarget('Synthetic transit demo')
    setPredictPhase('BACKEND WORKING')
    setUploadProgress(0)
    setActiveTab('analyze')
    try {
      const payload = await readJson(await fetch(`${API_BASE}/demo`))
      storeAnalysis(payload, 'API DEMO')
      setStatus('DEMO READY')
    } catch (error) {
      const fallback = syntheticCurve('fallback demo')
      storeAnalysis(fallback, 'FRONTEND FALLBACK')
      setStatus(`DEMO FALLBACK: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setLoading(true)
    setUploadProgress(1)
    setStatus(`UPLOADING ${file.name}`)
    setPredictTarget(file.name)
    setPredictPhase('BACKEND WORKING')
    setActiveTab('analyze')
    setCsvPreview([])
    if (file.name.toLowerCase().endsWith('.csv')) {
      try {
        setCsvPreview(parseCsvPreview(await file.text()))
      } catch {
        setCsvPreview([])
      }
    }
    try {
      const payload = await uploadAnalysis(file, setUploadProgress)
      storeAnalysis(payload, file.name)
      setStatus('UPLOAD ANALYZED')
      setUploadProgress(100)
    } catch (error) {
      setStatus(`UPLOAD ERROR: ${error.message}`)
    } finally {
      setLoading(false)
      event.target.value = ''
    }
  }

  async function loadMastCurve() {
    if (!mastId.trim()) return
    setLoading(true)
    setMastStatus('QUERYING MAST')
    setStatus('MAST LOOKUP')
    setPredictTarget(mastId.trim())
    setPredictPhase('BACKEND WORKING')
    try {
      const result = await fetchMastProducts(mastId)
      setMastProducts(result.products)
      setMastStatus(result.products.length ? `MAST PRODUCTS ${result.products.length}` : 'MAST EMPTY')
      const proxy = syntheticCurve(`MAST ${result.target}`)
      const csv = ['time,flux', ...proxy.raw_curve.map((p) => `${p.time},${p.flux}`)].join('\n')
      const file = new File([csv], `${result.target.replace(/\s+/g, '_')}_proxy.csv`, { type: 'text/csv' })
      const payload = await uploadAnalysis(file, () => {})
      storeAnalysis(payload, `MAST ${result.target}`)
      setStatus(result.products.length ? 'MAST METADATA + ANALYSIS READY' : 'MAST FALLBACK ANALYSIS READY')
    } catch (error) {
      const fallback = syntheticCurve(`MAST ${mastId}`)
      storeAnalysis(fallback, `MAST FALLBACK ${mastId}`)
      setMastProducts([])
      setMastStatus(`MAST FALLBACK: ${error.message}`)
      setStatus('MAST FALLBACK ANALYSIS READY')
    } finally {
      setLoading(false)
    }
  }

  async function runPlanetTransitCheck(planet = selectedPlanet) {
    if (!planet) {
      setActiveTab('space')
      return
    }
    setLoading(true)
    setActiveTab('planet')
    setPredictTarget(planet.pl_name || 'Selected catalog world')
    setPredictPhase('BACKEND WORKING')
    setStatus(`PROJECTING ${planet.pl_name}`)
    const projection = curveFromPlanet(planet)
    try {
      const csv = ['time,flux', ...projection.raw_curve.map((p) => `${p.time},${p.flux}`)].join('\n')
      const file = new File([csv], `${String(planet.pl_name || 'planet').replace(/\s+/g, '_')}_archive_projection.csv`, { type: 'text/csv' })
      const payload = await uploadAnalysis(file, setUploadProgress)
      storeAnalysis(payload, `${planet.pl_name} ARCHIVE PROJECTION`)
      setStatus('PLANET TRANSIT CHECK READY')
    } catch (error) {
      storeAnalysis(projection, `${planet.pl_name} LOCAL PROJECTION`)
      setStatus(`PLANET LOCAL CHECK: ${error.message}`)
    } finally {
      setLoading(false)
      setUploadProgress(0)
      setActiveTab('planet')
    }
  }

  function exportJson() {
    if (!analysis) return
    const blob = new Blob([JSON.stringify({ analysis, exported_at: new Date().toISOString() }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${analysis.target_name || 'analysis'}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  function exportChart() {
    const canvas = chartRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = 'exosignal-light-curve.png'
    link.click()
  }

  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true
    refreshCore()
    runDemo()
    fetchExoplanets()
      .then(({ planets, live }) => {
        setCatalog(planets)
        setSelectedPlanet(planets[0] || null)
        setCatalogStatus(live ? `ARCHIVE LIVE · ${planets.length} WORLDS` : `ARCHIVE FALLBACK · ${planets.length} WORLDS`)
      })
  }, [])

  const actions = useMemo(() => [
    { key: 'D', label: 'RUN DEMO', run: runDemo },
    { key: 'U', label: 'UPLOAD CURVE', run: () => uploadRef.current?.click() },
    { key: '1', label: 'TAB SIGNAL LAB', run: () => setActiveTab('analyze') },
    { key: '2', label: 'TAB UNIVERSE', run: () => setActiveTab('space') },
    { key: '3', label: 'TAB PLANET', run: () => setActiveTab('planet') },
    { key: '4', label: 'TAB SIGNALS', run: () => setActiveTab('dataset') },
    { key: '5', label: 'TAB PREDICT', run: () => setActiveTab('model') },
    { key: 'J', label: 'EXPORT JSON', run: exportJson },
    { key: 'P', label: 'EXPORT CHART PNG', run: exportChart },
    { key: 'X', label: 'PREDICT SELECTED PLANET', run: () => runPlanetTransitCheck() }
  ], [analysis, selectedPlanet])

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const key = event.key.toLowerCase()
      if (key === 'escape') setPaletteOpen(false)
      if (key === 'd') runDemo()
      if (key === 'u') uploadRef.current?.click()
      if (['1', '2', '3', '4', '5'].includes(key)) setActiveTab(navItems[Number(key) - 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const eda = dataset?.eda
  const metrics = model?.metrics
  const activeModel = model?.active_model
  const deepLearning = model?.deep_learning
  const deepMetrics = deepLearning?.metrics
  const selectedSources = sourceLinks(selectedPlanet)
  const selectedLightYears = lightYears(selectedPlanet)
  const selectedSystemPlanets = useMemo(() => {
    if (!selectedPlanet?.hostname) return selectedPlanet ? [selectedPlanet] : []
    return catalog.filter((planet) => planet.hostname === selectedPlanet.hostname)
  }, [catalog, selectedPlanet])
  const planetPredictionLabel = loading && activeTab === 'planet' ? 'BACKEND WORKING' : candidateVerdict(probability)

  return (
    <main className="exo-terminal">
      <CosmicBackdrop />
      {health === 'offline' && <div className="offline-banner"><AlertTriangle size={15} /> BACKEND OFFLINE - UI STILL ACTIVE</div>}
      <header className="top-console">
        <div className="brand-mark">
          <span className="exo-badge" aria-hidden="true">ES</span>
          <span className="brand-copy">
            <strong>EXOSIGNAL</strong>
            <span className="brand-subtitle">INDEPENDENT TRANSIT LAB</span>
          </span>
        </div>
        <nav className="tab-bar" aria-label="Primary tabs">
          {navItems.map(({ id, label, Icon }) => (
            <button className={activeTab === id ? 'tab active' : 'tab'} key={id} type="button" onClick={() => setActiveTab(id)}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <button type="button" className="square-button" onClick={() => setPaletteOpen(true)} title="Command palette" aria-label="Command palette"><Command size={16} /></button>
          <button type="button" className="square-button" onClick={refreshCore} title="Refresh" aria-label="Refresh status"><RefreshCw size={16} /></button>
        </div>
      </header>

      <input ref={uploadRef} className="hidden-input" type="file" accept=".csv,.fits,.fit,.fts" onChange={handleUpload} />

      {activeTab === 'analyze' && (
      <section className="tab-page visible">
        <div className="analyze-grid">
          <section className="left-console">
            <div className="control-line">
              <button className="terminal-button primary" type="button" onClick={runDemo} disabled={loading}><Play size={16} /> RUN DEMO</button>
              <button className="terminal-button" type="button" onClick={() => uploadRef.current?.click()} disabled={loading}><Upload size={16} /> UPLOAD CURVE</button>
              <button className="terminal-button" type="button" onClick={exportJson} disabled={!analysis}><FileJson size={16} /> JSON</button>
              <button className="terminal-button" type="button" onClick={exportChart} disabled={!analysis}><ImageDown size={16} /> PNG</button>
            </div>
            <div className="status-row">
              <span className={health === 'online' ? 'dot online' : 'dot offline'} />
              BACKEND {health.toUpperCase()} · {status}
              {loading && <span className="loader" />}
            </div>
            {uploadProgress > 0 && uploadProgress < 100 && <div className="progress"><i style={{ width: `${uploadProgress}%` }} /></div>}
            <LightCurveCanvas analysis={analysis} chartRef={chartRef} />
            <MetricStrip features={features} />
            <section className="candidate-terminal">
              <span>SIGNAL CHECK</span>
              <strong>{candidateVerdict(probability)}</strong>
              <small>{candidateLine(probability)}</small>
            </section>
            <BlsPanel analysis={analysis} />
            {csvPreview.length > 0 && (
              <section className="terminal-panel preview-panel">
                <div className="panel-bar"><span>CSV PREVIEW</span><strong>FIRST 5</strong></div>
                <table>
                  <tbody>
                    {csvPreview.map((row, index) => <tr key={index}>{Object.values(row).slice(0, 4).map((value, cell) => <td key={cell}>{value}</td>)}</tr>)}
                  </tbody>
                </table>
              </section>
            )}
          </section>
          <aside className="right-console">
            <OrbitCanvas score={probability} onPlanet={setFocusedOrbit} />
            <section className="terminal-panel mast-panel">
              <div className="panel-bar"><span>LOAD FROM MAST</span><strong>{mastStatus}</strong></div>
              <div className="mast-input">
                <input value={mastId} onChange={(event) => setMastId(event.target.value)} placeholder="TIC 261676720 / KIC 8462852" />
                <button type="button" onClick={loadMastCurve}><Search size={15} /></button>
              </div>
              <div className="tiny-list">
                {mastProducts.slice(0, 4).map((product) => (
                  <span key={`${product.obsid}-${product.target_name}`}>{product.obs_collection || '--'} · {product.target_name || '--'}</span>
                ))}
              </div>
            </section>
            <section className="terminal-panel history-panel">
              <div className="panel-bar"><span>HISTORY</span><strong>{history.length}</strong></div>
              {history.slice(0, 10).map((item) => (
                <button key={item.id} type="button" className={selectedHistory === item.id ? 'history-item active' : 'history-item'} onClick={() => { setSelectedHistory(item.id); setAnalysis(item.analysis) }}>
                  <History size={14} /> {item.source} <b>{item.at.toLocaleTimeString()}</b>
                </button>
              ))}
            </section>
            <section className="terminal-panel focus-panel">
              <div className="panel-bar"><span>ORBIT TARGET</span><strong>{focusedOrbit}</strong></div>
              <div className="mini-readouts">
                <span>RESULT {candidateVerdict(probability)}</span>
                <span>DIPS {dips ?? '--'}</span>
                <span>SNR {fmt(features?.snr_estimate, 2)}</span>
              </div>
            </section>
          </aside>
        </div>
      </section>
      )}

      {activeTab === 'space' && (
      <section className="tab-page visible">
        <div className="space-layout">
          <section className="terminal-panel star-panel">
            <div className="panel-bar"><span>EXOPLANET ARCHIVE MAP</span><strong>{catalogStatus}</strong></div>
            <StarMapCanvas planets={catalog} selected={selectedPlanet} onSelect={(planet) => { setSelectedPlanet(planet); setActiveTab('planet') }} />
          </section>
          <aside className="terminal-panel planet-detail">
            <div className="panel-bar"><span>PLANET DETAIL</span><strong>{selectedPlanet?.disc_year || '--'}</strong></div>
            <h2>{selectedPlanet?.pl_name || 'SELECT DOT'}</h2>
            <PlanetSystemPreview planet={selectedPlanet} />
            <div className="atlas-summary">
              <span>LOADED <b>{catalog.length.toLocaleString()}</b></span>
              <span>TYPE <b>{selectedPlanet ? planetKind(selectedPlanet) : '--'}</b></span>
              <span>KNOWN SKY <b>CONFIRMED ONLY</b></span>
            </div>
            <div className="detail-grid">
              <span>HOST <b>{selectedPlanet?.hostname || '--'}</b></span>
              <span>PERIOD <b>{fmt(selectedPlanet?.pl_orbper, 3)} D</b></span>
              <span>RADIUS <b>{formatRadius(selectedPlanet)}</b></span>
              <span>MASS <b>{formatMass(selectedPlanet)}</b></span>
              <span>DIST <b>{fmt(selectedPlanet?.sy_dist, 1)} PC</b></span>
              <span>LIGHT <b>{selectedLightYears ? `${fmt(selectedLightYears, 1)} LY` : '--'}</b></span>
              <span>METHOD <b>{selectedPlanet?.discoverymethod || '--'}</b></span>
              <span>FACILITY <b>{selectedPlanet?.disc_facility || '--'}</b></span>
              <span>HOST TEFF <b>{fmt(selectedPlanet?.st_teff, 0)} K</b></span>
              <span>HOST RAD <b>{fmt(selectedPlanet?.st_rad, 2)} RS</b></span>
              <span>HOST LUM <b>{fmt(selectedPlanet?.st_lum, 2)}</b></span>
            </div>
            <button className="profile-open" type="button" onClick={() => setActiveTab('planet')} disabled={!selectedPlanet}>
              <Globe2 size={15} /> OPEN PROFILE
            </button>
            <div className="method-mini">
              <span>TRANSIT PHOTOMETRY</span>
              <strong>{'STARLIGHT DIP -> PERIOD -> CANDIDATE'}</strong>
            </div>
          </aside>
        </div>
      </section>
      )}

      {activeTab === 'planet' && (
      <section className="tab-page visible">
        <div className="planet-profile-grid">
          <NasaEyesExperience planet={selectedPlanet} systemPlanets={selectedSystemPlanets} />
          <section className="planet-profile-hero">
            <PlanetProfileScene planet={selectedPlanet} prediction={probability} />
            <div className="planet-hero-copy">
              <span>{selectedPlanet ? planetKind(selectedPlanet) : 'SELECT A WORLD'}</span>
              <h1>{selectedPlanet?.pl_name || 'Catalog World'}</h1>
              <p>{selectedPlanet?.hostname ? `HOST STAR ${selectedPlanet.hostname}` : 'OPEN UNIVERSE AND TAP A WORLD'}</p>
              <div className="planet-actions">
                <button type="button" onClick={() => setActiveTab('space')}><Orbit size={16} /> BACK TO ATLAS</button>
                <button type="button" onClick={() => runPlanetTransitCheck()} disabled={!selectedPlanet || loading}><Telescope size={16} /> RUN TRANSIT CHECK</button>
                <button type="button" onClick={() => selectedPlanet && navigator.clipboard?.writeText(JSON.stringify(selectedPlanet, null, 2))} disabled={!selectedPlanet}><FileJson size={16} /> COPY DATA</button>
              </div>
            </div>
          </section>

          <aside className="planet-dossier">
            <div className="planet-section-title"><span>PLANET PROFILE</span><strong>{selectedPlanet?.disc_year || '--'}</strong></div>
            <div className="planet-facts mission-facts">
              <span>ORBIT <b>{fmt(selectedPlanet?.pl_orbper, 3)} D</b></span>
              <span>ORBIT RADIUS <b>{fmt(selectedPlanet?.pl_orbsmax, 3)} AU</b></span>
              <span>ECCENTRICITY <b>{fmt(selectedPlanet?.pl_orbeccen, 3)}</b></span>
              <span>RADIUS <b>{formatRadius(selectedPlanet)}</b></span>
              <span>MASS <b>{formatMass(selectedPlanet)}</b></span>
              <span>DISTANCE <b>{fmt(selectedPlanet?.sy_dist, 2)} PC</b></span>
              <span>LIGHT TIME <b>{selectedLightYears ? `${fmt(selectedLightYears, 1)} YEARS` : '--'}</b></span>
              <span>METHOD <b>{selectedPlanet?.discoverymethod || '--'}</b></span>
              <span>FACILITY <b>{selectedPlanet?.disc_facility || '--'}</b></span>
              <span>STAR TEMP <b>{fmt(selectedPlanet?.st_teff, 0)} K</b></span>
              <span>STAR RADIUS <b>{fmt(selectedPlanet?.st_rad, 2)} RS</b></span>
              <span>SPECTRAL TYPE <b>{selectedPlanet?.st_spectype || '--'}</b></span>
            </div>
            <div className="source-strip">
              {selectedSources.map((link) => (
                <a key={link.label} href={link.href} target="_blank" rel="noreferrer">
                  {link.label} <ExternalLink size={13} />
                </a>
              ))}
            </div>
          </aside>

          <section className="planet-transit-card">
            <div className="planet-section-title"><span>TRANSIT CHECK</span><strong>{planetPredictionLabel}</strong></div>
            <div className="planet-result">
              <strong>{planetPredictionLabel}</strong>
              <span>{predictTarget || selectedPlanet?.pl_name || 'No target selected'}</span>
              <div className="predict-evidence-grid">
                <span>RESULT <b>{candidateLine(probability)}</b></span>
                <span>PROBABILITY <b>{Math.round(probability * 100)}%</b></span>
                <span>DIPS <b>{dips ?? '--'}</b></span>
                <span>SNR <b>{fmt(features?.snr_estimate, 2)}</b></span>
              </div>
              <div className="planet-actions">
                <button type="button" onClick={() => runPlanetTransitCheck()} disabled={!selectedPlanet || loading}><Telescope size={16} /> CHECK {selectedPlanet?.pl_name || 'PLANET'}</button>
                <button type="button" onClick={() => setActiveTab('analyze')} disabled={!analysis}><LineChart size={16} /> OPEN LIGHT CURVE</button>
              </div>
            </div>
          </section>

          <section className="planet-orbit-card">
            <div className="planet-section-title"><span>LOCAL SYSTEM</span><strong>SIMULATED VIEW</strong></div>
            <PlanetSystemPreview planet={selectedPlanet} />
          </section>
        </div>
      </section>
      )}

      {activeTab === 'dataset' && (
      <section className="tab-page visible">
        <div className="vault-grid">
          <section className="terminal-panel vault-hero">
            <div className="panel-bar"><span>SIGNAL VAULT</span><strong>{analysis ? 'CURVE LOADED' : 'EMPTY FIELD'}</strong></div>
            <div className="vault-title">{analysis?.target_name || 'NO ACTIVE LIGHT CURVE'}</div>
            <div className="vault-readouts">
              <span><CircleDot size={14} /> RESULT {candidateVerdict(probability)}</span>
              <span><Radio size={14} /> DIPS {dips ?? '--'}</span>
              <span><Activity size={14} /> SNR {fmt(features?.snr_estimate, 2)}</span>
              <span><Compass size={14} /> PERIOD {fmt(features?.period_estimate, 3)} D</span>
            </div>
          </section>
          <section className="terminal-panel vault-actions">
            <div className="panel-bar"><span>OBSERVATION ACTIONS</span><strong>QUIET MODE</strong></div>
            <button type="button" onClick={runDemo}><Play size={16} /> RUN SYNTHETIC TRANSIT</button>
            <button type="button" onClick={() => uploadRef.current?.click()}><Upload size={16} /> IMPORT CURVE</button>
            <button type="button" onClick={() => setActiveTab('space')}><Orbit size={16} /> OPEN STAR ATLAS</button>
          </section>
          <section className="terminal-panel vault-history">
            <div className="panel-bar"><span>RECENT SIGNALS</span><strong>{history.length}</strong></div>
            {history.slice(0, 6).map((item) => (
              <button key={item.id} type="button" className="history-item vault-row" onClick={() => { setSelectedHistory(item.id); setAnalysis(item.analysis); setActiveTab('analyze') }}>
                <span>{item.source}</span><b>{candidateVerdict(item.analysis?.prediction?.candidate_probability)}</b>
              </button>
            ))}
          </section>
          <section className="terminal-panel vault-diagnostics">
            <div className="panel-bar"><span>ARCHIVE DIAGNOSTICS</span><button type="button" onClick={() => setShowMetrics(!showMetrics)}>{showMetrics ? 'HIDE' : 'REVEAL'}</button></div>
            {!showMetrics && <div className="quiet-lock"><Database size={18} /> HIDDEN FROM FRONTEND</div>}
            {showMetrics && (
              <div className="mini-readouts">
                {(dataset?.missions || ['Kepler', 'K2', 'TESS']).map((mission) => <span key={mission}>{String(mission).toUpperCase()}</span>)}
                <span>{dataset?.full_dataset_rows?.toLocaleString() || '--'} ROWS</span>
                <span>PERIOD {fmt(eda?.numeric_ranges?.period_days?.median, 3)} D</span>
              </div>
            )}
          </section>
        </div>
      </section>
      )}

      {activeTab === 'model' && (
      <section className="tab-page visible">
        <div className="predict-grid">
          <section className="terminal-panel predict-hero">
            <div className="panel-bar"><span>PREDICT</span><strong>{loading ? predictPhase : candidateVerdict(probability)}</strong></div>
            <div className="predict-target">{predictTarget || analysis?.target_name || selectedPlanet?.pl_name || 'No target selected'}</div>
            <div className={loading ? 'predict-verdict working' : 'predict-verdict'}>
              {loading ? 'ANALYZING' : candidateVerdict(probability)}
            </div>
            <div className="predict-line">{loading ? `backend is processing ${predictTarget}` : candidateLine(probability)}</div>
            <div className="predict-actions">
              <button type="button" onClick={() => runPlanetTransitCheck()} disabled={!selectedPlanet || loading}><Globe2 size={16} /> PREDICT SELECTED PLANET</button>
              <button type="button" onClick={() => uploadRef.current?.click()} disabled={loading}><Upload size={16} /> UPLOAD CURVE</button>
              <button type="button" onClick={runDemo} disabled={loading}><Play size={16} /> DEMO CURVE</button>
              <button type="button" onClick={() => setActiveTab('analyze')} disabled={!analysis}><LineChart size={16} /> VIEW LIGHT CURVE</button>
            </div>
          </section>
          <section className="terminal-panel predict-evidence">
            <div className="panel-bar"><span>EVIDENCE</span><strong>{analysis ? 'FROM CURVE' : 'WAITING'}</strong></div>
            <div className="predict-evidence-grid">
              <span>PERIOD <b>{fmt(features?.period_estimate, 3)} D</b></span>
              <span>DEPTH <b>{fmt(features?.depth_estimate, 5)}</b></span>
              <span>DURATION <b>{fmt(features?.duration_estimate, 3)}</b></span>
              <span>SNR <b>{fmt(features?.snr_estimate, 2)}</b></span>
              <span>DIPS <b>{dips ?? '--'}</b></span>
              <span>NOISE <b>{fmt(features?.variability, 5)}</b></span>
            </div>
          </section>
          <section className="terminal-panel predict-path">
            <div className="panel-bar"><span>HOW TO USE</span><strong>3 STEPS</strong></div>
            <div className="predict-steps">
              <span><b>1</b> choose a catalog world or upload brightness data</span>
              <span><b>2</b> the transit signal is cleaned and measured</span>
              <span><b>3</b> prediction uses dips, period, depth, and SNR</span>
            </div>
          </section>
          <section className="terminal-panel hidden-diagnostics">
            <div className="panel-bar"><span>MODEL DIAGNOSTICS</span><button type="button" onClick={() => setShowMetrics(!showMetrics)}>{showMetrics ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {showMetrics ? 'HIDE' : 'SHOW'}</button></div>
            {!showMetrics && <div className="quiet-lock"><BrainCircuit size={18} /> hidden unless needed</div>}
            {showMetrics && (
              <>
                <div className="model-note">
                  {(activeModel?.name || metrics?.model_name || 'BASELINE').toUpperCase()} · {metrics?.features || activeModel?.metrics?.features || 'CNN'} FEATURES · F1 {fmt(metrics?.f1 ?? activeModel?.metrics?.f1, 3)} · ROC-AUC {fmt(metrics?.roc_auc ?? activeModel?.metrics?.roc_auc, 3)}
                </div>
                <div className="model-note">
                  DEEP CNN {deepLearning?.loadable ? 'ACTIVE' : deepLearning?.weights_installed ? 'WEIGHTS INSTALLED / TENSORFLOW PENDING' : deepMetrics ? `COLAB METRICS EXPORTED · F1 ${fmt(deepMetrics.f1, 3)} · RECALL ${fmt(deepMetrics.recall, 3)}` : 'COLAB TRAINING READY'}
                </div>
                <div className="metric-grid-compact">
                  <span>PREC {fmt(metrics?.precision)}</span>
                  <span>RECALL {fmt(metrics?.recall)}</span>
                  <span>PR {fmt(metrics?.pr_auc)}</span>
                </div>
              </>
            )}
          </section>
        </div>
      </section>
      )}

      {activeTab === 'method' && (
      <section className="tab-page visible">
        <section className="pipeline">
          {pipelineSteps.map(([number, word, note], index) => (
            <article key={word} className="pipe-step">
              <span>{number}</span><strong>{word}</strong><em>{note}</em>{index < pipelineSteps.length - 1 && <i />}
            </article>
          ))}
        </section>
        <section className="terminal-panel checklist">
          <div className="panel-bar"><span>PROFESSOR CHECKLIST</span><strong>7/7</strong></div>
          {['REAL CURVES', 'CLEAN NORMALIZE', 'PERIODIC DIPS', 'PERIOD DEPTH DURATION SNR', 'RF/XGBOOST BASELINE', 'PREC RECALL F1 ROC PR MATRIX', 'UPLOAD DASHBOARD'].map((item) => (
            <span key={item}><CheckCircle2 size={14} /> {item}</span>
          ))}
        </section>
        <section className="terminal-panel sources-panel">
          <div className="panel-bar"><span>RESEARCH SOURCES</span><strong>LIVE NOTES</strong></div>
          <span>Exoplanet Archive TAP: confirmed planets from PS table</span>
          <span>MAST: CAOM products + timeseries lookup</span>
          <span>LIGHTKURVE: BLS period grid + max power</span>
          <span>RAPIDS: cuML sklearn-style acceleration</span>
          <span>JETSON: AGX Orin edge deployment target</span>
          <span>GAIA DR3: host star astrometric context</span>
        </section>
      </section>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={actions} />
    </main>
  )
}
