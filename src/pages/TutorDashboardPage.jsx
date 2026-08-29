import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar, { SidebarToggleButton } from './components/Sidebar'
import ThemeToggleButton from './components/ThemeToggleButton'
import Logo from './components/Logo'
import { useAuthUser } from '../lib/useAuthUser'
import { useSidebarToggle } from '../lib/useSidebarToggle'
import { useTheme } from '../lib/useTheme'
import { applyAsTutor, fetchTutorDashboard, addTutorSlot } from '../lib/api'

function ApplyForm({ user, onApplied }) {
  const [subjects, setSubjects] = useState('')
  const [bio, setBio] = useState('')
  const [qualifications, setQualifications] = useState('')
  const [experienceYears, setExperienceYears] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    const subjectList = subjects.split(',').map(s => s.trim()).filter(Boolean)
    if (subjectList.length === 0) return setError('Add at least one subject (comma separated).')
    if (!hourlyRate || Number(hourlyRate) <= 0) return setError('Enter a valid hourly rate.')
    setSubmitting(true)
    try {
      await applyAsTutor({
        user_id: user.id,
        name: user.name,
        email: user.email,
        subjects: subjectList,
        bio,
        qualifications,
        experience_years: Number(experienceYears) || 0,
        hourly_rate: Number(hourlyRate),
      })
      onApplied()
    } catch (e) {
      setError(e.message || 'Could not submit your application')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="res-body" style={{ maxWidth: 520 }}>
      <h2 style={{ marginBottom: 4 }}>Become a Tutor</h2>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 16 }}>
        Fill this in and a platform admin will review it before your profile goes live and students can book you.
      </p>

      <div className="form-group">
        <label className="form-label">Subjects (comma separated)</label>
        <input className="form-input" value={subjects} onChange={e => setSubjects(e.target.value)} placeholder="e.g. Calculus, Data Structures" />
      </div>

      <div className="form-group">
        <label className="form-label">Short bio</label>
        <textarea className="form-input" rows={3} value={bio} onChange={e => setBio(e.target.value)} placeholder="What do you teach, and how?" />
      </div>

      <div className="form-row-2">
        <div className="form-group">
          <label className="form-label">Qualifications</label>
          <input className="form-input" value={qualifications} onChange={e => setQualifications(e.target.value)} placeholder="e.g. B.Tech CSE, 4th year" />
        </div>
        <div className="form-group">
          <label className="form-label">Years of experience</label>
          <input className="form-input" type="number" min="0" value={experienceYears} onChange={e => setExperienceYears(e.target.value)} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Hourly rate (₹)</label>
        <input className="form-input" type="number" min="1" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} placeholder="e.g. 300" />
      </div>

      {error && <div style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: 10 }}>{error}</div>}
      <button className="btn-apply" type="submit" disabled={submitting}>
        {submitting ? 'Submitting…' : 'Submit application'}
      </button>
    </form>
  )
}

function AddSlotForm({ teacherId, user, onAdded }) {
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!date || !startTime || !endTime) return setError('Fill in date, start and end time.')
    setSubmitting(true)
    try {
      await addTutorSlot(teacherId, { user_id: user.id, date, start_time: startTime, end_time: endTime })
      setDate(''); setStartTime(''); setEndTime('')
      onAdded()
    } catch (e) {
      setError(e.message || 'Could not add slot')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
      <div className="form-group">
        <label className="form-label">Date</label>
        <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Start</label>
        <input className="form-input" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">End</label>
        <input className="form-input" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
      </div>
      <button className="btn-apply" type="submit" disabled={submitting}>{submitting ? 'Adding…' : 'Add slot'}</button>
      {error && <div style={{ color: '#ef4444', fontSize: '0.8rem', width: '100%' }}>{error}</div>}
    </form>
  )
}

