// Hosts upstream overlays in the same isolated theme without changing their UI implementations.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
const Context = createContext<RefObject<HTMLDivElement | null> | null>(null);
export const useHomePortal = () => useContext(Context);
export function HomeDemoPortals({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  useEffect(() => { setBody(document.body); }, []);
  return <Context.Provider value={container}>{children}{body && createPortal(<div className="homepage-theme" ref={container} />, body)}</Context.Provider>;
}
