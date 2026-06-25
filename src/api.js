const API_BASE = '/api'

async function readJson(response) {
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed with ${response.status}`)
  }
  return response.json()
}

export async function getDatasetStatus() {
  return readJson(await fetch(`${API_BASE}/dataset`))
}

export async function getModelStatus() {
  return readJson(await fetch(`${API_BASE}/model`))
}

export async function getDemoAnalysis() {
  return readJson(await fetch(`${API_BASE}/demo`))
}

export async function analyzeFile(file) {
  const form = new FormData()
  form.append('file', file)
  return readJson(await fetch(`${API_BASE}/analyze`, { method: 'POST', body: form }))
}

export async function startTraining(maxRows = 6000) {
  return readJson(await fetch(`${API_BASE}/train?max_rows=${maxRows}`, { method: 'POST' }))
}

