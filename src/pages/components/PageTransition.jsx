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
//
// This used to be done with framer-motion, but that pulled the whole
// ~70KB(gzip) animation library into the *eager* load path — App.jsx wraps
// nearly every route in this component, and App.jsx is never lazy, so
// framer-motion was being downloaded and parsed before any page-specific
// code even started, on every single first visit. A plain CSS keyframe
// animation (defined in style.css as `.page-transition-in`) produces the
// same fade + slide with zero extra JS, so the whole app loads faster.
export default function PageTransition({ children }) {
  return (
    <div className="page-transition-in" style={{ minHeight: '100%' }}>
      {children}
    </div>
  )
}
