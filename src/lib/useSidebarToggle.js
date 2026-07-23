import { useState, useEffect } from 'react'

const STORAGE_KEY = 'aktu_sidebar_open'
const isMobile = () => window.innerWidth <= 767

export function useSidebarToggle() {
  const [open, setOpen] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === null ? true : saved === 'true'
  })
  const [mobileOpen, setMobileOpen] = useState(false)

  function toggle() {
    if (isMobile()) {
      setMobileOpen((v) => !v)
    } else {
      setOpen((prev) => {
        const next = !prev
        localStorage.setItem(STORAGE_KEY, String(next))
        return next
      })
    }
  }

  function closeMobile() {
    setMobileOpen(false)
  }

  useEffect(() => {
    function onResize() {
      if (!isMobile()) setMobileOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return { open, mobileOpen, toggle, closeMobile }
}
