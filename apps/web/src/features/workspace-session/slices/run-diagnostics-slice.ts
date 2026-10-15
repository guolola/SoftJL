// Owns the current run diagnostics state exposed through the workspace session.
import { useState } from "react";
import { createEmptyDiagnostics } from "../lib/diagnostics";

export function useRunDiagnosticsSlice() {
  const [currentRunDiagnostics, setCurrentRunDiagnostics] =
    useState(createEmptyDiagnostics);

  return {
    currentRunDiagnostics,
    setCurrentRunDiagnostics,
  };
}
