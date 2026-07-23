import { SEMESTERS } from './gradesData'
import {
  getTotal, getGrade, getGradeNoGrace, getGradeForInternalOnly,
  calcSGPA, calcSGPAWithBack, calcCGPAWithBack, calcCGPA,
} from './gradesEngine'

const GRADE_COLORS = { 'A+': '#0284c7', 'A': '#7c3aed', 'B+': '#4f46e5', 'B': '#059669', 'C': '#d97706', 'D': '#ea580c', 'E#': '#c2410c', 'F': '#dc2626' }

// Graced total for E# subjects — same rule as the live grade engine
// (deficit capped at 7 marks, only applies to Theory/Elective). Kept local
// to the report since nothing else needs the raw graced total value.
function effectiveTotalFor(entry, subj) {
  const total = getTotal(entry)
  if (total === null) return null
  if (subj.type !== 'Theory' && subj.type !== 'Elective') return total
  const ext = typeof entry === 'object' ? parseFloat(entry.external) : NaN
  if (isNaN(ext) || ext >= 21) return total
  const deficit = 40 - total
  if (deficit <= 0) return total
  const grace = Math.min(deficit, 7)
  return total + grace
}

export function generateAndOpenReport(marksData, backData, profile) {
  const { cgpa: cgpaBack, hasAnyBack: exportHasBack } = calcCGPAWithBack(marksData, backData)
  const cgpaBase = calcCGPA(marksData)
  const cgpa = exportHasBack && cgpaBack > cgpaBase ? cgpaBack : cgpaBase
  const allSGPAs = SEMESTERS.map((_, si) => {
    const base = calcSGPA(si, marksData)
    const { sgpa: withBack, hasAnyBack } = calcSGPAWithBack(si, marksData, backData)
    return hasAnyBack && withBack > base ? withBack : base
  })
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
  const cgpaColor = cgpa >= 9 ? '#0284c7' : cgpa >= 8 ? '#7c3aed' : cgpa >= 7 ? '#059669' : cgpa >= 6 ? '#d97706' : '#dc2626'

  const semesterSections = SEMESTERS.map((sem, si) => {
    const sgpa = allSGPAs[si]
    if (sgpa === 0) return ''

    const semHasBack = sem.subjects.some((subj, ji) => {
      if (subj.audit || (subj.type !== 'Theory' && subj.type !== 'Elective')) return false
      const backExt = backData[si]?.[ji]
      if (!backExt || backExt === '') return false
      const origGrade = getGrade(marksData[si]?.[ji], subj)
      return origGrade && (origGrade.grade === 'F' || origGrade.grade === 'E#')
    })

    const rows = sem.subjects.map((subj, ji) => {
      const entry = marksData[si]?.[ji]
      const total = getTotal(entry)
      const origGrade = subj.internalOnly ? getGradeForInternalOnly(entry, subj) : getGrade(entry, subj)
      const effTotal = effectiveTotalFor(entry, subj)
      const intVal = typeof entry === 'object' && entry?.internal !== '' ? entry.internal : null
      const extVal = typeof entry === 'object' && entry?.external !== '' ? entry.external : null

      const backExt = backData[si]?.[ji]
      const backNum = parseFloat(backExt)
      const origIsFailOrGrace = origGrade && (origGrade.grade === 'F' || origGrade.grade === 'E#')
      const hasValidBack = !isNaN(backNum) && backExt !== '' && origIsFailOrGrace &&
        (subj.type === 'Theory' || subj.type === 'Elective')

      let effectiveGrade = origGrade
      let backTotal = null
      if (hasValidBack) {
        const internal = typeof entry === 'object' ? parseFloat(entry.internal) : NaN
        const backEntry = { internal: isNaN(internal) ? '' : String(internal), external: String(backNum) }
        effectiveGrade = getGradeNoGrace(backEntry)
        backTotal = isNaN(internal) ? backNum : internal + backNum
      }

      const gradeLabel = subj.audit ? (total !== null ? total : '–') : (effectiveGrade ? effectiveGrade.grade : '–')
      const marksVal = origGrade && origGrade.grade === 'E#' && effTotal !== null && !hasValidBack
        ? `${effTotal}*`
        : hasValidBack ? (backTotal !== null ? backTotal : total !== null ? total : '–') : (total !== null ? total : '–')

      const gradeColor = effectiveGrade ? (GRADE_COLORS[effectiveGrade.grade] || '#374151') : '#6b7280'

      let rowBg = '#ffffff'
      if (hasValidBack) {
        rowBg = effectiveGrade && effectiveGrade.grade !== 'F' ? 'rgba(16,185,129,0.06)' : 'rgba(220,38,38,0.07)'
      } else if (origGrade && origGrade.grade === 'F') {
        rowBg = 'rgba(220,38,38,0.07)'
      } else if (origGrade && origGrade.grade === 'E#') {
        rowBg = 'rgba(234,88,12,0.06)'
      }

      const backCell = semHasBack
        ? (hasValidBack
          ? `<td style="padding:8px 10px;text-align:center;font-family:'Courier New',monospace;font-size:14px;color:#059669;font-weight:800;background:rgba(16,185,129,0.06);">${backNum}<div style="font-size:9px;color:#059669;letter-spacing:1px;font-weight:700;margin-top:1px;">BACK</div></td>`
          : `<td style="padding:8px 10px;text-align:center;color:#d1d5db;font-size:13px;">–</td>`)
        : ''

      return `<tr style="border-bottom:1px solid #e5e7eb;background:${rowBg};">
        <td style="padding:8px 10px;font-family:'Courier New',monospace;font-size:14px;font-weight:800;color:#0284c7;">${subj.code}</td>
        <td style="padding:8px 10px;font-size:14px;color:#111827;font-weight:700;">${subj.name}</td>
        <td style="padding:8px 10px;text-align:center;font-size:13px;color:#374151;font-weight:600;">${subj.type}</td>
        <td style="padding:8px 10px;text-align:center;font-size:14px;color:#111827;font-weight:800;">${subj.credits === 0 ? 'Audit' : subj.credits}</td>
        <td style="padding:8px 10px;text-align:center;font-family:'Courier New',monospace;font-size:14px;color:#1f2937;font-weight:700;">${intVal !== null ? intVal : '–'}</td>
        <td style="padding:8px 10px;text-align:center;font-family:'Courier New',monospace;font-size:14px;color:#1f2937;font-weight:700;">${extVal !== null ? extVal : '–'}</td>
        ${backCell}
        <td style="padding:8px 10px;text-align:center;font-family:'Courier New',monospace;font-size:15px;font-weight:900;color:#111827;">${marksVal}</td>
        <td style="padding:8px 10px;text-align:center;"><span style="background:${gradeColor}18;color:${gradeColor};border:2px solid ${gradeColor}66;border-radius:6px;padding:4px 12px;font-size:14px;font-weight:900;font-family:'Courier New',monospace;">${gradeLabel}</span></td>
      </tr>`
    }).join('')

    const sgpaColor = sgpa >= 9 ? '#0284c7' : sgpa >= 8 ? '#7c3aed' : sgpa >= 7 ? '#059669' : sgpa >= 6 ? '#d97706' : '#dc2626'
    const backColHeader = semHasBack
      ? `<th style="padding:10px 10px;text-align:center;font-size:12px;color:#059669;letter-spacing:2px;font-weight:800;text-transform:uppercase;background:rgba(16,185,129,0.06);">Back Ext</th>`
      : ''

    return `<div style="margin-bottom:28px;break-inside:avoid;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid rgba(6,182,212,0.4);">
        <div>
          <div style="font-family:'Courier New',monospace;font-size:16px;font-weight:800;color:#0284c7;letter-spacing:2px;text-transform:uppercase;">${sem.label}</div>
          <div style="font-size:13px;color:#374151;margin-top:2px;font-weight:600;">Total Credits: ${sem.totalCredits}${semHasBack ? ' &nbsp;|&nbsp; <span style="color:#059669;">📋 Back Paper Result Included</span>' : ''}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;color:#4b5563;letter-spacing:2px;text-transform:uppercase;font-weight:700;">SGPA</div>
          <div style="font-family:'Courier New',monospace;font-size:26px;font-weight:900;color:${sgpaColor};">${sgpa.toFixed(2)}</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f0f9ff;border-bottom:2px solid rgba(6,182,212,0.3);">
            <th style="padding:10px 10px;text-align:left;font-size:12px;color:#0284c7;letter-spacing:2px;font-weight:800;text-transform:uppercase;">Code</th>
            <th style="padding:10px 10px;text-align:left;font-size:12px;color:#0284c7;letter-spacing:2px;font-weight:800;text-transform:uppercase;">Subject</th>
            <th style="padding:10px 10px;text-align:center;font-size:12px;color:#0284c7;letter-spacing:2px;font-weight:800;text-transform:uppercase;">Type</th>
            <th style="padding:10px 10px;text-align:center;font-size:12px;color:#0284c7;letter-spacing:2px;font-weight:800;text-transform:uppercase;">Cr.</th>
            <th style="padding:10px 10px;text-align:center;font-size:12px;color:#0284c7;letter-spacing:2px;font-weight:800;text-transform:uppercase;">Int</th>
            <th style="padding:10px 10px;text-align:center;font-size:12px;color:#0284c7;letter-spacing:2px;font-weight:800;text-transform:uppercase;">Ext</th>
            ${backColHeader}
            <th style="padding:10px 10px;text-align:center;font-size:12px;color:#0284c7;letter-spacing:2px;font-weight:800;text-transform:uppercase;">Total</th>
            <th style="padding:10px 10px;text-align:center;font-size:12px;color:#0284c7;letter-spacing:2px;font-weight:800;text-transform:uppercase;">Grade</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
  }).join('')

  const sgpaBars = allSGPAs.map((s, i) => {
    if (s === 0) return ''
    const barColor = s >= 9 ? '#0284c7' : s >= 8 ? '#7c3aed' : s >= 7 ? '#059669' : s >= 6 ? '#d97706' : '#dc2626'
    const barWidth = Math.round((s / 10) * 100)
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      <div style="width:55px;font-size:13px;color:#1f2937;font-family:'Courier New',monospace;flex-shrink:0;font-weight:700;">Sem ${i + 1}</div>
      <div style="flex:1;background:#e5e7eb;border-radius:4px;height:12px;overflow:hidden;">
        <div style="width:${barWidth}%;height:100%;background:linear-gradient(90deg,${barColor},${barColor}99);border-radius:4px;"></div>
      </div>
      <div style="width:45px;font-family:'Courier New',monospace;font-size:14px;font-weight:900;color:${barColor};text-align:right;">${s.toFixed(2)}</div>
    </div>`
  }).join('')

  const gradingLegend = [
    { range: '90–100', g: 'A+', c: '#0284c7', pts: 10 },
    { range: '80–89', g: 'A', c: '#7c3aed', pts: 9 },
    { range: '70–79', g: 'B+', c: '#4f46e5', pts: 8 },
    { range: '60–69', g: 'B', c: '#059669', pts: 7 },
    { range: '50–59', g: 'C', c: '#d97706', pts: 6 },
    { range: '40–49', g: 'D', c: '#ea580c', pts: 5 },
    { range: 'Grace', g: 'E#', c: '#c2410c', pts: 0, note: 'full cr' },
    { range: '< 40', g: 'F', c: '#dc2626', pts: 0, note: 'full cr' },
  ].map((r) => `<div style="display:flex;align-items:center;gap:8px;background:${r.c}18;border:1.5px solid ${r.c}55;border-radius:8px;padding:7px 14px;">
      <span style="font-family:'Courier New',monospace;font-size:15px;font-weight:900;color:${r.c};">${r.g}</span>
      <span style="font-size:13px;color:#475569;font-weight:600;">${r.range}</span>
      <span style="font-size:12px;color:#64748b;font-weight:700;">${r.pts}pts${r.note ? ' · ' + r.note : ''}</span>
    </div>`).join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>AKTU CGPA Report – ${profile.name || 'Student'}</title>
</head>
<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;padding:28px 20px;">

<div class="no-print" style="position:fixed;top:20px;right:20px;z-index:999;display:flex;gap:10px;">
  <button onclick="window.print()" style="background:linear-gradient(135deg,#06b6d4,#8b5cf6);border:none;border-radius:10px;padding:12px 24px;color:white;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:2px;">🖨️ PRINT / SAVE PDF</button>
  <button onclick="window.close()" style="background:rgba(100,116,139,0.2);border:1px solid rgba(100,116,139,0.3);border-radius:10px;padding:12px 18px;color:#475569;font-size:14px;cursor:pointer;">✕ Close</button>
</div>

<div style="max-width:900px;margin:0 auto;">

  <div style="background:linear-gradient(135deg,rgba(6,182,212,0.08),rgba(139,92,246,0.08));border:2px solid rgba(6,182,212,0.4);border-radius:20px;padding:32px 36px;margin-bottom:28px;position:relative;overflow:hidden;">
    <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,#06b6d4,#8b5cf6,transparent);"></div>
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:20px;">
      <div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="width:48px;height:48px;background:linear-gradient(135deg,rgba(6,182,212,0.3),rgba(139,92,246,0.3));border:2px solid #06b6d4;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;color:#06b6d4;font-family:'Courier New',monospace;">AK</div>
          <div>
            <div style="font-family:'Courier New',monospace;font-size:18px;font-weight:900;color:#06b6d4;letter-spacing:3px;">AKTU CSE CGPA REPORT</div>
            <div style="font-size:12px;color:#64748b;letter-spacing:1px;margin-top:2px;">Dr. A.P.J. Abdul Kalam Technical University</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;">
          <div><span style="font-size:11px;color:#6b7280;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Student</span><br><span style="font-size:16px;font-weight:800;color:#111827;">${profile.name || '–'}</span></div>
          <div><span style="font-size:11px;color:#6b7280;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Roll Number</span><br><span style="font-size:16px;font-weight:800;color:#111827;font-family:'Courier New',monospace;">${profile.roll || '–'}</span></div>
          <div><span style="font-size:11px;color:#6b7280;letter-spacing:2px;text-transform:uppercase;font-weight:700;">College</span><br><span style="font-size:14px;color:#1f2937;font-weight:600;">${profile.college || '–'}</span></div>
          <div><span style="font-size:11px;color:#6b7280;letter-spacing:2px;text-transform:uppercase;font-weight:700;">University</span><br><span style="font-size:14px;color:#1f2937;font-weight:600;">${profile.university || 'AKTU'}</span></div>
          <div><span style="font-size:11px;color:#6b7280;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Email</span><br><span style="font-size:13px;color:#1f2937;font-weight:600;">${profile.email || '–'}</span></div>
          <div><span style="font-size:11px;color:#6b7280;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Generated On</span><br><span style="font-size:13px;color:#1f2937;font-weight:600;">${dateStr}</span></div>
        </div>
      </div>
      <div style="text-align:center;background:rgba(6,182,212,0.08);border:2px solid rgba(6,182,212,0.35);border-radius:16px;padding:24px 32px;flex-shrink:0;">
        <div style="font-size:11px;color:#4b5563;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;font-weight:700;">Overall CGPA</div>
        <div style="font-family:'Courier New',monospace;font-size:52px;font-weight:900;color:${cgpaColor};line-height:1;">${cgpa.toFixed(2)}</div>
        <div style="font-size:12px;color:#4b5563;margin-top:6px;font-weight:600;">out of 10.00</div>
        <div style="margin-top:12px;padding:6px 16px;background:${cgpaColor}22;border:2px solid ${cgpaColor}55;border-radius:20px;display:inline-block;">
          <span style="font-size:13px;font-weight:800;color:${cgpaColor};">${cgpa >= 9 ? '🏆 Outstanding' : cgpa >= 8 ? '⭐ Excellent' : cgpa >= 7 ? '✅ Good' : cgpa >= 6 ? '📚 Average' : '⚠️ Needs Work'}</span>
        </div>
      </div>
    </div>
  </div>

  <div style="background:#f8fafc;border:2px solid rgba(6,182,212,0.3);border-radius:16px;padding:24px 28px;margin-bottom:28px;">
    <div style="font-family:'Courier New',monospace;font-size:13px;color:#0284c7;letter-spacing:3px;text-transform:uppercase;margin-bottom:16px;font-weight:800;">📊 Semester-wise SGPA Performance</div>
    ${sgpaBars || '<div style="color:#6b7280;font-size:13px;">No data entered yet.</div>'}
  </div>

  <div style="background:#f8fafc;border:2px solid rgba(6,182,212,0.3);border-radius:16px;padding:20px 28px;margin-bottom:28px;">
    <div style="font-family:'Courier New',monospace;font-size:13px;color:#0284c7;letter-spacing:3px;text-transform:uppercase;margin-bottom:14px;font-weight:800;">📋 Grading Scale</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;">${gradingLegend}</div>
  </div>

  <div style="font-family:'Courier New',monospace;font-size:13px;color:#0284c7;letter-spacing:3px;text-transform:uppercase;margin-bottom:16px;font-weight:800;">📚 Detailed Subject-wise Report</div>
  ${semesterSections || '<div style="color:#64748b;padding:2rem;text-align:center;">No marks entered yet.</div>'}

  <div style="text-align:center;padding:20px;border-top:1px solid #e5e7eb;margin-top:10px;">
    <div style="font-family:'Courier New',monospace;font-size:10px;color:#6b7280;letter-spacing:2px;">GENERATED BY AKTU CSE CGPA CALCULATOR · ${dateStr}</div>
  </div>

</div>
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) {
    alert('Please allow popups for this site to export the report.')
    return
  }
  win.document.write(html)
  win.document.close()
}
