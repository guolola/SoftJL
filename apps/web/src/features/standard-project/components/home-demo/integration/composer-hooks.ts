// Invalidates source model-option memoization when platform settings or Modelpedia metadata change.
export type { ReactNode } from "react";
import { useMemo as reactMemo, type DependencyList } from "react";
import { useHomeDemo } from "./environment";
export function useMemo<T>(factory: () => T, dependencies: DependencyList): T {
  const { modelRevision } = useHomeDemo();
  return reactMemo(factory, [...dependencies, modelRevision]);
}
