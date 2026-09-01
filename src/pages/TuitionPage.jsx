import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar, { SidebarToggleButton } from './components/Sidebar'
import ThemeToggleButton from './components/ThemeToggleButton'
import Logo from './components/Logo'
import { StaggerGroup, StaggerItem } from './components/motionKit'
import { useAuthUser } from '../lib/useAuthUser'
import { useSidebarToggle } from '../lib/useSidebarToggle'
import { useTheme } from '../lib/useTheme'
import {
  fetchTutors, fetchTutorSlots, createTuitionBooking, verifyTuitionPayment,
  loadRazorpayCheckout, fetchMyTuitionBookings, submitTutorReview, fetchTuitionJoinLink,
} from '../lib/api'

// URL of the separate Teacher Portal deployment (gradewise-tutor-portal/),
// e.g. https://tutors.gradewise.app — set in .env. If unset, the "Apply to
// teach" link on this page just doesn't render (nothing to link to yet).
// normalizeUrl guards against the common misconfiguration of setting this
// env var without a protocol (e.g. "portal.gradewallah.com" instead of
// "https://portal.gradewallah.com") — without it, an <a href> with no
// protocol is treated as a RELATIVE path and silently appends to the
// current page's URL instead of navigating to the portal.
function normalizeUrl(url) {
  if (!url) return ''
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}
const TUTOR_PORTAL_URL = normalizeUrl(import.meta.env.VITE_TUTOR_PORTAL_URL || '')

function formatSlot(iso) {
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function StarRating({ value }) {
  if (value == null) return <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>No reviews yet</span>
  const full = Math.round(value)
  return (
    <span style={{ color: '#f59e0b', fontSize: '0.85rem' }}>
      {'★'.repeat(full)}{'☆'.repeat(5 - full)} <span style={{ color: 'var(--text-dim)' }}>({value})</span>
    </span>
  )
}

/** Clickable 1–5 star input, with a hover preview so the person can see
 * what they're about to pick before committing. */
function StarInput({ value, onChange }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div style={{ display: 'flex', gap: 4 }} onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 2,
            fontSize: '1.5rem', lineHeight: 1, color: '#f59e0b',
            transform: (hovered || value) >= n ? 'scale(1.08)' : 'scale(1)',
            transition: 'transform 0.1s ease',
          }}
        >
          {(hovered || value) >= n ? '★' : '☆'}
        </button>
      ))}
    </div>
  )
}

/** Tutor card + its own expand/book state, so opening one tutor's slots
 * doesn't re-fetch or re-render every other card on the page. */
