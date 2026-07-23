import { useState, useEffect, useCallback } from 'react'

// Mirrors the old toggleTheme()/loadTheme() — adds/removes `light-mode`
// class on <body> (same class your CSS already styles against) and
// persists the choice to localStorage under the same key as before.
export function useTheme() {
  const [isLight, setIsLight] = useState(() => {
    return localStorage.getItem('aktu_theme') === 'light'
  })

  useEffect(() => {
    document.body.classList.toggle('light-mode', isLight)
  }, [isLight])

  const toggleTheme = useCallback(() => {
    setIsLight((prev) => {
      const next = !prev
      localStorage.setItem('aktu_theme', next ? 'light' : 'dark')
      return next
    })
  }, [])

  return { isLight, toggleTheme }
}
