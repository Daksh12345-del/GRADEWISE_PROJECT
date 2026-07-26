import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuthUser } from '../../lib/useAuthUser'
import { submitQuickApply } from '../../lib/api'

// Quick Apply — collects the applicant's details on Gradewallah, shows a
// review/confirm step, saves the lead to our own backend, then hands off
// to the real listing's apply page (still the source of truth for the
// actual application — we can't and don't fill any third-party form).
//
// Rendered via a portal directly to document.body — same reason as
// ScanModal: .page.active has `transform: translateZ(0)` for a GPU
// compositing fix, which breaks position:fixed for any modal nested
// inside it. Portal sidesteps that entirely.
export default function QuickApplyModal({ item, onClose }) {
  const { user } = useAuthUser()
  const [step, setStep] = useState('form') // 'form' | 'review' | 'done'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [phone, setPhone] = useState('')
  const [degree, setDegree] = useState(user?.branch || '')
  const [resumeLink, setResumeLink] = useState('')

  function validateAndReview() {
    if (!name.trim() || !email.trim() || !degree.trim()) {
      setError('Please fill in your name, email, and degree/branch.')
      return
    }
    setError('')
    setStep('review')
  }

  async function confirmAndSubmit() {
    setBusy(true)
    setError('')
    try {
      await submitQuickApply({
        item_unique_id: item.unique_id,
        item_type: item.type || 'internship',
        item_title: item.title,
        item_company: item.company,
        applicant_name: name.trim(),
        applicant_email: email.trim(),
        applicant_phone: phone.trim(),
        applicant_degree: degree.trim(),
        resume_link: resumeLink.trim(),
      })
      setStep('done')
    } catch (e) {
      setError(e.message || 'Something went wrong saving your details. You can still apply directly below.')
    } finally {
      setBusy(false)
    }
  }

  function goToRealSite() {
    window.open(item.apply_url, '_blank', 'noopener,noreferrer')
    onClose()
  }

  return createPortal(
    <div className="qa-overlay" role="dialog" aria-modal="true" aria-label="Quick Apply">
      <div className="qa-card">
        <div className="qa-header">
          <div>
            <div className="qa-title">⚡ Quick Apply</div>
            <div className="qa-subtitle">{item.title} · {item.company}</div>
          </div>
          <button className="qa-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="qa-body">
          {step === 'form' && (
            <>
              <p className="qa-note">
                Fill this once — we'll save it so Gradewallah can follow up with relevant
                opportunities. Then we'll take you to {item.company}'s actual application page
                to finish applying there.
              </p>

              <div className="qa-field">
                <label className="qa-label" htmlFor="qa-name">Full Name *</label>
                <input id="qa-name" className="qa-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rahul Sharma" />
              </div>
              <div className="qa-field">
                <label className="qa-label" htmlFor="qa-email">Email *</label>
                <input id="qa-email" className="qa-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="yourname@gmail.com" />
              </div>
              <div className="qa-field">
                <label className="qa-label" htmlFor="qa-phone">Phone</label>
                <input id="qa-phone" className="qa-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
              </div>
              <div className="qa-field">
                <label className="qa-label" htmlFor="qa-degree">Degree / Branch *</label>
                <input id="qa-degree" className="qa-input" value={degree} onChange={(e) => setDegree(e.target.value)} placeholder="e.g. B.Tech CSE" />
              </div>
              <div className="qa-field">
                <label className="qa-label" htmlFor="qa-resume">Resume Link</label>
                <input id="qa-resume" className="qa-input" value={resumeLink} onChange={(e) => setResumeLink(e.target.value)} placeholder="Optional — Google Drive / Dropbox link" />
              </div>

              {error && <div className="qa-error">⚠️ {error}</div>}

              <button className="qa-btn-primary" onClick={validateAndReview}>Review →</button>
            </>
          )}

          {step === 'review' && (
            <>
              <p className="qa-note">Double-check before we save this:</p>
              <div className="qa-review-row"><span>Name</span><strong>{name}</strong></div>
              <div className="qa-review-row"><span>Email</span><strong>{email}</strong></div>
              <div className="qa-review-row"><span>Phone</span><strong>{phone || '—'}</strong></div>
              <div className="qa-review-row"><span>Degree / Branch</span><strong>{degree}</strong></div>
              <div className="qa-review-row"><span>Resume</span><strong>{resumeLink || '—'}</strong></div>

              {error && <div className="qa-error">⚠️ {error}</div>}

              <div className="qa-review-actions">
                <button className="qa-btn-secondary" onClick={() => setStep('form')} disabled={busy}>← Edit</button>
                <button className="qa-btn-primary" onClick={confirmAndSubmit} disabled={busy}>
                  {busy ? 'Saving…' : 'Confirm & Continue'}
                </button>
              </div>
            </>
          )}

          {step === 'done' && (
            <>
              <div className="qa-success">✅ Saved! Now let's get you to {item.company}'s application page.</div>
              <p className="qa-note">
                Copy your details below if you need them on the next page:
              </p>
              {[
                ['Name', name], ['Email', email], ['Phone', phone || '—'],
                ['Degree / Branch', degree], ['Resume', resumeLink || '—'],
              ].map(([label, value]) => (
                <div className="qa-copy-row" key={label}>
                  <span className="qa-copy-label">{label}</span>
                  <span className="qa-copy-value">{value}</span>
                  {value !== '—' && (
                    <button
                      className="qa-copy-btn"
                      onClick={() => navigator.clipboard?.writeText(value)}
                      title={`Copy ${label}`}
                    >📋 Copy</button>
                  )}
                </div>
              ))}
              <button className="qa-btn-primary" onClick={goToRealSite}>Continue to Apply on {item.company} →</button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
