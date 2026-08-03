import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { COLLEGES_BY_CITY, BRANCHES, DOMAIN_GROUPS } from '../lib/loginFormData'
import { isProfileComplete } from '../lib/useAuthUser'

// Reached only via ProtectedRoute's redirect: an OAuth (Google/GitHub)
// sign-in never goes through LoginPage's 2-step form, so a brand-new OAuth
// user has none of college/roll/branch/domain/group set. This page is the
// only place that gap gets closed — every other protected route bounces
// here first if the profile is still incomplete.
//
// University/Course aren't asked here because the site only supports one
// value for each right now (AKTU / B.Tech — see LoginPage.jsx's dropdowns,
// which are single-option for the same reason), so we just default them.
export default function CompleteProfilePage() {
  const navigate = useNavigate()
  const { isLoaded, isSignedIn, user: clerkUser } = useUser()

  const [college, setCollege] = useState('')
  const [roll, setRoll] = useState('')
  const [branch, setBranch] = useState('')
  const [group, setGroup] = useState('')
  const [domain, setDomain] = useState('')
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState({ text: '', color: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const branchOptions = BRANCHES['B.Tech'] || []

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      navigate('/', { replace: true })
      return
    }
    const meta = clerkUser?.unsafeMetadata || {}
    const already = {
      university: meta.university || '',
      course: meta.course || '',
      college: meta.college || '',
      roll: meta.roll || '',
      branch: meta.branch || '',
      domain: meta.domain || '',
      group: meta.group || '',
    }
    // Already complete (e.g. they hit this URL directly, or refreshed after
    // saving) — nothing to do here, send them on.
    if (isProfileComplete(already)) navigate('/dashboard', { replace: true })
  }, [isLoaded, isSignedIn, clerkUser, navigate])

  function clearFieldErr(field) {
    setErrors((prev) => ({ ...prev, [field]: '' }))
    setBanner({ text: '', color: '' })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmedCollege = college.trim()
    const trimmedRoll = roll.trim()
    const trimmedBranch = branch.trim()
    const trimmedDomain = domain.trim()

    const newErrors = {}
    if (!trimmedCollege) newErrors.college = 'Please select your college.'
    if (!trimmedRoll) newErrors.roll = 'Roll number is required.'
    else if (!/^[a-zA-Z0-9]{6,20}$/.test(trimmedRoll)) newErrors.roll = '6–20 alphanumeric chars only.'
    if (!trimmedBranch) newErrors.branch = 'Please select your branch.'
    if (!trimmedDomain) newErrors.domain = 'Please pick your domain of interest.'
    if (!group) newErrors.group = 'Please select your batch group (A or B).'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})
    setBanner({ text: '', color: '' })
    setIsSubmitting(true)

    const profileMeta = {
      name: clerkUser?.fullName || clerkUser?.firstName || 'Student',
      university: 'AKTU',
      course: 'B.Tech',
      college: trimmedCollege,
      roll: trimmedRoll,
      branch: trimmedBranch,
      domain: trimmedDomain,
      group,
    }

    try {
      await clerkUser.update({ unsafeMetadata: profileMeta })
      setIsSubmitting(false)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setIsSubmitting(false)
      setBanner({ text: '⚠️ Could not save your profile: ' + (err?.errors?.[0]?.message || err.message), color: '' })
    }
  }

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="page active" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div className="page active" id="completeProfilePage">
      <div className="login-glow"></div>
      <div className="onboard-wrap">
        <div className="hero-greet">
          <div className="hero-title">One more step</div>
          <div className="hero-tagline">
            Welcome, {clerkUser?.firstName || 'there'}! A few quick details to set up your dashboard.
          </div>
        </div>

        <div className="onboard-card">
          <form onSubmit={handleSubmit} className="step-panel active">
            <div className="compact-group">
              <label className="compact-label" htmlFor="cp-college">College Name <span className="req">*</span></label>
              <select
                id="cp-college"
                className="compact-input form-select"
                value={college}
                onChange={(e) => { setCollege(e.target.value); clearFieldErr('college') }}
                style={errors.college ? { borderColor: '#ef4444' } : undefined}
                aria-required="true"
                aria-invalid={!!errors.college}
              >
                <option value="">— Select College —</option>
                {COLLEGES_BY_CITY.map(({ city, colleges }) => (
                  <optgroup label={city} key={city}>
                    {colleges.map((c) => (
                      <option value={c} key={c}>{c}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <div className="field-err">{errors.college}</div>
            </div>

            <div className="compact-row-2">
              <div className="compact-group">
                <label className="compact-label" htmlFor="cp-roll">Roll Number <span className="req">*</span></label>
                <input
                  id="cp-roll"
                  className="compact-input"
                  type="text"
                  placeholder="e.g. 2300100300001"
                  maxLength={20}
                  value={roll}
                  onChange={(e) => { setRoll(e.target.value); clearFieldErr('roll') }}
                  style={errors.roll ? { borderColor: '#ef4444' } : undefined}
                  aria-required="true"
                  aria-invalid={!!errors.roll}
                />
                <div className="field-err">{errors.roll}</div>
              </div>
              <div className="compact-group">
                <label className="compact-label" htmlFor="cp-branch">Branch <span className="req">*</span></label>
                <select
                  id="cp-branch"
                  className="compact-input form-select"
                  value={branch}
                  onChange={(e) => { setBranch(e.target.value); clearFieldErr('branch') }}
                  style={errors.branch ? { borderColor: '#ef4444' } : undefined}
                  aria-required="true"
                  aria-invalid={!!errors.branch}
                >
                  <option value="">— Select Branch —</option>
                  {branchOptions.map((b) => (
                    <option value={b} key={b}>{b}</option>
                  ))}
                </select>
                <div className="field-err">{errors.branch}</div>
              </div>
            </div>

            <div className="compact-group">
              <label className="compact-label" id="cp-group-label">📚 Which do you have in Semester I? <span className="req">*</span></label>
              <div role="radiogroup" aria-labelledby="cp-group-label" style={{ display: 'flex', gap: '0.7rem', marginTop: '0.4rem' }}>
                <label
                  className="grp-radio-lbl"
                  onClick={() => { setGroup('A'); clearFieldErr('group') }}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer',
                    borderRadius: 10, padding: '0.7rem 0.8rem', transition: 'all 0.2s',
                    border: group === 'A' ? '1.5px solid #06b6d4' : '1.5px solid rgba(6,182,212,0.25)',
                    background: group === 'A' ? 'rgba(6,182,212,0.08)' : 'transparent',
                  }}
                >
                  <input type="radio" name="cp_batch_group" checked={group === 'A'} onChange={() => { setGroup('A'); clearFieldErr('group') }} style={{ accentColor: '#06b6d4', width: 16, height: 16 }} />
                  <div>
                    <div style={{ fontWeight: 700, color: '#06b6d4', fontSize: '0.88rem' }}>🔵 Physics</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>Sem I → Physics + Electrical &nbsp;|&nbsp; Sem II → Chemistry + Electronics</div>
                  </div>
                </label>
                <label
                  className="grp-radio-lbl"
                  onClick={() => { setGroup('B'); clearFieldErr('group') }}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer',
                    borderRadius: 10, padding: '0.7rem 0.8rem', transition: 'all 0.2s',
                    border: group === 'B' ? '1.5px solid #a78bfa' : '1.5px solid rgba(6,182,212,0.25)',
                    background: group === 'B' ? 'rgba(167,139,250,0.08)' : 'transparent',
                  }}
                >
                  <input type="radio" name="cp_batch_group" checked={group === 'B'} onChange={() => { setGroup('B'); clearFieldErr('group') }} style={{ accentColor: '#a78bfa', width: 16, height: 16 }} />
                  <div>
                    <div style={{ fontWeight: 700, color: '#a78bfa', fontSize: '0.88rem' }}>🟣 Chemistry</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>Sem I → Chemistry + Electronics &nbsp;|&nbsp; Sem II → Physics + Electrical</div>
                  </div>
                </label>
              </div>
              <div className="field-err">{errors.group}</div>
            </div>

            <div className="compact-group">
              <label className="compact-label" htmlFor="cp-domain">Domain of Interest <span className="req">*</span></label>
              <select
                id="cp-domain"
                className="compact-input form-select"
                value={domain}
                onChange={(e) => { setDomain(e.target.value); clearFieldErr('domain') }}
                style={errors.domain ? { borderColor: '#ef4444' } : undefined}
                aria-required="true"
                aria-invalid={!!errors.domain}
              >
                <option value="">— What excites you? —</option>
                {DOMAIN_GROUPS.map(({ group: g, options }) => (
                  <optgroup label={g} key={g}>
                    {options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <div className="field-err">{errors.domain}</div>
            </div>

            {banner.text && (
              <div className="err-msg" style={{ display: 'block', color: banner.color || undefined }}>
                {banner.text}
              </div>
            )}

            <button
              className="btn-login btn-next"
              type="submit"
              disabled={isSubmitting}
              style={{ background: 'linear-gradient(135deg,#10b981,#06b6d4)' }}
            >
              {isSubmitting ? 'Saving…' : '✅ Save & Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
