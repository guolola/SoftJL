// Localizes structured run failures for workspace repository operations.
import type { RunError } from "@uml-platform/contracts";
import { localizeRunFailure } from "../../shared/i18n/api-errors";

export function snapshotErrorMessage(
  snapshot: { error?: RunError | null },
  fallback: string,
) {
  return snapshot.error
    ? localizeRunFailure(snapshot.error, fallback)
    : fallback;
}
