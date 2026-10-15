// Supplies the template's pathname hook from the existing History API router.
import { useEffect, useState } from 'react';
export function usePathname() {
  const [path, setPath] = useState(() => typeof window === 'undefined' ? '/' : window.location.pathname);
  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    window.addEventListener('popstate', sync);
    window.addEventListener('uml-route-change', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('uml-route-change', sync); };
  }, []);
  return path;
}
