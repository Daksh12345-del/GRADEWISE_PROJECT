import { motion } from 'framer-motion'

// Shared enter animation for every page. Wrap a route's element in this so
// pages fade + slide in on mount instead of appearing abruptly. Deliberately
// has no `exit` variant and isn't paired with AnimatePresence — that combo
// can hang mid-transition with lazy(Suspense)-loaded routes, leaving the
// screen blank until the exit-complete signal eventually fires (or doesn't).
// This just animates in independently every time a page mounts.
const variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
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
