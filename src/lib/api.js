import { PYTHON_BACKEND_URL } from './supabase'

// The Python backend (Render, free tier) can cold-start, so give it a
// generous timeout and let callers retry once if the first attempt times out.
async function fetchWithTimeout(url, opts = {}, timeoutMs = 45000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function getJson(url, { timeoutMs = 45000, retryOnColdStart = true } = {}) {
  let res
  try {
    res = await fetchWithTimeout(url, {}, timeoutMs)
  } catch (err) {
    if (retryOnColdStart && err.name === 'AbortError') {
      // Backend was likely asleep (Render free tier) — wait and retry once.
      await new Promise(r => setTimeout(r, 4000))
      res = await fetchWithTimeout(url, {}, timeoutMs)
    } else {
      throw new Error(err.name === 'AbortError' ? 'Request timed out — backend may be waking up, try again' : (err.message || 'Network error'))
    }
  }
  let json
  try {
    json = await res.json()
  } catch {
    throw new Error(`Backend returned an invalid response (HTTP ${res.status})`)
  }
  if (!res.ok) {
    throw new Error(json.error || `HTTP ${res.status}`)
  }
  return json
}

/** GET /api/internships — returns array of internship listings */
export async function fetchInternships(forceRefresh = false) {
  if (!PYTHON_BACKEND_URL) throw new Error('VITE_PYTHON_BACKEND_URL is not set')
  const url = `${PYTHON_BACKEND_URL}/api/internships${forceRefresh ? '?refresh=true' : ''}`
  const json = await getJson(url)
  return json.data || []
}

/** GET /api/placements — returns array of placement/job listings */
export async function fetchPlacements(forceRefresh = false) {
  if (!PYTHON_BACKEND_URL) throw new Error('VITE_PYTHON_BACKEND_URL is not set')
  const url = `${PYTHON_BACKEND_URL}/api/placements${forceRefresh ? '?refresh=true' : ''}`
  const json = await getJson(url)
  return json.data || []
}

const DSA_PLATFORMS = ['leetcode', 'codeforces', 'codechef', 'gfg', 'hackerrank', 'github']

/** GET /api/<platform>/<username> — returns that platform's profile stats */
export async function fetchCodingProfile(platform, username) {
  if (!PYTHON_BACKEND_URL) throw new Error('VITE_PYTHON_BACKEND_URL is not set')
  if (!DSA_PLATFORMS.includes(platform)) throw new Error(`Unknown platform: ${platform}`)
  const u = (username || '').trim()
  if (!u) throw new Error('username is required')
  const url = `${PYTHON_BACKEND_URL}/api/${platform}/${encodeURIComponent(u)}`
  return getJson(url, { timeoutMs: 20000 })
}

export { DSA_PLATFORMS }
