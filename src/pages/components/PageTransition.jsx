import { motion } from 'framer-motion'

// Shared enter animation for every page. Wrap a route's element in this so
// pages ease in on mount with a slide + soft fade.
//
// Deliberately NO `scale` transform. A scale animation (0.98 -> 1) was
// tried here for a "premium" feel, but if the transition doesn't fully
// complete by the time content paints (e.g. right after a hard refresh,
// while the page is still busy fetching/hydrating), the page gets stuck
// mid-scale — and a non-1 scale on text renders visibly blurry until
// something forces a re-render (navigating away and back). Slide + opacity
// don't have this problem: at any intermediate value they still look sharp.
//
// Opacity is also kept in a SAFE range (0.6 -> 1), never 0 -> 1, so a page
// that loads in a background/unfocused tab (where the browser throttles
// requestAnimationFrame) is never fully invisible even if the animation
// frame never fires.
const variants = {
  initial: { opacity: 0.6, y: 16 },
  animate: { opacity: 1, y: 0 },
}

export default function PageTransition({ children }) {
  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      style={{ minHeight: '100%' }}
    >
      {children}
    </motion.div>
  )
}
