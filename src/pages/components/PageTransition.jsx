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
// Opacity is never animated at all (only translateY) — an earlier version
// dipped to 0.6, then 0.88, on the theory that "worst case it's still
// visible." In practice, ANY opacity reduction reads as genuinely hard to
// read on dark backgrounds specifically (light backgrounds keep enough
// contrast even dimmed; dark ones don't have that headroom to spare) — and
// if a frame is ever throttled (backgrounded tab, slow device) content can
// visibly get stuck at that dim state far longer than the ~0.35s the
// animation is meant to take. Animating only position sidesteps the whole
// class of bug: text is always at full, readable opacity from frame one.
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
