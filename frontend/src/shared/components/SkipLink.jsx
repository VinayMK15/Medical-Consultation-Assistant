/**
 * SkipLink — Renders a visually-hidden "Skip to main content" link that
 * becomes visible when focused via keyboard (Tab). Place once at the top
 * of each page, before any navigation.
 *
 * The target element must have id="main-content" (or pass a custom id).
 */
export default function SkipLink({ targetId = 'main-content' }) {
  return (
    <a href={`#${targetId}`} className="skip-link">
      Skip to main content
    </a>
  );
}
