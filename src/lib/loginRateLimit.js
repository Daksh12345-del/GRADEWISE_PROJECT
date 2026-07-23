// Client-side login attempt throttle. This is a UX speed bump only —
// Clerk enforces the real rate limit server-side regardless of what
// happens here. The point of this module is just to make the client-side
// counter actually persist: the old version lived in a plain module-scope
// `let`, which reset to 0 on every page refresh or new tab, so it never
// really limited anything. Storing it in localStorage means the count
// survives refreshes and new tabs within the same browser.
const LOGIN_MAX = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LS_KEY = 'gw_login_attempts'

// Falls back to an in-memory value for this tab if localStorage is
// unavailable (e.g. private/incognito mode with storage blocked) instead
// of throwing.
let memoryState = { count: 0, resetAt: 0 }

function readState() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { count: 0, resetAt: 0 }
    const parsed = JSON.parse(raw)
    if (typeof parsed?.count !== 'number' || typeof parsed?.resetAt !== 'number') {
      return { count: 0, resetAt: 0 }
    }
    return parsed
  } catch {
    return memoryState
  }
}

function writeState(state) {
  memoryState = state
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  } catch {
    // localStorage unavailable — memoryState still covers this tab/session
  }
}

// Call once per login attempt, right before actually attempting sign-in.
// Returns { allowed: true } and records the attempt if under the limit,
// or { allowed: false, waitMinutes } if the limit has been hit for this
// window.
export function checkAndConsumeLoginAttempt() {
  const now = Date.now()
  let state = readState()

  if (now > state.resetAt) {
    state = { count: 0, resetAt: now + LOGIN_WINDOW_MS }
  }

  if (state.count >= LOGIN_MAX) {
    writeState(state)
    return { allowed: false, waitMinutes: Math.ceil((state.resetAt - now) / 60000) }
  }

  state = { ...state, count: state.count + 1 }
  writeState(state)
  return { allowed: true }
}