function TutorCard({ tutor, user, onBooked }) {
  const [expanded, setExpanded] = useState(false)
  const [slots, setSlots] = useState(null) // null = not loaded yet
  const [slotsError, setSlotsError] = useState('')
  const [bookingSlotId, setBookingSlotId] = useState(null)
  const [payError, setPayError] = useState('')

  async function toggleExpand() {
    setExpanded(v => !v)
    if (!expanded && slots === null) {
      try {
        setSlots(await fetchTutorSlots(tutor.id))
      } catch (e) {
        setSlotsError(e.message || 'Could not load slots')
        setSlots([])
      }
    }
  }

  async function bookSlot(slot) {
    if (!user) return
    setPayError('')
    setBookingSlotId(slot.id)
    try {
      const order = await createTuitionBooking({
        student_id: user.id,
        student_name: user.name,
        student_email: user.email,
        teacher_id: tutor.id,
        slot_id: slot.id,
        subject: tutor.subjects?.[0] || 'General',
      })
      if (!order.razorpay_key_id) {
        throw new Error('Payments are not configured on the server yet — the platform admin needs to add Razorpay keys.')
      }
      await loadRazorpayCheckout()
      const rzp = new window.Razorpay({
        key: order.razorpay_key_id,
        amount: order.amount_paise,
        currency: order.currency,
        name: 'GradeWallah Tuition',
        description: `Session with ${tutor.name}`,
        order_id: order.razorpay_order_id,
        prefill: { name: user.name, email: user.email },
        theme: { color: '#8b5cf6' },
        handler: async (response) => {
          try {
            await verifyTuitionPayment({
              booking_id: order.booking_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            })
            setSlots(s => s.filter(x => x.id !== slot.id))
            onBooked?.()
          } catch (e) {
            setPayError(e.message || 'Payment succeeded but confirmation failed — contact support with your payment id.')
          } finally {
            setBookingSlotId(null)
          }
        },
        modal: { ondismiss: () => setBookingSlotId(null) },
      })
      rzp.open()
    } catch (e) {
      setPayError(e.message || 'Could not start payment')
      setBookingSlotId(null)
    }
  }

  return (
    <div className="job-card">
      <div className="job-card-top">
        <div className="job-logo" style={{ background: '#8b5cf622', border: '1.5px solid #8b5cf644', color: '#8b5cf6' }}>
          {(tutor.name || 'T').slice(0, 2).toUpperCase()}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="job-title" title={tutor.name}>{tutor.name}</div>
          <StarRating value={tutor.avg_rating} />
        </div>
        <span className="job-mode-badge" style={{ color: '#10b981', background: '#10b98122' }}>
          ₹{tutor.hourly_rate}/hr
        </span>
      </div>

      {tutor.bio && <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', margin: '8px 0' }}>{tutor.bio}</div>}
      {(tutor.qualifications || tutor.college) && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 8 }}>
          🎓 {[tutor.qualifications, tutor.college].filter(Boolean).join(' · ')}
        </div>
      )}

      {Array.isArray(tutor.subjects) && tutor.subjects.length > 0 && (
        <div className="job-skills">
          {tutor.subjects.map((s, i) => <span key={i} className="job-skill-chip">{s}</span>)}
        </div>
      )}

      <div className="job-card-bottom">
        <span className="job-posted">
          {tutor.experience_level || 'Experience not specified'}
          {tutor.experience_level === 'Currently studying (not yet graduated)' && tutor.year_of_study ? ` · ${tutor.year_of_study}` : ''}
        </span>
        <button className="job-apply-btn" onClick={toggleExpand}>
          {expanded ? 'Hide slots' : 'View slots →'}
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {slots === null && <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Loading slots…</div>}
          {slotsError && <div style={{ fontSize: '0.85rem', color: '#ef4444' }}>{slotsError}</div>}
          {slots && slots.length === 0 && (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>No open slots right now — check back later.</div>
          )}
          {slots && slots.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {slots.map(slot => (
                <div
                  key={slot.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 8, background: 'var(--bg-soft, rgba(139,92,246,0.05))',
                  }}
                >
                  <span style={{ fontSize: '0.85rem' }}>📅 {formatSlot(slot.scheduled_start)}</span>
                  <button
                    className="job-apply-btn"
                    disabled={bookingSlotId === slot.id}
                    onClick={() => bookSlot(slot)}
                  >
                    {bookingSlotId === slot.id ? 'Opening payment…' : 'Book & Pay'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {payError && <div style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: 8 }}>{payError}</div>}
        </div>
      )}
    </div>
  )
}

// Fetches a fresh, time-boxed join link the moment the button is clicked
// (never pre-fetched or cached — see GET /api/tuition/bookings/{id}/join),
// so it always reflects "is the session's window open right now" and
// "am I the teacher or the student" at the actual moment of joining.
function JoinCallButton({ booking, user }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function join() {
    setError('')
    setLoading(true)
    try {
      const { join_url } = await fetchTuitionJoinLink(booking.id, user.id)
      window.open(join_url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError(e.message || 'Could not open the video call')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button className="job-apply-btn" onClick={join} disabled={loading}>
        {loading ? 'Opening…' : 'Join Video Call →'}
      </button>
      {error && <div style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: 6 }}>{error}</div>}
    </div>
  )
}

