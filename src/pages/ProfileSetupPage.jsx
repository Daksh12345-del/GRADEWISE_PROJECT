import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { useAuthUser, useLogout } from '../lib/useAuthUser'
import { getUniversityOptions, getCollegesByCity, getBranches } from '../lib/universityDirectory'
import { getSchemeSummary } from '../lib/schemes'
import Logo from './components/Logo'
import ThemeToggleButton from './components/ThemeToggleButton'
import { useTheme } from '../lib/useTheme'

// Shown to anyone who is signed in but hasn't told us their university,
// college and branch yet — i.e. every first-time Google/GitHub sign-in (the
// email-code sign-up collects these on the login form itself).
//
// The university matters beyond bookkeeping: it selects the grading scale,
// credit system and semester subjects used for their CGPA, so nobody reaches
// the dashboard without it. Rendered inside <LiveContentGate> (see App.jsx) so
// the Supabase-driven university/college/branch directory is ready.
export default function ProfileSetupPage() {
  const { isLight, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const { user: clerkUser } = useUser()
  const { user, profileComplete } = useAuthUser()
  const logout = useLogout()

  const [name, setName] = useState('')
  const [university, setUniversity] = useState('')
  const [course, setCourse] = useState('')
  const [college, setCollege] = useState('')
  const [branch, setBranch] = useState('')
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState('')
  const [saving, setSaving] = useState(false)

  // Already has a complete profile (returning Google/GitHub user) -> straight in.
  useEffect(() => {
    if (profileComplete) navigate('/dashboard', { replace: true })
  }, [profileComplete, navigate])

  // Prefill the name Google/GitHub gave us (editable).
  useEffect(() => {
    if (user?.name && !name) setName(user.name === 'Student' ? '' : user.name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name])

  const universityOptions = getUniversityOptions()
  const collegeGroups = getCollegesByCity(university, course)
  const branchOptions = getBranches(university, college, course)
  const summary = getSchemeSummary(university)

  const clear = (k) => setErrors((e) => ({ ...e, [k]: undefined }))

  async function save() {
    const v = { name: name.trim(), university, course, college, branch }
    const errs = {}
    if (!v.name) errs.name = 'Please enter your name.'
    if (!v.university) errs.university = 'Please select your university.'
    if (!v.course) errs.course = 'Please select your degree.'
    if (!v.college) errs.college = 'Please select your college.'
    if (!v.branch) errs.branch = 'Please select your branch.'
    if (Object.keys(errs).length) {
      setErrors(errs)
      setBanner('⚠️ Please fill in all fields to continue.')
      return
    }
    if (!clerkUser) return
    setSaving(true)
    setBanner('')
    try {
      const existing = clerkUser.unsafeMetadata || {}
      await clerkUser.update({
        unsafeMetadata: { ...existing, ...v, roll: existing.roll || '', domain: existing.domain || '', group: existing.group || '' },
      })
      await clerkUser.reload()
      navigate('/dashboard', { replace: true })
    } catch (e) {
      setSaving(false)
      setBanner('⚠️ Could not save: ' + (e?.errors?.[0]?.message || e.message || 'please try again.'))
    }
  }

  const errStyle = (k) => (errors[k] ? { borderColor: '#ef4444' } : undefined)

  return (
    <div className="page active" id="profileSetupPage">
      <div className="login-glow"></div>
      <div className="login-theme-toggle-wrap">
        <ThemeToggleButton isLight={isLight} toggleTheme={toggleTheme} title="Toggle Light/Dark Mode" />
      </div>

      <div className="onboard-wrap">
        <div className="hero-greet">
          <div className="hero-emoji" style={{ fontSize: 'unset', display: 'flex', justifyContent: 'center' }}>
            <Logo imgClassName="hero-logo-img" />
          </div>
          <div className="hero-title">Gradewallah</div>
          <div className="hero-tagline">One last step before your dashboard 🎓</div>
        </div>

        <div className="onboard-card">
          <div className="step-panel active">
            <div className="step-heading">Tell us where you study</div>
            <div className="step-sub">
              Your university decides the grading scale, credit system and subjects we use to calculate your SGPA and CGPA.
            </div>

            <div className="compact-group">
              <label className="compact-label" htmlFor="ps-name">Your Name <span className="req">*</span></label>
              <input
                id="ps-name" className="compact-input" type="text" placeholder="e.g. Rahul Sharma"
                value={name} onChange={(e) => { setName(e.target.value); clear('name') }}
                style={errStyle('name')} aria-required="true"
              />
              <div className="field-err">{errors.name}</div>
            </div>

            <div className="compact-row-2">
              <div className="compact-group">
                <label className="compact-label" htmlFor="ps-university">University <span className="req">*</span></label>
                <select
                  id="ps-university" className="compact-input form-select" value={university}
                  onChange={(e) => { setUniversity(e.target.value); setCollege(''); setBranch(''); clear('university') }}
                  style={errStyle('university')} aria-required="true"
                >
                  <option value="">— Select —</option>
                  {universityOptions.map((u) => <option value={u.code} key={u.code}>{u.label}</option>)}
                </select>
                <div className="field-err">{errors.university}</div>
              </div>
              <div className="compact-group">
                <label className="compact-label" htmlFor="ps-course">Degree <span className="req">*</span></label>
                <select
                  id="ps-course" className="compact-input form-select" value={course}
                  onChange={(e) => { setCourse(e.target.value); setCollege(''); setBranch(''); clear('course') }}
                  style={errStyle('course')} aria-required="true"
                >
                  <option value="">— Select —</option>
                  <option value="B.Tech">B.Tech</option>
                </select>
                <div className="field-err">{errors.course}</div>
              </div>
            </div>
            {summary && (
              <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', margin: '-4px 0 10px', lineHeight: 1.45 }}>
                📘 {summary}
              </div>
            )}

            <div className="compact-row-2">
              <div className="compact-group">
                <label className="compact-label" htmlFor="ps-college">College Name <span className="req">*</span></label>
                <select
                  id="ps-college" className="compact-input form-select" value={college}
                  onChange={(e) => { setCollege(e.target.value); setBranch(''); clear('college') }}
                  style={errStyle('college')} aria-required="true"
                >
                  <option value="">{university ? '— Select College —' : '— Select University first —'}</option>
                  {collegeGroups.map(({ city, colleges }) => (
                    <optgroup label={city} key={city}>
                      {colleges.map((c) => <option value={c} key={c}>{c}</option>)}
                    </optgroup>
                  ))}
                </select>
                <div className="field-err">{errors.college}</div>
              </div>
              <div className="compact-group">
                <label className="compact-label" htmlFor="ps-branch">Branch <span className="req">*</span></label>
                <select
                  id="ps-branch" className="compact-input form-select" value={branch}
                  onChange={(e) => { setBranch(e.target.value); clear('branch') }}
                  style={errStyle('branch')} aria-required="true"
                >
                  <option value="">{college ? '— Select Branch —' : '— Select College first —'}</option>
                  {branchOptions.map((b) => <option value={b} key={b}>{b}</option>)}
                </select>
                <div className="field-err">{errors.branch}</div>
              </div>
            </div>

            {banner && <div className="err-msg" style={{ display: 'block' }}>{banner}</div>}
            <button className="btn-next" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : '✅ Save & Continue →'}
            </button>

            <div style={{ textAlign: 'center', marginTop: '0.8rem', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              Signed in as {user?.email || 'your account'} ·{' '}
              <button
                onClick={logout}
                style={{ background: 'none', border: 'none', color: 'var(--cyan)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 'inherit' }}
              >
                Use a different account
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
