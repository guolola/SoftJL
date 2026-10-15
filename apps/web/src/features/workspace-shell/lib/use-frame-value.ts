// Coalesces live fragments per animation frame; restored and terminal data remain immediate.
import { useEffect, useRef, useState } from "react";

export function useFrameValue<T>(value: T, live: boolean, key: string) {
  const latest = useRef({ value, key });
  latest.current = { value, key };
  const frame = useRef<number | null>(null);
  const [shown, setShown] = useState(latest.current);
  useEffect(() => {
    if (live && shown.value !== value && frame.current === null) {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        setShown(latest.current);
      });
    }
  }, [value, key, live, shown.value]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  return !live || shown.key !== key ? value : shown.value;
}