function MyBookings({ user }) {
  const [bookings, setBookings] = useState([])
  const [status, setStatus] = useState('loading')
  const [reviewFor, setReviewFor] = useState(null)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [submittedReviews, setSubmittedReviews] = useState({}) // { [bookingId]: { rating, comment } }
  const [reviewError, setReviewError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    if (!user) return
    try {
      setBookings(await fetchMyTuitionBookings(user.id))
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }
  useEffect(() => { load() }, [user?.id])

  async function sendReview(bookingId) {
    setReviewError('')
    setSubmitting(true)
    try {
      await submitTutorReview(bookingId, { student_id: user.id, rating, comment })
      setSubmittedReviews(prev => ({ ...prev, [bookingId]: { rating, comment } }))
      setReviewFor(null)
      setComment('')
      setRating(5)
    } catch (e) {
      setReviewError(e.message || 'Could not submit your review')
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'loading') return null
  if (bookings.length === 0) return null

  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ fontSize: '1.05rem', marginBottom: 14 }}>My Booked Sessions</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {bookings.map(b => {
          const isPast = new Date(b.scheduled_end) <= new Date()
          const already = submittedReviews[b.id]
          return (
            <div key={b.id} className="job-card" style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>{b.subject}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginTop: 2 }}>with {b.teacher_name || 'Tutor'}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: 4 }}>📅 {formatSlot(b.scheduled_start)}</div>
                </div>
                <span className="job-mode-badge" style={{
                  color: b.status === 'confirmed' ? '#10b981' : '#f59e0b',
                  background: (b.status === 'confirmed' ? '#10b981' : '#f59e0b') + '22',
                  whiteSpace: 'nowrap',
                }}>
                  {b.status === 'confirmed' ? '✓ Confirmed' : 'Awaiting payment'}
                </span>
              </div>

              {b.status === 'confirmed' && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <JoinCallButton booking={b} user={user} />
                </div>
              )}

              {b.status === 'confirmed' && !isPast && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: 10 }}>
                  ⏳ Session hasn't happened yet — you'll be able to rate it once it's over.
                </div>
              )}

              {b.status === 'confirmed' && isPast && (
                already ? (
                  <div style={{
                    marginTop: 12, padding: '10px 12px', borderRadius: 10,
                    background: '#10b98115', border: '1px solid #10b98130',
                  }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#10b981' }}>✓ Thanks for your feedback!</div>
                    <div style={{ marginTop: 4, color: '#f59e0b', fontSize: '1rem' }}>
                      {'★'.repeat(already.rating)}{'☆'.repeat(5 - already.rating)}
                    </div>
                    {already.comment && <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: 4 }}>"{already.comment}"</div>}
                  </div>
                ) : reviewFor === b.id ? (
                  <div style={{
                    marginTop: 12, padding: '14px 14px', borderRadius: 10,
                    background: 'var(--bg-soft, rgba(139,92,246,0.06))', border: '1px solid var(--border)',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>How was the session?</div>
                    <StarInput value={rating} onChange={setRating} />
                    <textarea
                      className="form-input" rows={2} placeholder="Anything you'd like to add (optional)…"
                      value={comment} onChange={e => setComment(e.target.value)}
                    />
                    {reviewError && <div style={{ fontSize: '0.8rem', color: '#ef4444' }}>{reviewError}</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="job-apply-btn" onClick={() => sendReview(b.id)} disabled={submitting}>
                        {submitting ? 'Submitting…' : 'Submit review'}
                      </button>
                      <button
                        onClick={() => { setReviewFor(null); setReviewError('') }}
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', color: 'var(--text-dim)', fontSize: '0.85rem' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="job-apply-btn" style={{ marginTop: 10 }} onClick={() => setReviewFor(b.id)}>⭐ Rate this session</button>
                )
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function TuitionPage() {
  const navigate = useNavigate()
  const { isLight, toggleTheme } = useTheme()
  const sidebarToggle = useSidebarToggle()
  const { user } = useAuthUser()

  const [tutors, setTutors] = useState([])
  const [status, setStatus] = useState('loading')
  const [search, setSearch] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedSubject, setSelectedSubject] = useState(null) // null = browsing subjects

  // Fetch the full, unfiltered tutor list once — subject grouping and
  // search filtering both happen client-side from here, so picking a
  // subject or typing a search term doesn't need another round-trip.
  useEffect(() => {
    setStatus('loading')
    fetchTutors('')
      .then(data => { setTutors(data); setStatus('ready') })
      .catch(() => setStatus('error'))
  }, [refreshKey])

  // Group tutors by subject, ranked by how many tutors teach it — the
  // "priority" a student sees a subject in is just how well-covered that
  // subject is on the platform, so widely-taught subjects surface first.
  const subjectGroups = useMemo(() => {
    const map = new Map()
    tutors.forEach(t => {
      (t.subjects || []).forEach(subj => {
        if (!map.has(subj)) map.set(subj, [])
        map.get(subj).push(t)
      })
    })
    return Array.from(map.entries())
      .map(([subject, subjectTutors]) => ({
        subject,
        tutors: subjectTutors,
        minRate: Math.min(...subjectTutors.map(t => t.hourly_rate || Infinity)),
      }))
      .sort((a, b) => b.tutors.length - a.tutors.length || a.subject.localeCompare(b.subject))
  }, [tutors])

  const visibleSubjectGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return subjectGroups
    return subjectGroups.filter(g => g.subject.toLowerCase().includes(q))
  }, [subjectGroups, search])

  const activeGroup = subjectGroups.find(g => g.subject === selectedSubject) || null

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }} id="tuitionPage">
      <header className="header">
        <div className="header-logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SidebarToggleButton {...sidebarToggle} />
          <div className="h-logo-icon" style={{ background: 'none', padding: 0, width: 36, height: 36, display: 'flex', alignItems: 'center' }}>
            <Logo />
          </div>
          <div>
            <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.05rem' }}>Personal Tuition</span>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: 1 }}>
              Book a 1:1 session with a subject tutor
            </div>
          </div>
        </div>
        <div className="header-user" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <ThemeToggleButton isLight={isLight} toggleTheme={toggleTheme} title="Toggle theme" />
        </div>
      </header>

      <div className="dash-layout">
        <Sidebar
          activePath="/tuition"
          navigate={navigate}
          open={sidebarToggle.open}
          mobileOpen={sidebarToggle.mobileOpen}
          closeMobile={sidebarToggle.closeMobile}
        />

        <div className="res-body">
          <input
            className="form-input"
            style={{ display: 'block', width: '100%', maxWidth: 640, margin: '0 auto 20px' }}
            placeholder={selectedSubject ? `Search tutors in ${selectedSubject}…` : 'Search subjects (e.g. Calculus, DBMS, Physics)…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          {status === 'loading' && <div className="job-state-msg"><div className="ai-spinner" /><div>Loading tutors…</div></div>}
          {status === 'error' && <div className="job-state-msg" style={{ color: '#ef4444' }}>Could not load tutors. Try again shortly.</div>}

          {status === 'ready' && tutors.length === 0 && (
            <div className="job-state-msg">
              No tutors listed yet.
              {TUTOR_PORTAL_URL && (
                <> <a href={TUTOR_PORTAL_URL} target="_blank" rel="noopener noreferrer" className="job-apply-btn" style={{ marginLeft: 6 }}>Be the first to sign up as a tutor →</a></>
              )}
            </div>
          )}

          {/* Level 1: browse subjects — the most-taught subjects (i.e. the
              ones with the most tutors) surface first, so a student sees
              what's actually well-covered on the platform before anything
              else. */}
          {status === 'ready' && tutors.length > 0 && !selectedSubject && (
            visibleSubjectGroups.length === 0 ? (
              <div className="job-state-msg">No subjects match "{search}".</div>
            ) : (
              <StaggerGroup>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
                  {visibleSubjectGroups.map(g => (
                    <StaggerItem key={g.subject}>
                      <button
                        onClick={() => { setSelectedSubject(g.subject); setSearch('') }}
                        className="job-card"
                        style={{
                          width: '100%', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)',
                          background: 'var(--bg-card)', font: 'inherit', color: 'inherit',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="job-logo" style={{ background: '#8b5cf622', border: '1.5px solid #8b5cf644', color: '#8b5cf6', fontSize: '1.1rem' }}>
                            📘
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="job-title">{g.subject}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 2 }}>
                              {g.tutors.length} tutor{g.tutors.length > 1 ? 's' : ''}
                              {Number.isFinite(g.minRate) && <> · from ₹{g.minRate}/hr</>}
                            </div>
                          </div>
                          <span style={{ color: 'var(--text-dim)', fontSize: '1.1rem' }}>→</span>
                        </div>
                      </button>
                    </StaggerItem>
                  ))}
                </div>
              </StaggerGroup>
            )
          )}

          {/* Level 2: a subject's tutors, with full bio/experience/rating —
              clicking a tutor card still expands to their slots inline
              (see TutorCard), same as before. */}
          {status === 'ready' && selectedSubject && activeGroup && (
            <>
              <button
                onClick={() => { setSelectedSubject(null); setSearch('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent, #8b5cf6)', fontSize: '0.85rem', padding: 0, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                ← All subjects
              </button>
              <h2 style={{ fontSize: '1.2rem', marginBottom: 14 }}>📘 {selectedSubject}</h2>
              {(() => {
                const q = search.trim().toLowerCase()
                const visibleTutors = q
                  ? activeGroup.tutors.filter(t => t.name.toLowerCase().includes(q))
                  : activeGroup.tutors
                if (visibleTutors.length === 0) return <div className="job-state-msg">No tutors match "{search}".</div>
                return (
                  <StaggerGroup>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                      {visibleTutors.map(t => (
                        <StaggerItem key={t.id}>
                          <TutorCard tutor={t} user={user} onBooked={() => setRefreshKey(k => k + 1)} />
                        </StaggerItem>
                      ))}
                    </div>
                  </StaggerGroup>
                )
              })()}
            </>
          )}

          <MyBookings user={user} />

          {/* Points to the separate Teacher Portal app (its own deployed
              site — see gradewise-tutor-portal/) rather than a route on
              this site, so teacher-facing tools (apply, manage slots,
              bookings) live entirely outside what students browse here. */}
          {TUTOR_PORTAL_URL && (
            <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              Know a subject well?{' '}
              <a href={TUTOR_PORTAL_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent, #8b5cf6)' }}>
                Apply to teach on GradeWallah →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
