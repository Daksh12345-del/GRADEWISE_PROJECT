import { createContext, useContext, useMemo } from 'react'
import { SEMESTERS } from './gradesData'
import { calcAllSGPAs, calcCGPAWithBack, calcSGPAWithBack, isSemComplete } from './gradesEngine'
import { useMarksData } from './useMarksData'

const GradesContext = createContext(null)

export function GradesProvider({ children }) {
  const { marksData, backData, electiveChoices, setMarks, setBackMark, setElective, bulkApply, syncStatus } = useMarksData()

  const value = useMemo(() => {
    // Per-semester SGPA, preferring the back-aware value wherever a cleared
    // backlog actually improves it — same pattern CgpaPictograph.jsx already
    // used correctly; this was the one spot still reading the plain,
    // pre-clearance number (it feeds Dashboard's "My Academic Journey" strip).
    const allSGPAs = calcAllSGPAs(marksData).map((base, si) => {
      const { sgpa: withBack, hasAnyBack } = calcSGPAWithBack(si, marksData, backData)
      return hasAnyBack && withBack > base ? withBack : base
    })
    // Back-paper-aware: a cleared backlog should raise the student's real
    // CGPA everywhere in the app, not just in RightPanel's "CGPA Overview"
    // widget (which used to be the only place that called
    // calcCGPAWithBack — everywhere else read this plain, pre-clearance
    // value, so Dashboard/Grades showed a stale CGPA that never reflected
    // a cleared back paper).
    const { cgpa } = calcCGPAWithBack(marksData, backData)
    const semestersDone = SEMESTERS.filter((_, si) => isSemComplete(si, marksData)).length

    // Current semester = first incomplete one, or the last semester if all are done
    let currentSemIndex = SEMESTERS.findIndex((_, si) => !isSemComplete(si, marksData))
    if (currentSemIndex === -1) currentSemIndex = SEMESTERS.length - 1

    const creditsEarned = SEMESTERS.reduce((sum, sem, si) => {
      if (!isSemComplete(si, marksData)) return sum
      return sum + sem.subjects.reduce((s, subj) => s + (subj.audit ? 0 : subj.credits), 0)
    }, 0)

    const sgpaBySem = {}
    allSGPAs.forEach((v, i) => { sgpaBySem[i] = v })

    return {
      cgpa,
      sgpa: calcSGPAWithBack(currentSemIndex, marksData, backData).sgpa,
      currentSemLabel: SEMESTERS[currentSemIndex].label,
      currentSemBadge: `Sem ${['I','II','III','IV','V','VI','VII','VIII'][currentSemIndex]}`,
      semestersDone,
      creditsEarned,
      semesters: SEMESTERS.map(s => ({ sem: s.sem, label: s.label })),
      sgpaBySem,
      currentSemIndex,
      marksData,
      backData,
      electiveChoices,
      setMarks,
      setBackMark,
      setElective,
      bulkApply,
      syncStatus,
    }
  }, [marksData, backData, electiveChoices, setMarks, setBackMark, setElective, bulkApply, syncStatus])

  return <GradesContext.Provider value={value}>{children}</GradesContext.Provider>
}

export function useGrades() {
  const ctx = useContext(GradesContext)
  if (!ctx) {
    throw new Error('useGrades must be used inside <GradesProvider>')
  }
  return ctx
}
