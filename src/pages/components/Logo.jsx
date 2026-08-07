import darkLogo300 from '../../assets/logo/logo-dark-300w.png'
import darkLogo450 from '../../assets/logo/logo-dark-450w.png'
import darkLogo617 from '../../assets/logo/logo-dark-617w.png'
import lightLogo300 from '../../assets/logo/logo-light-300w.png'
import lightLogo450 from '../../assets/logo/logo-light-450w.png'
import lightLogo617 from '../../assets/logo/logo-light-617w.png'

/**
 * Gradewallah "GV" logo icon.
 *
 * Both variants below are pre-colored, transparent, static PNGs.
 * There is no CSS `filter` (invert/sepia/hue-rotate) and no
 * `mix-blend-mode` anywhere -- that old approach recolored a plain
 * image live in the browser, and that color math is computed
 * differently by each OS/GPU compositor (Skia on Windows/Linux vs.
 * Core Animation on macOS), which is why the logo looked right on
 * Mac but shifted/washed out elsewhere.
 *
 * Two fixed images are shipped instead -- a violet-toned one for the
 * dark navbar and the original navy one for the light navbar -- and
 * plain CSS (keyed off the same `body.light-mode` class the theme
 * toggle already sets) swaps which is visible. A static image
 * renders identically on every platform, so this is the fix, not a
 * workaround.
 */
export default function Logo({ wrapperClassName = 'logo-swap', imgClassName = 'h-logo-icon-img', ...props }) {
  return (
    <span className={wrapperClassName}>
      <img
        src={darkLogo450}
        srcSet={`${darkLogo300} 300w, ${darkLogo450} 450w, ${darkLogo617} 617w`}
        sizes="42px"
        alt="Gradewallah"
        className={`${imgClassName} logo-swap-dark`}
        {...props}
      />
      <img
        src={lightLogo450}
        srcSet={`${lightLogo300} 300w, ${lightLogo450} 450w, ${lightLogo617} 617w`}
        sizes="42px"
        alt="Gradewallah"
        className={`${imgClassName} logo-swap-light`}
        {...props}
      />
    </span>
  )
}
