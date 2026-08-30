import { useState, useEffect, useCallback } from 'react'

// Mirrors the old toggleTheme()/loadTheme() — adds/removes `light-mode`
// class on <body> (same class your CSS already styles against) and
// persists the choice to localStorage under the same key as before.
export function useTheme() {
  // First-ever visit (no saved preference) should default to LIGHT mode.
  // Once the person explicitly picks a theme, that choice is remembered
  // for next time — so only an explicit 'dark' in storage turns dark mode
  // on; anything else (no value, or 'light') stays light.
  const [isLight, setIsLight] = useState(() => {
    return localStorage.getItem('aktu_theme') !== 'dark'
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
