import { motion } from 'framer-motion'

// Shared enter/exit animation for every page. Wrap a route's element in
// this so navigating between pages gets a consistent fade + slight
// upward-slide instead of an abrupt swap. Used from App.jsx around every
// <Route element={...}>, so individual pages don't need to know about it.
const variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
}

export default function PageTransition({ children }) {
  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      style={{ minHeight: '100%' }}
    >
      {children}
    </motion.div>
  )
}
