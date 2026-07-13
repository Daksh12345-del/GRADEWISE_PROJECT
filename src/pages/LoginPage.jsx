import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSignIn, useSignUp, useUser } from '@clerk/clerk-react'
import { COLLEGES_BY_CITY, BRANCHES, DOMAIN_GROUPS } from '../lib/loginFormData'

// ── Client-side rate limiting: max 5 attempts per 15 minutes ──
// (Clerk also rate-limits sign-in/sign-up attempts server-side.)
const LOGIN_MAX = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1000
let loginAttempts = { count: 0, resetAt: 0 }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginPage() {
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

  const [step, setStep] = useState(1)

  // Email-verification sub-step (only reached for brand-new accounts if
  // your Clerk instance has "email verification code" turned on — see
  // CLERK_MIGRATION.md). Existing accounts and instances with verification
  // off never see this.
  const [pendingVerification, setPendingVerification] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [verificationErr, setVerificationErr] = useState('')

  // Step 1 fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [university, setUniversity] = useState('')
  const [course, setCourse] = useState('')

  // Step 2 fields
  const [college, setCollege] = useState('')
  const [roll, setRoll] = useState('')
  const [branch, setBranch] = useState('')
  const [group, setGroup] = useState('')
  const [domain, setDomain] = useState('')

  // Errors
  const [errors, setErrors] = useState({})
  const [banner1, setBanner1] = useState('')
  const [banner2, setBanner2] = useState({ text: '', color: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const showGroupSelector = university === 'AKTU'
  const branchOptions = BRANCHES[course] || []

  // Auto-focus the first field whenever the step changes — small UX win,
  // the original site never moved focus on page-swap so users had to
  // click into the form manually every time.
  const nameInputRef = useRef(null)
  const collegeSelectRef = useRef(null)
  useEffect(() => {
    const target = step === 1 ? nameInputRef.current : collegeSelectRef.current
    target?.focus()
  }, [step])

  function clearFieldErr(field) {
    setErrors((prev) => ({ ...prev, [field]: '' }))
    setBanner1('')
    setBanner2({ text: '', color: '' })
  }

  function handleCourseChange(value) {
    setCourse(value)
    setBranch('') // reset branch when course changes, same as old updateBranches()
    clearFieldErr('course')
  }

  function goStep2() {
    const trimmedName = name.trim()
    const trimmedEmail = email.trim()
    const trimmedUniv = university.trim()
    const trimmedCourse = course.trim()

    const newErrors = {}
    if (!trimmedName) newErrors.name = 'Please enter your name.'
    if (!trimmedEmail) newErrors.email = 'Please enter your email.'
    else if (!EMAIL_RE.test(trimmedEmail)) newErrors.email = 'That doesn\'t look like a valid email.'
    if (!trimmedUniv) newErrors.university = 'Please select your university.'
    if (!trimmedCourse) newErrors.course = 'Please select your course.'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setBanner1('⚠️ Please fill in all fields above to continue.')
      return
    }

    setErrors({})
    setBanner1('')
    setStep(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function goStep1() {
    setErrors({})
    setBanner2({ text: '', color: '' })
    setStep(1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function selectGroup(val) {
    setGroup(val)
    setErrors((prev) => ({ ...prev, group: '' }))
  }

  async function doLogin() {
    // Rate limit check
    const now = Date.now()
    if (now > loginAttempts.resetAt) {
      loginAttempts = { count: 0, resetAt: now + LOGIN_WINDOW_MS }
    }
    if (loginAttempts.count >= LOGIN_MAX) {
      const wait = Math.ceil((loginAttempts.resetAt - now) / 60000)
      setBanner2({ text: `⛔ Too many attempts. Please wait ${wait} minute(s).`, color: '' })
      return
    }
    loginAttempts.count++

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
    if (showGroupSelector && !group) newErrors.group = 'Please select your batch group (A or B).'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})
    setBanner2({ text: '', color: '' })
    setIsSubmitting(true)

    const trimmedName = name.trim()
    const trimmedEmail = email.trim()
    const trimmedUniv = university.trim()
    const trimmedCourse = course.trim()

    const profileMeta = {
      name: trimmedName,
      university: trimmedUniv,
      course: trimmedCourse,
      college: trimmedCollege,
      roll: trimmedRoll,
      branch: trimmedBranch,
      domain: trimmedDomain,
      group,
    }

    if (!signInLoaded || !signUpLoaded) {
      setIsSubmitting(false)
      setBanner2({ text: '⚠️ Still loading, please try again in a moment.', color: '' })
      return
    }

    // ── Auth flow: try sign-in first, then sign-up for new users ──
    // (Same two-step logic as before, just against Clerk instead of
    // Supabase Auth — email is the identifier, Roll Number is the password.)
    try {
      const signInAttempt = await signIn.create({ identifier: trimmedEmail, password: trimmedRoll })
      if (signInAttempt.status === 'complete') {
        await setActiveSignIn({ session: signInAttempt.createdSessionId })
        // Keep the profile fields fresh in case anything changed since signup.
        try { await window.Clerk?.user?.update({ unsafeMetadata: profileMeta }) } catch { /* non-fatal */ }
        setIsSubmitting(false)
        navigate('/dashboard')
        return
      }
      // Some other in-progress status (e.g. MFA) — this simple flow doesn't handle it.
      setIsSubmitting(false)
      setBanner2({ text: '⚠️ This account needs extra verification steps this page doesn\'t support yet.', color: '' })
      return
    } catch (signInErr) {
      const code = signInErr?.errors?.[0]?.code || ''

      if (code === 'form_password_incorrect') {
        // Account exists, but the roll number they typed doesn't match.
        setIsSubmitting(false)
        setBanner2({
          text: '⚠️ This email is already registered. Make sure your Roll Number matches the one you used when you first signed up — it is your password.',
          color: '#f97316',
        })
        return
      }

      if (code !== 'form_identifier_not_found') {
        // Any other unexpected error — surface it, don't silently fall through to sign-up.
        setIsSubmitting(false)
        setBanner2({ text: '⚠️ Auth error: ' + (signInErr?.errors?.[0]?.message || signInErr.message), color: '' })
        return
      }
      // else: no account with this email yet — fall through to sign-up below.
    }

    try {
      const signUpAttempt = await signUp.create({
        emailAddress: trimmedEmail,
        password: trimmedRoll,
        unsafeMetadata: profileMeta,
      })

      if (signUpAttempt.status === 'complete') {
        await setActiveSignUp({ session: signUpAttempt.createdSessionId })
        setIsSubmitting(false)
        navigate('/dashboard')
        return
      }

      if (signUpAttempt.unverifiedFields?.includes('email_address')) {
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
        setIsSubmitting(false)
        setPendingVerification(true)
        setBanner2({ text: `📧 We sent a 6-digit code to ${trimmedEmail}. Enter it below to finish.`, color: '#06b6d4' })
        return
      }

      setIsSubmitting(false)
      setBanner2({ text: '⚠️ Could not create your account. Please try again.', color: '' })
    } catch (signUpErr) {
      setIsSubmitting(false)
      const msg = signUpErr?.errors?.[0]?.message || signUpErr.message || ''
      if (msg.toLowerCase().includes('already')) {
        setBanner2({
          text: '⚠️ This email is already registered. Make sure your Roll Number matches the one you used when you first signed up — it is your password.',
          color: '#f97316',
        })
      } else {
        setBanner2({ text: '⚠️ Auth error: ' + msg, color: '' })
      }
    }
  }

  // Only reached if your Clerk instance requires email verification on
  // sign-up (see the pendingVerification banner above).
  async function confirmVerificationCode() {
    if (!verificationCode.trim() || !signUpLoaded) return
    setVerificationErr('')
    setIsSubmitting(true)
    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code: verificationCode.trim() })
      if (attempt.status === 'complete') {
        await setActiveSignUp({ session: attempt.createdSessionId })
        setIsSubmitting(false)
        navigate('/dashboard')
        return
      }
      setIsSubmitting(false)
      setVerificationErr("That code didn't work. Please check and try again.")
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
      setBanner1('⚠️ Google sign-in failed: ' + (error?.errors?.[0]?.message || error.message))
      setOauthLoading(null)
    }
    // On success, the browser redirects away — no need to reset state.
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
      setBanner1('⚠️ GitHub sign-in failed: ' + (error?.errors?.[0]?.message || error.message))
      setOauthLoading(null)
    }
  }

  return (
    <div className="page active" id="loginPage">
      <div className="login-glow"></div>

      <div className="onboard-wrap">
        {/* Hero Greeting */}
        <div className="hero-greet">
          <div className="hero-emoji" style={{ fontSize: 'unset', display: 'flex', justifyContent: 'center' }}>
            <img src="/images/img_3.png" width="80" height="80" alt="Gradewallah Logo" style={{ borderRadius: '50%' }} />
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

        {/* Onboard Card */}
        <div className="onboard-card">
          {/* Step indicator */}
          <div className="step-bar">
            <div
              className={`step-dot ${step === 1 ? 'active' : 'done'}`}
              id="sdot-1"
              onClick={step === 2 ? goStep1 : undefined}
              style={step === 2 ? { cursor: 'pointer' } : undefined}
              title={step === 2 ? 'Back to step 1' : undefined}
            >
              {step === 1 ? '1' : '✓'}
            </div>
            <div className={`step-line ${step === 2 ? 'done' : ''}`} id="sline-1"></div>
            <div className={`step-dot ${step === 2 ? 'active' : ''}`} id="sdot-2">2</div>
          </div>
          <div className="step-labels">
            <div className={`step-lbl ${step === 1 ? 'active' : 'done'}`} id="slbl-1">👋 About You</div>
            <div className={`step-lbl ${step === 2 ? 'active' : ''}`} id="slbl-2">🏫 Your College</div>
          </div>

          {/* ── STEP 1: Basic Info ── */}
          {step === 1 && (
            <div
              className="step-panel active"
              id="step-1"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); goStep2() } }}
            >
              <div className="step-heading">Hey there! Let's get started 👋</div>
              <div className="step-sub">Just 2 quick questions — your info stays on your device only.</div>

              <div className="compact-row-2">
                <div className="compact-group">
                  <label className="compact-label">Your Name <span className="req">*</span></label>
                  <input
                    className="compact-input"
                    type="text"
                    placeholder="e.g. Rahul Sharma"
                    value={name}
                    onChange={(e) => { setName(e.target.value); clearFieldErr('name') }}
                    style={errors.name ? { borderColor: '#ef4444' } : undefined}
                    ref={nameInputRef}
                  />
                  <div className="field-err">{errors.name}</div>
                </div>
                <div className="compact-group">
                  <label className="compact-label">Email <span className="req">*</span></label>
                  <input
                    className="compact-input"
                    type="email"
                    placeholder="yourname@gmail.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearFieldErr('email') }}
                    style={errors.email ? { borderColor: '#ef4444' } : undefined}
                  />
                  <div className="field-err">{errors.email}</div>
                </div>
              </div>

              <div className="compact-row-2">
                <div className="compact-group">
                  <label className="compact-label">University <span className="req">*</span></label>
                  <select
                    className="compact-input form-select"
                    value={university}
                    onChange={(e) => { setUniversity(e.target.value); clearFieldErr('university') }}
                    style={errors.university ? { borderColor: '#ef4444' } : undefined}
                  >
                    <option value="">— Select —</option>
                    <option value="AKTU">AKTU (Dr. APJ Abdul Kalam Technical University)</option>
                  </select>
                  <div className="field-err">{errors.university}</div>
                </div>
                <div className="compact-group">
                  <label className="compact-label">Course <span className="req">*</span></label>
                  <select
                    className="compact-input form-select"
                    value={course}
                    onChange={(e) => handleCourseChange(e.target.value)}
                    style={errors.course ? { borderColor: '#ef4444' } : undefined}
                  >
                    <option value="">— Select —</option>
                    <option value="B.Tech">B.Tech</option>
                  </select>
                  <div className="field-err">{errors.course}</div>
                </div>
              </div>

              {banner1 && <div className="err-msg" style={{ display: 'block' }}>{banner1}</div>}
              <button className="btn-next" onClick={goStep2}>Continue →</button>

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
            </div>
          )}

          {/* ── STEP 2: College Details ── */}
          {step === 2 && (
            <div
              className="step-panel active"
              id="step-2"
              onKeyDown={(e) => { if (e.key === 'Enter' && !isSubmitting) { e.preventDefault(); doLogin() } }}
            >
              <div className="welcome-note">
                <span style={{ fontSize: '1.5rem' }}>🎉</span>
                <div className="welcome-note-txt">
                  Almost there, <strong>{name.trim().split(' ')[0] || 'friend'}</strong>! A few more details to unlock your <strong>personalised Analyser</strong>.
                </div>
              </div>

              {pendingVerification ? (
                <div>
                  {banner2.text && (
                    <div className="err-msg" style={{ display: 'block', color: banner2.color || undefined, marginBottom: '0.9rem' }}>
                      {banner2.text}
                    </div>
                  )}
                  <div className="compact-group">
                    <label className="compact-label">Verification Code <span className="req">*</span></label>
                    <input
                      className="compact-input"
                      type="text"
                      inputMode="numeric"
                      placeholder="6-digit code"
                      maxLength={6}
                      value={verificationCode}
                      onChange={(e) => { setVerificationCode(e.target.value); setVerificationErr('') }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !isSubmitting) { e.preventDefault(); confirmVerificationCode() } }}
                      style={verificationErr ? { borderColor: '#ef4444' } : undefined}
                    />
                    <div className="field-err">{verificationErr}</div>
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
                      onClick={() => { setPendingVerification(false); setVerificationCode(''); setVerificationErr(''); setBanner2({ text: '', color: '' }) }}
                      style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                    >
                      ← Back
                    </button>
                  </div>
                </div>
              ) : (
              <>
              <div className="compact-group">
                <label className="compact-label">College Name <span className="req">*</span></label>
                <select
                  className="compact-input form-select"
                  value={college}
                  onChange={(e) => { setCollege(e.target.value); clearFieldErr('college') }}
                  style={errors.college ? { borderColor: '#ef4444' } : undefined}
                  ref={collegeSelectRef}
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
                  <label className="compact-label">Roll Number <span className="req">*</span></label>
                  <input
                    className="compact-input"
                    type="text"
                    placeholder="e.g. 2300100300001"
                    maxLength={20}
                    value={roll}
                    onChange={(e) => { setRoll(e.target.value); clearFieldErr('roll') }}
                    style={errors.roll ? { borderColor: '#ef4444' } : undefined}
                  />
                  <div className="field-err">{errors.roll}</div>
                </div>
                <div className="compact-group">
                  <label className="compact-label">Branch <span className="req">*</span></label>
                  <select
                    className="compact-input form-select"
                    value={branch}
                    onChange={(e) => { setBranch(e.target.value); clearFieldErr('branch') }}
                    style={errors.branch ? { borderColor: '#ef4444' } : undefined}
                  >
                    <option value="">— Select Branch —</option>
                    {branchOptions.map((b) => (
                      <option value={b} key={b}>{b}</option>
                    ))}
                  </select>
                  <div className="field-err">{errors.branch}</div>
                </div>
              </div>

              {showGroupSelector && (
                <div className="compact-group">
                  <label className="compact-label">📚 Which do you have in Semester I? <span className="req">*</span></label>
                  <div style={{ display: 'flex', gap: '0.7rem', marginTop: '0.4rem' }}>
                    <label
                      className="grp-radio-lbl"
                      onClick={() => selectGroup('A')}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer',
                        borderRadius: 10, padding: '0.7rem 0.8rem', transition: 'all 0.2s',
                        border: group === 'A' ? '1.5px solid #06b6d4' : '1.5px solid rgba(6,182,212,0.25)',
                        background: group === 'A' ? 'rgba(6,182,212,0.08)' : 'transparent',
                      }}
                    >
                      <input type="radio" name="batch_group" checked={group === 'A'} onChange={() => selectGroup('A')} style={{ accentColor: '#06b6d4', width: 16, height: 16 }} />
                      <div>
                        <div style={{ fontWeight: 700, color: '#06b6d4', fontSize: '0.88rem' }}>🔵 Physics</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>Sem I → Physics + Electrical &nbsp;|&nbsp; Sem II → Chemistry + Electronics</div>
                      </div>
                    </label>
                    <label
                      className="grp-radio-lbl"
                      onClick={() => selectGroup('B')}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer',
                        borderRadius: 10, padding: '0.7rem 0.8rem', transition: 'all 0.2s',
                        border: group === 'B' ? '1.5px solid #a78bfa' : '1.5px solid rgba(6,182,212,0.25)',
                        background: group === 'B' ? 'rgba(167,139,250,0.08)' : 'transparent',
                      }}
                    >
                      <input type="radio" name="batch_group" checked={group === 'B'} onChange={() => selectGroup('B')} style={{ accentColor: '#a78bfa', width: 16, height: 16 }} />
                      <div>
                        <div style={{ fontWeight: 700, color: '#a78bfa', fontSize: '0.88rem' }}>🟣 Chemistry</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>Sem I → Chemistry + Electronics &nbsp;|&nbsp; Sem II → Physics + Electrical</div>
                      </div>
                    </label>
                  </div>
                  <div className="field-err">{errors.group}</div>
                </div>
              )}

              <div className="compact-group">
                <label className="compact-label">Domain of Interest <span className="req">*</span></label>
                <select
                  className="compact-input form-select"
                  value={domain}
                  onChange={(e) => { setDomain(e.target.value); clearFieldErr('domain') }}
                  style={errors.domain ? { borderColor: '#ef4444' } : undefined}
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

              {banner2.text && (
                <div className="err-msg" style={{ display: 'block', color: banner2.color || undefined }}>
                  {banner2.text}
                </div>
              )}
              <button
                className="btn-login btn-next"
                onClick={doLogin}
                disabled={isSubmitting}
                style={{ background: 'linear-gradient(135deg,#10b981,#06b6d4)' }}
              >
                {isSubmitting ? 'Connecting…' : '🚀 Launch Gradewallah'}
              </button>
              <div style={{ textAlign: 'center', marginTop: '0.7rem' }}>
                <button
                  onClick={goStep1}
                  style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                >
                  ← Back
                </button>
              </div>
              </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
