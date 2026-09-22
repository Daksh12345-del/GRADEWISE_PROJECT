import { PYTHON_BACKEND_URL } from './supabase'
import { getClerkUserId } from './clerkUser'

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

async function postJson(url, body, { timeoutMs = 15000 } = {}) {
  let res
  try {
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, timeoutMs)
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'Request timed out, please try again' : (err.message || 'Network error'))
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

/**
 * POST /api/quick-apply — saves a Quick Apply lead (applicant details for
 * one internship/placement listing) to the backend. Backend contract
 * (finalize once the actual backend is wired up):
 *   Request body: {
 *     user_id, item_unique_id, item_type, item_title, item_company,
 *     applicant_name, applicant_email, applicant_phone,
 *     applicant_degree, resume_link
 *   }
 *   Response: { success: true } on success, or { error: "..." } with a
 *   non-2xx status on failure.
 */
export async function submitQuickApply(payload) {
  if (!PYTHON_BACKEND_URL) throw new Error('VITE_PYTHON_BACKEND_URL is not set')
  const url = `${PYTHON_BACKEND_URL}/api/quick-apply`
  return postJson(url, { user_id: getClerkUserId(), ...payload })
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

/** GET /api/contests/upcoming — real upcoming Codeforces + LeetCode contests */
export async function fetchUpcomingContests() {
  if (!PYTHON_BACKEND_URL) throw new Error('VITE_PYTHON_BACKEND_URL is not set')
  const url = `${PYTHON_BACKEND_URL}/api/contests/upcoming`
  return getJson(url, { timeoutMs: 20000 })
}

// ── AI Career Coach (real Groq completions, see app/ai/coach.py) ────────
/** POST /api/ai/explain — 2-3 line explanation of a subject/topic.
 * Pass detail=true for a proper, deeper teach-me walkthrough instead of
 * the quick summary (uses a bigger model server-side). */
export async function fetchAiExplain(topic, detail = false) {
  if (!PYTHON_BACKEND_URL) throw new Error('VITE_PYTHON_BACKEND_URL is not set')
  const url = `${PYTHON_BACKEND_URL}/api/ai/explain`
  const data = await postJson(url, { topic, detail }, { timeoutMs: 60000 })
  return data.explanation
}

/** POST /api/ai/dsa-roadmap — short prioritized DSA roadmap, optionally
 * personalized with the student's own weak-topic list. */
export async function fetchAiDsaRoadmap(level, weakTopics = []) {
  if (!PYTHON_BACKEND_URL) throw new Error('VITE_PYTHON_BACKEND_URL is not set')
  const url = `${PYTHON_BACKEND_URL}/api/ai/dsa-roadmap`
  const data = await postJson(url, { level, weakTopics }, { timeoutMs: 30000 })
  return data.roadmap
}

/** POST /api/ai/ask — "Ask GradeWallah AI": a free-form question, answered
 * grounded in the student's real, already-known data (context). context
 * fields are all optional — omit any the caller doesn't have. */
export async function fetchAskCoach(question, context = {}) {
  if (!PYTHON_BACKEND_URL) throw new Error('VITE_PYTHON_BACKEND_URL is not set')
  const url = `${PYTHON_BACKEND_URL}/api/ai/ask`
  const data = await postJson(url, { question, context }, { timeoutMs: 30000 })
  return data.answer
}

/** POST /api/ai/transcribe — voice input for the mic button. Sends a
 * recorded audio Blob (from MediaRecorder) to our own backend, which
 * forwards it to Groq's Whisper endpoint (see app/ai/coach.py) — kept on
 * the same Groq account as the rest of the AI Coach rather than a second
 * provider. Returns the transcribed text. */
// ── Personal Tuition ──────────────────────────────────────────────────────
// Book a real 1:1 session with a tutor listed on the platform: browse
// approved teachers → pick an open slot → pay via Razorpay → get an
// auto-generated Google Meet link. See gradewise-backend/app/tuition.py
// and app/main.py's "Personal Tuition" section for the backend side.

/** POST /api/tuition/apply — apply to become a tutor (starts pending until an admin approves) */
export async function applyAsTutor(payload) {
  if (!PYTHON_BACKEND_URL) throw new Error('VITE_PYTHON_BACKEND_URL is not set')
  return postJson(`${PYTHON_BACKEND_URL}/api/tuition/apply`, payload)
}

/** GET /api/tuition/tutors?subject= — browse approved tutors, optionally filtered by subject */
export async function fetchTutors(subject = '') {
  if (!PYTHON_BACKEND_URL) throw new Error('VITE_PYTHON_BACKEND_URL is not set')
  const url = `${PYTHON_BACKEND_URL}/api/tuition/tutors${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`
  const json = await getJson(url)
  return json.data || []
}

/** GET /api/tuition/tutors/{id}/slots — a tutor's open, future time slots */
export async function fetchTutorSlots(teacherId) {
  if (!PYTHON_BACKEND_URL) throw new Error('VITE_PYTHON_BACKEND_URL is not set')
  const json = await getJson(`${PYTHON_BACKEND_URL}/api/tuition/tutors/${teacherId}/slots`)
  return json.data || []
}

/** POST /api/tuition/tutors/{id}/slots — a tutor opens up one bookable slot */
export async function addTutorSlot(teacherId, payload) {
  if (!PYTHON_BACKEND_URL) throw new Error('VITE_PYTHON_BACKEND_URL is not set')
  return postJson(`${PYTHON_BACKEND_URL}/api/tuition/tutors/${teacherId}/slots`, payload)
}

/** POST /api/tuition/bookings — reserves the slot + opens a Razorpay order.
 * Returns { booking_id, razorpay_order_id, razorpay_key_id, amount_paise, currency }. */
export async function createTuitionBooking(payload) {
  if (!PYTHON_BACKEND_URL) throw new Error('VITE_PYTHON_BACKEND_URL is not set')
  return postJson(`${PYTHON_BACKEND_URL}/api/tuition/bookings`, payload)
}

/** POST /api/tuition/bookings/verify — confirms the booking after Razorpay Checkout succeeds */
export async function verifyTuitionPayment(payload) {
  if (!PYTHON_BACKEND_URL) throw new Error('VITE_PYTHON_BACKEND_URL is not set')
  return postJson(`${PYTHON_BACKEND_URL}/api/tuition/bookings/verify`, payload)
}

/** GET /api/tuition/bookings/mine?user_id= — the current student's bookings */
export async function fetchMyTuitionBookings(userId) {
  if (!PYTHON_BACKEND_URL) throw new Error('VITE_PYTHON_BACKEND_URL is not set')
  const json = await getJson(`${PYTHON_BACKEND_URL}/api/tuition/bookings/mine?user_id=${encodeURIComponent(userId)}`)
  return json.data || []
}

/** GET /api/tuition/teacher/dashboard?user_id= — the current tutor's profile + slots + bookings */
export async function fetchTutorDashboard(userId) {
  if (!PYTHON_BACKEND_URL) throw new Error('VITE_PYTHON_BACKEND_URL is not set')
  return getJson(`${PYTHON_BACKEND_URL}/api/tuition/teacher/dashboard?user_id=${encodeURIComponent(userId)}`)
}

/** POST /api/tuition/bookings/{id}/review — rate + review a completed session */
export async function submitTutorReview(bookingId, payload) {
  if (!PYTHON_BACKEND_URL) throw new Error('VITE_PYTHON_BACKEND_URL is not set')
  return postJson(`${PYTHON_BACKEND_URL}/api/tuition/bookings/${bookingId}/review`, payload)
}

/** Loads the Razorpay Checkout script on demand (not on every page load). */
let _razorpayScriptPromise = null
export function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve()
  if (_razorpayScriptPromise) return _razorpayScriptPromise
  _razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load Razorpay checkout — check your connection'))
    document.body.appendChild(script)
  })
  return _razorpayScriptPromise
}

