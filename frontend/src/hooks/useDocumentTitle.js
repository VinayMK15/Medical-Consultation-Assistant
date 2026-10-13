import { useEffect } from 'react';

/**
 * Sets the browser tab title for the current page.
 * Usage: useDocumentTitle('Login') → tab shows "Login - MedAssist"
 * Call with no argument to reset to the default title.
 */
export default function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title
      ? `${title} - MedAssist`
      : 'MedAssist - Find the Right Specialist Near You';
  }, [title]);
}
