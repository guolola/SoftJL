// assistant-ui homepage source; module paths and UI language adapted, layout/styles preserved. See home-demo/LICENSE.
import { useEffect, useLayoutEffect } from "react";

const hasWindow =
  typeof (globalThis as typeof globalThis & { window?: unknown }).window !==
  "undefined";

export const useIsomorphicLayoutEffect = hasWindow
  ? useLayoutEffect
  : useEffect;