/** GET /api/tuition/bookings/{id}/join?user_id= — mints a fresh, time-boxed
 * join link right when someone clicks Join (not fetched/stored earlier).
 *
 * GRACE PERIOD FEATURE:
 * - Teachers can join up to 15 minutes after the scheduled start time
 * - If a teacher joins late (e.g., 10 min after scheduled start), the session
 *   duration is adjusted: it runs from join time until the original end time
 * - Example: Slot 4:30-5:30 PM, teacher joins at 4:40 PM → session runs 4:40-5:30 PM (50 min)
 * - The backend should validate the grace period and track actual join time
 * - Frontend shows countdown and adjusts UI based on grace period status
 */
export async function fetchTuitionJoinLink(bookingId, userId) {
  if (!PYTHON_BACKEND_URL) throw new Error('VITE_PYTHON_BACKEND_URL is not set')
  return getJson(`${PYTHON_BACKEND_URL}/api/tuition/bookings/${bookingId}/join?user_id=${encodeURIComponent(userId)}`)
}

export async function fetchTranscribeAudio(audioBlob) {
  if (!PYTHON_BACKEND_URL) throw new Error('VITE_PYTHON_BACKEND_URL is not set')
  const url = `${PYTHON_BACKEND_URL}/api/ai/transcribe`
  const form = new FormData()
  const ext = audioBlob.type.includes('mp4') ? 'mp4' : audioBlob.type.includes('ogg') ? 'ogg' : 'webm'
  form.append('file', audioBlob, `voice-input.${ext}`)
  let res
  try {
    res = await fetchWithTimeout(url, { method: 'POST', body: form }, 30000)
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'Voice input timed out, please try again' : (err.message || 'Network error'))
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
  return json.text
}

