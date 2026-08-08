import { motion, animate } from 'framer-motion'
import { useState, useEffect } from 'react'

// Reusable animation building blocks — drop these into any page instead of
// writing framer-motion boilerplate every time.
//
// SAFETY RULE followed everywhere here: nothing ever animates FROM
// opacity:0. A page that loads in a background/unfocused tab can have its
// animation frames throttled by the browser, and content stuck at
// opacity:0 looks like a blank/broken page until the tab is focused. Every
// variant below starts at a soft-but-visible opacity (0.5–0.7) instead, so
// worst case (animation never plays) content is still clearly there.

// ── Stagger a list of cards in one-by-one ──────────────────────────────
// Usage:
//   <StaggerGroup>
//     {items.map(item => <StaggerItem key={item.id}><Card .../></StaggerItem>)}
//   </StaggerGroup>
export function StaggerGroup({ children, className, style, staggerChildren = 0.07 }) {
  return (
    <motion.div
      className={className}
      style={style}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren, delayChildren: 0.05 } },
      }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className, style }) {
  return (
    <motion.div
      className={className}
      style={style}
      variants={{
        hidden: { opacity: 0.6, y: 16 },
        show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
      }}
    >
      {children}
    </motion.div>
  )
}

// ── Fade a section in as it scrolls into view (for long pages like
// Resources / Placements / Internships) ────────────────────────────────
export function RevealOnScroll({ children, className, style, delay = 0 }) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0.6, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  )
}

// ── Hover/tap "lift" for cards — wrap any card component ───────────────
export function HoverCard({ children, className, style, onClick }) {
  return (
    <motion.div
      className={className}
      style={style}
      onClick={onClick}
      whileHover={{ y: -4, scale: 1.015, transition: { duration: 0.18 } }}
      whileTap={{ scale: 0.98 }}
    >
      {children}
    </motion.div>
  )
}

// ── Count-up number — animates from 0 up to the target value on mount ──
// Usage: <AnimatedNumber value={42} />
export function AnimatedNumber({ value, duration = 0.9 }) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    const target = Number(value) || 0
    const controls = animate(0, target, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return () => controls.stop()
  }, [value, duration])

  return <>{display}</>
}
export function PressButton({ children, className, style, onClick, type, disabled }) {
  return (
    <motion.button
      className={className}
      style={style}
      onClick={onClick}
      type={type}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.03 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ duration: 0.15 }}
    >
      {children}
    </motion.button>
  )
}
