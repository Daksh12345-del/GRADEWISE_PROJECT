import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSignIn, useSignUp, useUser } from '@clerk/clerk-react'
import { COLLEGES_BY_CITY, BRANCHES } from '../lib/loginFormData'
import { loadLiveContent, getLiveContentStatus } from '../lib/liveContent'
import { checkAndConsumeLoginAttempt } from '../lib/loginRateLimit'
import Logo from './components/Logo'
import ThemeToggleButton from './components/ThemeToggleButton'
import { useTheme } from '../lib/useTheme'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginPage() {
  const { isLight, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const { signIn, setActive: setActiveSignIn, isLoaded: signInLoaded } = useSignIn()
  const { signUp, setActive: setActiveSignUp, isLoaded: signUpLoaded } = useSignUp()
  const { isSignedIn, isLoaded: userLoaded } = useUser()

  // If we land here already signed in (e.g. back-button after login, or
  // bounced back from an OAuth redirect), skip straight to the dashboard
  // instead of showing the form again.
  useEffect(() => {
    if (userLoaded && isSignedIn) navigate('/dashboard')
  }, [userLoaded, isSignedIn, navigate])

  const [contentLoading, setContentLoading] = useState(false)

  // Passwordless auth — there is no password field anywhere on this page.
  // Every login/signup goes through a 6-digit email code instead. This
  // sub-step shows that code input. `verificationMode` tracks which Clerk
  // resource ('signIn' for a returning user, 'signUp' for a brand-new one)
  // the code needs to be confirmed against, since they use different APIs.
  const [pendingVerification, setPendingVerification] = useState(false)
  const [verificationMode, setVerificationMode] = useState(null) // 'signIn' | 'signUp' | null
  const [verificationCode, setVerificationCode] = useState('')
  const [verificationErr, setVerificationErr] = useState('')
  // Holds the profile fields collected in the form across the email-code
  // round trip, so confirmVerificationCode can still read them after
  // doLogin's own copy has gone out of scope.
  const profileMetaRef = useRef(null)
  // Synchronous in-flight guard for doLogin (see doLogin above) — plain
  // state/isSubmitting isn't enough because it only updates after a
  // re-render, leaving a window for a second Enter keypress to call
  // doLogin again before the UI reflects that a send is already happening.
  const sendingRef = useRef(false)

  // Form fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [university, setUniversity] = useState('')
  const [course, setCourse] = useState('')
  const [college, setCollege] = useState('')
  const [branch, setBranch] = useState('')

  // Errors
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState({ text: '', color: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const branchOptions = BRANCHES[course] || []

  // Make sure the college/branch dropdown content (loaded from CMS) is
  // ready before the user can submit — it normally finishes well before
  // they get this far, so this is just a safety net for slow networks.
  useEffect(() => {
    if (getLiveContentStatus().status !== 'ready') {
      setContentLoading(true)
      loadLiveContent().catch(() => {}).finally(() => setContentLoading(false))
    }
  }, [])

  const nameInputRef = useRef(null)
  useEffect(() => { nameInputRef.current?.focus() }, [])

  function clearFieldErr(field) {
    setErrors((prev) => ({ ...prev, [field]: '' }))
    setBanner({ text: '', color: '' })
  }

  function handleCourseChange(value) {
    setCourse(value)
    setBranch('') // reset branch when course changes
    clearFieldErr('course')
  }

  async function doLogin() {
    // Hard guard against duplicate/overlapping calls — e.g. Enter fired
    // twice in quick succession (holding the key, or a native <select>'s
    // own Enter-to-confirm bubbling up right before setIsSubmitting(true)
    // has re-rendered). Without this, each duplicate call re-runs
    // signIn.create()/prepareFirstFactor() and sends ANOTHER OTP email.
    if (sendingRef.current) return
    sendingRef.current = true
    try {
      await doLoginInner()
    } finally {
      sendingRef.current = false
    }
  }

  async function doLoginInner() {
    // Rate limit check
    const attempt = checkAndConsumeLoginAttempt()
    if (!attempt.allowed) {
      setBanner({ text: `⛔ Too many attempts. Please wait ${attempt.waitMinutes} minute(s).`, color: '' })
      return
    }

    const trimmedName = name.trim()
    const trimmedEmail = email.trim()
    const trimmedUniv = university.trim()
    const trimmedCourse = course.trim()
    const trimmedCollege = college.trim()
    const trimmedBranch = branch.trim()

    const newErrors = {}
    if (!trimmedName) newErrors.name = 'Please enter your name.'
    if (!trimmedEmail) newErrors.email = 'Please enter your email.'
    else if (!EMAIL_RE.test(trimmedEmail)) newErrors.email = "That doesn't look like a valid email."
    if (!trimmedUniv) newErrors.university = 'Please select your university.'
    if (!trimmedCourse) newErrors.course = 'Please select your degree.'
    if (!trimmedCollege) newErrors.college = 'Please select your college.'
    if (!trimmedBranch) newErrors.branch = 'Please select your branch.'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setBanner({ text: '⚠️ Please fill in all fields above to continue.', color: '' })
      return
    }

    setErrors({})
    setBanner({ text: '', color: '' })
    setIsSubmitting(true)

    // roll/domain/group are no longer collected on this shortened form —
    // kept as empty strings in metadata so any other page reading
    // user.unsafeMetadata.roll etc. doesn't break, it'll just be blank.
    const profileMeta = {
      name: trimmedName,
      university: trimmedUniv,
      course: trimmedCourse,
      college: trimmedCollege,
      roll: '',
      branch: trimmedBranch,
      domain: '',
      group: '',
    }
    profileMetaRef.current = profileMeta

    if (!signInLoaded || !signUpLoaded) {
      setIsSubmitting(false)
      setBanner({ text: '⚠️ Still loading, please try again in a moment.', color: '' })
      return
    }

    // ── Passwordless auth: email OTP code, no password anywhere ──
    // Try sign-in first (existing account); if Clerk says that email isn't
    // registered, fall through to sign-up (brand-new account). Either way
    // the next step is the same 6-digit code screen.
    try {
      const signInAttempt = await signIn.create({ identifier: trimmedEmail })
      const emailCodeFactor = signInAttempt.supportedFirstFactors?.find(
        (f) => f.strategy === 'email_code'
      )
      if (!emailCodeFactor) {
        setIsSubmitting(false)
        setBanner({ text: "⚠️ This account can't sign in with an email code. Please contact support.", color: '' })
        return
      }
      await signIn.prepareFirstFactor({
        strategy: 'email_code',
        emailAddressId: emailCodeFactor.emailAddressId,
      })
      setIsSubmitting(false)
      setVerificationMode('signIn')
      setPendingVerification(true)
      setBanner({ text: `📧 We sent a 6-digit code to ${trimmedEmail}. Enter it below to sign in.`, color: '#06b6d4' })
      return
    } catch (signInErr) {
      const code = signInErr?.errors?.[0]?.code || ''

      if (code !== 'form_identifier_not_found') {
        setIsSubmitting(false)
        setBanner({ text: '⚠️ Auth error: ' + (signInErr?.errors?.[0]?.message || signInErr.message), color: '' })
        return
      }
      // else: no account with this email yet — fall through to sign-up below.
    }

    try {
      const signUpAttempt = await signUp.create({
        emailAddress: trimmedEmail,
        unsafeMetadata: profileMeta,
      })

      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      setIsSubmitting(false)
      setVerificationMode('signUp')
      setPendingVerification(true)
      setBanner({ text: `📧 We sent a 6-digit code to ${trimmedEmail}. Enter it below to finish.`, color: '#06b6d4' })
    } catch (signUpErr) {
      setIsSubmitting(false)
      const msg = signUpErr?.errors?.[0]?.message || signUpErr.message || ''
      setBanner({ text: '⚠️ Auth error: ' + msg, color: '' })
    }
  }

  // Confirms the 6-digit email code for whichever flow sent it — sign-in
  // (returning user) or sign-up (brand-new user).
  async function confirmVerificationCode() {
    if (!verificationCode.trim()) return
    setVerificationErr('')
    setIsSubmitting(true)
    try {
      let attempt
      if (verificationMode === 'signIn') {
        if (!signInLoaded) return
        attempt = await signIn.attemptFirstFactor({
          strategy: 'email_code',
          code: verificationCode.trim(),
        })
        if (attempt.status === 'complete') {
          await setActiveSignIn({ session: attempt.createdSessionId })
          try { await window.Clerk?.user?.update({ unsafeMetadata: profileMetaRef.current }) } catch { /* non-fatal */ }
          setIsSubmitting(false)
          navigate('/dashboard')
          return
        }
      } else if (verificationMode === 'signUp') {
        if (!signUpLoaded) return
        attempt = await signUp.attemptEmailAddressVerification({ code: verificationCode.trim() })
        if (attempt.status === 'complete') {
          await setActiveSignUp({ session: attempt.createdSessionId })
          setIsSubmitting(false)
          navigate('/dashboard')
          return
        }
      }
      setIsSubmitting(false)
      setVerificationErr(
        "That code didn't work. Please check and try again. " +
        `[debug: status=${attempt?.status} missingFields=${JSON.stringify(attempt?.missingFields || attempt?.unverifiedFields || [])}]`
      )
    } catch (e) {
      setIsSubmitting(false)
      setVerificationErr(e?.errors?.[0]?.message || e.message || 'Verification failed.')
    }
  }

  const [oauthLoading, setOauthLoading] = useState(null) // 'google' | 'github' | null

  async function doGoogleLogin() {
    if (!signInLoaded) return
    setOauthLoading('google')
    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: window.location.origin + '/sso-callback',
        redirectUrlComplete: window.location.origin + '/dashboard',
      })
    } catch (error) {
      setBanner({ text: '⚠️ Google sign-in failed: ' + (error?.errors?.[0]?.message || error.message), color: '' })
      setOauthLoading(null)
    }
  }

  async function doGithubLogin() {
    if (!signInLoaded) return
    setOauthLoading('github')
    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_github',
        redirectUrl: window.location.origin + '/sso-callback',
        redirectUrlComplete: window.location.origin + '/dashboard',
      })
    } catch (error) {
      setBanner({ text: '⚠️ GitHub sign-in failed: ' + (error?.errors?.[0]?.message || error.message), color: '' })
      setOauthLoading(null)
    }
  }

  return (
    <div className="page active" id="loginPage">
      <div className="login-glow"></div>
      <div className="login-theme-toggle-wrap">
        <ThemeToggleButton isLight={isLight} toggleTheme={toggleTheme} title="Toggle Light/Dark Mode" />
      </div>

      <div className="onboard-wrap">
        {/* Hero Greeting */}
        <div className="hero-greet">
          <div className="hero-emoji" style={{ fontSize: 'unset', display: 'flex', justifyContent: 'center' }}>
            <Logo imgClassName="hero-logo-img" />
          </div>
          <div className="hero-title">Gradewallah</div>
          <div className="hero-tagline">Your Complete Student Problem Solver · v7.1 (GPA fix)</div>
          <div className="hero-features">
            <span className="hero-feat-pill">📊 CGPA Tracker</span>
            <span className="hero-feat-pill">📚 Study Resources</span>
            <span className="hero-feat-pill">🔍 Smart Analyser</span>
            <span className="hero-feat-pill">🎯 Career Guidance</span>
          </div>
        </div>

        {/* Onboard Card — single step now */}
        <div className="onboard-card">
          <div
            className="step-panel active"
            id="step-1"
          >
            {pendingVerification ? (
              <div>
                <div className="step-heading">Enter your code 📧</div>
                {banner.text && (
                  <div className="err-msg" style={{ display: 'block', color: banner.color || undefined, marginBottom: '0.9rem' }}>
                    {banner.text}
                  </div>
                )}
                <div className="compact-group">
                  <label className="compact-label" htmlFor="login-verification">Verification Code <span className="req">*</span></label>
                  <input
                    id="login-verification"
                    className="compact-input"
                    type="text"
                    inputMode="numeric"
                    placeholder="6-digit code"
                    maxLength={6}
                    value={verificationCode}
                    onChange={(e) => { setVerificationCode(e.target.value); setVerificationErr('') }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isSubmitting) { e.preventDefault(); confirmVerificationCode() }
                    }}
                    style={verificationErr ? { borderColor: '#ef4444' } : undefined}
                    aria-required="true"
                    aria-invalid={!!verificationErr}
                    aria-describedby="login-verification-err"
                    autoFocus
                  />
                  <div className="field-err" id="login-verification-err">{verificationErr}</div>
                </div>
                <button
                  className="btn-login btn-next"
                  onClick={confirmVerificationCode}
                  disabled={isSubmitting}
                  style={{ background: 'linear-gradient(135deg,#10b981,#06b6d4)' }}
                >
                  {isSubmitting ? 'Verifying…' : '✅ Confirm & Launch Gradewallah'}
                </button>
                <div style={{ textAlign: 'center', marginTop: '0.7rem' }}>
                  <button
                    onClick={() => { setPendingVerification(false); setVerificationMode(null); setVerificationCode(''); setVerificationErr(''); setBanner({ text: '', color: '' }) }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                  >
                    ← Back
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="step-heading">Hey there! Let's get started 👋</div>
                <div className="step-sub">Just a few quick details — your info stays on your device only.</div>

                <div className="compact-row-2">
                  <div className="compact-group">
                    <label className="compact-label" htmlFor="login-name">Your Name <span className="req">*</span></label>
                    <input
                      id="login-name"
                      className="compact-input"
                      type="text"
                      placeholder="e.g. Rahul Sharma"
                      value={name}
                      onChange={(e) => { setName(e.target.value); clearFieldErr('name') }}
                      style={errors.name ? { borderColor: '#ef4444' } : undefined}
                      ref={nameInputRef}
                      aria-required="true"
                      aria-invalid={!!errors.name}
                      aria-describedby="login-name-err"
                    />
                    <div className="field-err" id="login-name-err">{errors.name}</div>
                  </div>
                  <div className="compact-group">
                    <label className="compact-label" htmlFor="login-email">Email <span className="req">*</span></label>
                    <input
                      id="login-email"
                      className="compact-input"
                      type="email"
                      placeholder="yourname@gmail.com"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); clearFieldErr('email') }}
                      style={errors.email ? { borderColor: '#ef4444' } : undefined}
                      aria-required="true"
                      aria-invalid={!!errors.email}
                      aria-describedby="login-email-err"
                    />
                    <div className="field-err" id="login-email-err">{errors.email}</div>
                  </div>
                </div>

                <div className="compact-row-2">
                  <div className="compact-group">
                    <label className="compact-label" htmlFor="login-university">University <span className="req">*</span></label>
                    <select
                      id="login-university"
                      className="compact-input form-select"
                      value={university}
                      onChange={(e) => { setUniversity(e.target.value); clearFieldErr('university') }}
                      style={errors.university ? { borderColor: '#ef4444' } : undefined}
                      aria-required="true"
                      aria-invalid={!!errors.university}
                      aria-describedby="login-university-err"
                    >
                      <option value="">— Select —</option>
                      <option value="AKTU">AKTU (Dr. APJ Abdul Kalam Technical University)</option>
                    </select>
                    <div className="field-err" id="login-university-err">{errors.university}</div>
                  </div>
                  <div className="compact-group">
                    <label className="compact-label" htmlFor="login-course">Degree <span className="req">*</span></label>
                    <select
                      id="login-course"
                      className="compact-input form-select"
                      value={course}
                      onChange={(e) => handleCourseChange(e.target.value)}
                      style={errors.course ? { borderColor: '#ef4444' } : undefined}
                      aria-required="true"
                      aria-invalid={!!errors.course}
                      aria-describedby="login-course-err"
                    >
                      <option value="">— Select —</option>
                      <option value="B.Tech">B.Tech</option>
                    </select>
                    <div className="field-err" id="login-course-err">{errors.course}</div>
                  </div>
                </div>

                <div className="compact-row-2">
                  <div className="compact-group">
                    <label className="compact-label" htmlFor="login-college">College Name <span className="req">*</span></label>
                    <select
                      id="login-college"
                      className="compact-input form-select"
                      value={college}
                      onChange={(e) => { setCollege(e.target.value); clearFieldErr('college') }}
                      style={errors.college ? { borderColor: '#ef4444' } : undefined}
                      aria-required="true"
                      aria-invalid={!!errors.college}
                      aria-describedby="login-college-err"
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
                    <div className="field-err" id="login-college-err">{errors.college}</div>
                  </div>

                  <div className="compact-group">
                    <label className="compact-label" htmlFor="login-branch">Branch <span className="req">*</span></label>
                    <select
                      id="login-branch"
                      className="compact-input form-select"
                      value={branch}
                      onChange={(e) => { setBranch(e.target.value); clearFieldErr('branch') }}
                      style={errors.branch ? { borderColor: '#ef4444' } : undefined}
                      aria-required="true"
                      aria-invalid={!!errors.branch}
                      aria-describedby="login-branch-err"
                    >
                      <option value="">— Select Branch —</option>
                      {branchOptions.map((b) => (
                        <option value={b} key={b}>{b}</option>
                      ))}
                    </select>
                    <div className="field-err" id="login-branch-err">{errors.branch}</div>
                  </div>
                </div>

                {banner.text && <div className="err-msg" style={{ display: 'block', color: banner.color || undefined }}>{banner.text}</div>}
                <button className="btn-next" onClick={doLogin} disabled={contentLoading || isSubmitting}>
                  {isSubmitting ? 'Sending…' : contentLoading ? 'Loading…' : '📧 Continue →'}
                </button>

                {/* OR divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '1rem 0 0.6rem' }}>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600, letterSpacing: '1px' }}>OR</span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
                </div>

                {/* OAuth Buttons Row */}
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={doGoogleLogin}
                    disabled={oauthLoading !== null}
                    style={{
                      flex: 1, minWidth: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                      padding: '0.8rem 1rem', borderRadius: 14, cursor: oauthLoading ? 'default' : 'pointer', transition: 'all 0.2s',
                      background: 'var(--bg-card2)', border: '1.5px solid var(--border)',
                      fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)',
                      opacity: oauthLoading && oauthLoading !== 'google' ? 0.5 : 1,
                    }}
                  >
                    {oauthLoading === 'google' ? (
                      'Connecting…'
                    ) : (
                      <>
                        <svg width="17" height="17" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                          <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                          <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                        </svg>
                        Google
                      </>
                    )}
                  </button>

                  <button
                    onClick={doGithubLogin}
                    disabled={oauthLoading !== null}
                    style={{
                      flex: 1, minWidth: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                      padding: '0.8rem 1rem', borderRadius: 14, cursor: oauthLoading ? 'default' : 'pointer', transition: 'all 0.2s',
                      background: 'var(--bg-card2)', border: '1.5px solid var(--border)',
                      fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)',
                      opacity: oauthLoading && oauthLoading !== 'github' ? 0.5 : 1,
                    }}
                  >
                    {oauthLoading === 'github' ? (
                      'Connecting…'
                    ) : (
                      <>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                        </svg>
                        GitHub
                      </>
                    )}
                  </button>
                </div>

                <div className="privacy-note">🔒 Your data is securely stored. <span>Powered by Clerk.</span></div>
                <div style={{ textAlign: 'center', marginTop: '0.85rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14 }}>
                  <a
                    href="/terms-and-conditions.html"
                    style={{ fontFamily: "'Fira Code',monospace", fontSize: '0.7rem', color: 'rgba(100,116,139,0.7)', textDecoration: 'none', letterSpacing: '0.3px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    Terms &amp; Conditions
                  </a>
                  <a
                    href="/privacy-policy.html"
                    style={{ fontFamily: "'Fira Code',monospace", fontSize: '0.7rem', color: 'rgba(100,116,139,0.7)', textDecoration: 'none', letterSpacing: '0.3px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    Privacy Policy
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
