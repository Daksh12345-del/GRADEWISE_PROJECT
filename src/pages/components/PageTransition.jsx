import { motion } from 'framer-motion'

// Shared enter animation for every page. Wrap a route's element in this so
// pages slide in gently on mount.
//
// Deliberately does NOT touch opacity. Two previous versions animated from
// opacity:0 -> 1, and on a page that loads in a background/unfocused tab,
// Chrome throttles requestAnimationFrame — so the animation (and the
// content, stuck at opacity:0) never runs until the user clicks into the
// tab or opens DevTools. That made the whole page appear blank for
// however long the tab stayed unfocused.
//
// Content must always be visible the instant it mounts, animation or not.
// So opacity stays at 1 the whole time, and only a small vertical offset
// animates — if the animation frame never fires for any reason, the page
// is still fully visible, just without the slide.
const variants = {
  initial: { y: 12 },
  animate: { y: 0 },
}

export default function PageTransition({ children }) {
  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      style={{ minHeight: '100%' }}
    >
      {children}
    </motion.div>
  )
}
