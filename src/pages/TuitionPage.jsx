import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar, { SidebarToggleButton } from './components/Sidebar'
import ThemeToggleButton from './components/ThemeToggleButton'
import Logo from './components/Logo'
import { StaggerGroup, StaggerItem } from './components/motionKit'
import { useAuthUser } from '../lib/useAuthUser'
import { useTutorStatus } from '../lib/useTutorStatus'
import { useSidebarToggle } from '../lib/useSidebarToggle'
import { useTheme } from '../lib/useTheme'
import {
  fetchTutors, fetchTutorSlots, createTuitionBooking, verifyTuitionPayment,
  loadRazorpayCheckout, fetchMyTuitionBookings, submitTutorReview,
} from '../lib/api'

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
        name: 'GradeWise Tuition',
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

      {Array.isArray(tutor.subjects) && tutor.subjects.length > 0 && (
        <div className="job-skills">
          {tutor.subjects.map((s, i) => <span key={i} className="job-skill-chip">{s}</span>)}
        </div>
      )}

      <div className="job-card-bottom">
        <span className="job-posted">{tutor.experience_years || 0} yrs experience</span>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {slots.map(slot => (
                <div key={slot.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '0.85rem' }}>{formatSlot(slot.scheduled_start)}</span>
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

function MyBookings({ user }) {
  const [bookings, setBookings] = useState([])
  const [status, setStatus] = useState('loading')
  const [reviewFor, setReviewFor] = useState(null)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')

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
    try {
      await submitTutorReview(bookingId, { student_id: user.id, rating, comment })
      setReviewFor(null)
      setComment('')
    } catch (e) {
      alert(e.message || 'Could not submit review')
    }
  }

  if (status === 'loading') return null
  if (bookings.length === 0) return null

  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: '1rem', marginBottom: 10 }}>My Booked Sessions</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bookings.map(b => (
          <div key={b.id} className="job-card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong>{b.subject}</strong> with {b.teacher_name || 'Tutor'}
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{formatSlot(b.scheduled_start)}</div>
              </div>
              <span className="job-mode-badge" style={{
                color: b.status === 'confirmed' ? '#10b981' : '#f59e0b',
                background: (b.status === 'confirmed' ? '#10b981' : '#f59e0b') + '22',
              }}>
                {b.status === 'confirmed' ? 'Confirmed' : 'Awaiting payment'}
              </span>
            </div>
            {b.status === 'confirmed' && b.meet_link && (
              <a href={b.meet_link} target="_blank" rel="noopener noreferrer" className="job-apply-btn" style={{ marginTop: 8, display: 'inline-block' }}>
                Join Google Meet →
              </a>
            )}
            {b.status === 'confirmed' && !b.meet_link && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: 8 }}>
                Meet link wasn't auto-generated — coordinate directly with your tutor.
              </div>
            )}
            {b.status === 'confirmed' && (
              reviewFor === b.id ? (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <select className="form-select" value={rating} onChange={e => setRating(Number(e.target.value))}>
                    {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} star{n > 1 ? 's' : ''}</option>)}
                  </select>
                  <textarea className="form-input" rows={2} placeholder="How was the session?" value={comment} onChange={e => setComment(e.target.value)} />
                  <button className="job-apply-btn" onClick={() => sendReview(b.id)}>Submit review</button>
                </div>
              ) : (
                <button className="job-apply-btn" style={{ marginTop: 8 }} onClick={() => setReviewFor(b.id)}>Rate this session</button>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TuitionPage() {
  const navigate = useNavigate()
  const { isLight, toggleTheme } = useTheme()
  const sidebarToggle = useSidebarToggle()
  const { user } = useAuthUser()
  const { hasProfile, approvalStatus } = useTutorStatus()

  const [tutors, setTutors] = useState([])
  const [status, setStatus] = useState('loading')
  const [search, setSearch] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    setStatus('loading')
    fetchTutors(search.trim())
      .then(data => { setTutors(data); setStatus('ready') })
      .catch(() => setStatus('error'))
  }, [search, refreshKey])

  const subjectsOnPlatform = useMemo(() => {
    const set = new Set()
    tutors.forEach(t => (t.subjects || []).forEach(s => set.add(s)))
    return Array.from(set).sort()
  }, [tutors])

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
            style={{ maxWidth: 360, marginBottom: 16 }}
            placeholder="Search by subject (e.g. Calculus, DBMS, Physics)…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            list="tuition-subjects"
          />
          <datalist id="tuition-subjects">
            {subjectsOnPlatform.map(s => <option key={s} value={s} />)}
          </datalist>

          {status === 'loading' && <div className="job-state-msg"><div className="ai-spinner" /><div>Loading tutors…</div></div>}
          {status === 'error' && <div className="job-state-msg" style={{ color: '#ef4444' }}>Could not load tutors. Try again shortly.</div>}
          {status === 'ready' && tutors.length === 0 && (
            <div className="job-state-msg">
              No tutors {search ? `for "${search}"` : 'listed'} yet.{' '}
              <button className="job-apply-btn" onClick={() => navigate('/tutor-dashboard')}>Be the first to sign up as a tutor →</button>
            </div>
          )}

          {status === 'ready' && tutors.length > 0 && (
            <StaggerGroup>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {tutors.map(t => (
                  <StaggerItem key={t.id}>
                    <TutorCard tutor={t} user={user} onBooked={() => setRefreshKey(k => k + 1)} />
                  </StaggerItem>
                ))}
              </div>
            </StaggerGroup>
          )}

          <MyBookings user={user} />

          {/* Subtle, easy-to-miss-if-you're-not-looking entry point for
              becoming a tutor — deliberately not a big header button, so
              a student browsing to book a class doesn't get funneled into
              the teacher-side dashboard by accident. Once someone has
              applied, they get a real Sidebar nav item instead (see
              Sidebar.jsx + useTutorStatus). */}
          <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            {hasProfile ? (
              <span>
                You've applied to teach on GradeWise {approvalStatus === 'pending' ? '(pending review)' : approvalStatus === 'approved' ? '(approved)' : '(not approved)'} —{' '}
                <button
                  onClick={() => navigate('/tutor-dashboard')}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent, #8b5cf6)', cursor: 'pointer', textDecoration: 'underline', font: 'inherit' }}
                >
                  open your tutor dashboard
                </button>
              </span>
            ) : (
              <span>
                Know a subject well?{' '}
                <button
                  onClick={() => navigate('/tutor-dashboard')}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent, #8b5cf6)', cursor: 'pointer', textDecoration: 'underline', font: 'inherit' }}
                >
                  Apply to teach on GradeWise
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