// ── Resume Checker ──────────────────────────────────────────────────────
// ATS-style resume score + skill extraction + live internship/placement
// matching. See gradewise-backend/app/ai/resume.py and app/main.py's
// "Resume Checker" section. Every re-upload overwrites the student's
// single saved row (keyed by user_id), so the score and matched
// internships always reflect the LATEST resume, not a stale first upload.

/** POST /api/resume/analyze — upload a PDF/DOCX resume, get back the ATS
 * score breakdown, detected skills, strengths/improvements, and the top
 * matching live internships/placements. Also persists the result server-side
 * so fetchMyResumeScore() can show it on the Dashboard without re-uploading. */
export async function analyzeResume(file, userId) {
  if (!PYTHON_BACKEND_URL) throw new Error('VITE_PYTHON_BACKEND_URL is not set')
  if (!userId) throw new Error('Not signed in')
  const url = `${PYTHON_BACKEND_URL}/api/resume/analyze?user_id=${encodeURIComponent(userId)}`
  const form = new FormData()
  form.append('file', file, file.name)
  let res
  try {
    res = await fetchWithTimeout(url, { method: 'POST', body: form }, 60000)
  } catch (err) {
    if (err.name === 'AbortError') {
      // Backend may be waking up (Render free tier) — retry once.
      await new Promise(r => setTimeout(r, 4000))
      res = await fetchWithTimeout(url, { method: 'POST', body: form }, 60000)
    } else {
      throw new Error(err.message || 'Network error')
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

/** GET /api/resume/mine — the student's last saved resume score, for the
 * Dashboard's compact "Resume Score" card. Returns null if they've never
 * uploaded one yet. */
export async function fetchMyResumeScore(userId) {
  if (!PYTHON_BACKEND_URL) throw new Error('VITE_PYTHON_BACKEND_URL is not set')
  if (!userId) return null
  const url = `${PYTHON_BACKEND_URL}/api/resume/mine?user_id=${encodeURIComponent(userId)}`
  const json = await getJson(url)
  return json.data || null
}
