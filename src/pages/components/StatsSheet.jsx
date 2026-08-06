import { createPortal } from 'react-dom'
import RightPanel from './RightPanel'

/**
 * Mobile/tablet-only bottom sheet that reveals the same content as the
 * desktop <RightPanel> (Live SGPA, CGPA overview, Target CGPA Planner,
 * Future CGPA Simulator, Grading System, Performance Insight, Export PDF).
 *
 * .right-panel is hidden below 1280px via CSS so on phones/tablets it's
 * normally inaccessible — this sheet is opened via the floating
 * .btn-planner-float button and renders RightPanel inside a scrollable
 * bottom sheet instead, with the hide rule overridden for this context
 * (see .stats-sheet-body .right-panel in style.css).
 */
export default function StatsSheet({ open, onClose, ...rightPanelProps }) {
  if (!open) return null

  return createPortal(
    <div
      id="statsSheet"
      className="open"
      onClick={(e) => { if (e.target.id === 'statsSheet') onClose() }}
    >
      <div className="stats-sheet-card">
        <div className="stats-sheet-handle" />
        <div className="stats-sheet-header">
          <div className="stats-sheet-title">📊 Your Stats</div>
          <button
            className="stats-sheet-close"
            onClick={onClose}
            title="Close"
            aria-label="Close"
          >✕</button>
        </div>
        <div className="stats-sheet-body">
          <RightPanel {...rightPanelProps} />
        </div>
      </div>
    </div>,
    document.body
  )
}
