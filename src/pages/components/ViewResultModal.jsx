import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function ViewResultModal({ open, onClose }) {
  const [roll, setRoll] = useState('')
  const [dob, setDob] = useState('')

  useEffect(() => {
    if (open) {
      setRoll('')
      setDob('')
    }
  }, [open])

  function handleSubmit(e) {
    e.preventDefault()

    if (!roll.trim() || !dob) {
      alert('⚠️ Roll Number aur Date of Birth bharna zaroori hai!')
      return
    }

    // Date format conversion (YYYY-MM-DD -> DD/MM/YYYY)
    let formattedDob = dob
    if (dob.includes('-')) {
      const [year, month, day] = dob.split('-')
      formattedDob = `${day}/${month}/${year}`
    }

    // Direct Form Creation to Post directly to AKTU Portal
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = 'https://erp.aktu.ac.in/webpages/oneview/oneview.aspx'
    form.target = '_blank' // Opens result directly in new tab

    const rollInput = document.createElement('input')
    rollInput.type = 'hidden'
    rollInput.name = 'txtRollNo'
    rollInput.value = roll.trim()
    form.appendChild(rollInput)

    const dobInput = document.createElement('input')
    dobInput.type = 'hidden'
    dobInput.name = 'txtDOB'
    dobInput.value = formattedDob
    form.appendChild(dobInput)

    const btnInput = document.createElement('input')
    btnInput.type = 'hidden'
    btnInput.name = 'btnSearch'
    btnInput.value = 'Search'
    form.appendChild(btnInput)

    document.body.appendChild(form)
    form.submit()
    document.body.removeChild(form)

    onClose()
  }

  if (!open) return null

  return createPortal(
    <div id="viewResultModal" className="open">
      <div className="scan-card">
        <div style={{ paddingBottom: '1rem', borderBottom: '1px solid rgba(139,92,246,0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="scan-title">🎓 SEE RESULT</div>
            <button 
              onClick={onClose} 
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="scan-card-body" style={{ marginTop: 12 }}>
            <label style={{ fontSize: '0.8rem', color: '#a78bfa' }}>
              Roll Number
              <input 
                type="text" 
                value={roll} 
                onChange={(e) => setRoll(e.target.value)} 
                placeholder="e.g. 2400320100XX" 
                className="scan-sem-select" 
                style={{ marginTop: 4, width: '100%' }} 
                required
              />
            </label>

            <label style={{ fontSize: '0.8rem', color: '#a78bfa', marginTop: 10, display: 'block' }}>
              Date of Birth
              <input 
                type="date" 
                value={dob} 
                onChange={(e) => setDob(e.target.value)} 
                className="scan-sem-select" 
                style={{ marginTop: 4, width: '100%' }} 
                required
              />
            </label>
          </div>

          <div className="scan-actions" style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="submit" className="scan-btn-go">
              GET RESULT
            </button>
            <button type="button" className="scan-btn-cancel" onClick={onClose}>Close</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