export default function TutorDashboardPage() {
  const navigate = useNavigate()
  const { isLight, toggleTheme } = useTheme()
  const sidebarToggle = useSidebarToggle()
  const { user } = useAuthUser()

  const [data, setData] = useState(null) // { profile, slots, bookings }
  const [status, setStatus] = useState('loading')

  async function load() {
    if (!user) return
    try {
      setData(await fetchTutorDashboard(user.id))
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }
  useEffect(() => { load() }, [user?.id])

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }} id="tutorDashboardPage">
      <header className="header">
        <div className="header-logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SidebarToggleButton {...sidebarToggle} />
          <div className="h-logo-icon" style={{ background: 'none', padding: 0, width: 36, height: 36, display: 'flex', alignItems: 'center' }}>
            <Logo />
          </div>
          <div>
            <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.05rem' }}>Tutor Dashboard</span>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: 1 }}>Manage your tuition profile</div>
          </div>
        </div>
        <div className="header-user" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="job-apply-btn" onClick={() => navigate('/tuition')}>Browse tutors</button>
          <ThemeToggleButton isLight={isLight} toggleTheme={toggleTheme} title="Toggle theme" />
        </div>
      </header>

      <div className="dash-layout">
        <Sidebar
          activePath="/tutor-dashboard"
          navigate={navigate}
          open={sidebarToggle.open}
          mobileOpen={sidebarToggle.mobileOpen}
          closeMobile={sidebarToggle.closeMobile}
        />

        {status === 'loading' && <div className="job-state-msg"><div className="ai-spinner" /><div>Loading…</div></div>}
        {status === 'error' && <div className="job-state-msg" style={{ color: '#ef4444' }}>Could not load your tutor dashboard.</div>}

        {status === 'ready' && !data?.profile && (
          <ApplyForm user={user} onApplied={load} />
        )}

        {status === 'ready' && data?.profile && (
          <div className="res-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>{data.profile.name}</h2>
              <span className="job-mode-badge" style={{
                color: data.profile.approval_status === 'approved' ? '#10b981' : data.profile.approval_status === 'rejected' ? '#ef4444' : '#f59e0b',
                background: (data.profile.approval_status === 'approved' ? '#10b981' : data.profile.approval_status === 'rejected' ? '#ef4444' : '#f59e0b') + '22',
              }}>
                {data.profile.approval_status === 'approved' ? '✓ Approved' : data.profile.approval_status === 'rejected' ? 'Not approved' : 'Pending review'}
              </span>
            </div>

            {data.profile.approval_status === 'pending' && (
              <div className="job-state-msg" style={{ marginBottom: 16 }}>
                Your application is awaiting admin review. You'll be able to open time slots once approved.
              </div>
            )}

            {data.profile.approval_status === 'approved' && (
              <>
                <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>Open a new slot</h3>
                <AddSlotForm teacherId={data.profile.id} user={user} onAdded={load} />

                <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>Your upcoming slots ({data.slots?.filter(s => !s.is_booked).length || 0} open)</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                  {(data.slots || []).map(s => (
                    <div key={s.id} style={{ fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', maxWidth: 420 }}>
                      <span>{new Date(s.scheduled_start).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      <span style={{ color: s.is_booked ? '#10b981' : 'var(--text-dim)' }}>{s.is_booked ? 'Booked' : 'Open'}</span>
                    </div>
                  ))}
                  {(data.slots || []).length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>No slots yet — add one above.</div>}
                </div>

                <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>Bookings</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(data.bookings || []).map(b => (
                    <div key={b.id} className="job-card" style={{ padding: 14 }}>
                      <strong>{b.student_name}</strong> — {b.subject}
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                        {new Date(b.scheduled_start).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {b.status}
                      </div>
                      {b.meet_link && <a href={b.meet_link} target="_blank" rel="noopener noreferrer" className="job-apply-btn" style={{ marginTop: 6, display: 'inline-block' }}>Join Meet →</a>}
                    </div>
                  ))}
                  {(data.bookings || []).length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>No bookings yet.</div>}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
