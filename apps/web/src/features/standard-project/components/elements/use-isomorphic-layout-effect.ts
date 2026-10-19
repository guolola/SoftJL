// Selects the browser layout effect without server rendering warnings.
import { useEffect, useLayoutEffect } from "react";

const hasWindow =
  typeof (globalThis as typeof globalThis & { window?: unknown }).window !==
  "undefined";

export const useIsomorphicLayoutEffect = hasWindow
  ? useLayoutEffect
  : useEffect;
