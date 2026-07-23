import { createContext, useContext, useMemo } from 'react'
import { SEMESTERS } from './gradesData'
import { calcSGPA, calcCGPA, calcAllSGPAs, isSemComplete } from './gradesEngine'
import { useMarksData } from './useMarksData'

const GradesContext = createContext(null)

export function GradesProvider({ children }) {
  const { marksData, backData, electiveChoices, setMarks, setBackMark, setElective, bulkApply, syncStatus } = useMarksData()

  const value = useMemo(() => {
    const allSGPAs = calcAllSGPAs(marksData)
    const cgpa = calcCGPA(marksData)
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
      sgpa: calcSGPA(currentSemIndex, marksData),
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
