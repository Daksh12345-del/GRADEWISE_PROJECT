import { motion } from 'framer-motion'

// Shared enter animation for every page. Wrap a route's element in this so
// pages ease in on mount with a slide + slight scale + soft fade.
//
// Opacity is deliberately kept in a SAFE range (0.6 -> 1), never 0 -> 1.
// Two earlier versions started fully transparent, and on a page that loads
// in a background/unfocused tab, Chrome throttles requestAnimationFrame —
// so the animation (and the content stuck at opacity:0) never ran until the
// user clicked into the tab. Starting at 0.6 means even in the worst case
// where the animation frame never fires, the page is still clearly visible
// and readable, just slightly softer — never a blank screen.
const variants = {
  initial: { opacity: 0.6, y: 18, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
}

export default function PageTransition({ children }) {
  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      style={{ minHeight: '100%' }}
    >
      {children}
    </motion.div>
  )
}
