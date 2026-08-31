import { motion, animate } from 'framer-motion'
import { useState, useEffect } from 'react'

// Reusable animation building blocks — drop these into any page instead of
// writing framer-motion boilerplate every time.
//
// SAFETY RULE followed everywhere here: nothing ever animates opacity at
// all — only position (translateY). An earlier version of this file
// started every animation from a reduced opacity (0.5–0.7) on the theory
// that "worst case it's still visible" — but in practice a dimmed
// state is genuinely hard to read on dark backgrounds specifically (a
// light background keeps enough contrast even dimmed; a dark background
// doesn't have that headroom to spare), and if an animation frame is ever
// throttled or an IntersectionObserver never fires (backgrounded tab,
// slow device, etc.), content can visibly get STUCK at that dim state
// indefinitely instead of just "mid-transition". Animating only position
// sidesteps the whole class of bug: content is always at full, readable
// opacity from the very first frame, in every theme, no matter what the
// animation is doing.

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
        hidden: { y: 16 },
        show: { y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
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
      initial={{ y: 24 }}
      whileInView={{ y: 0 }}
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
