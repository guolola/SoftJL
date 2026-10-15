// Owns user-facing generation notifications and completion events.

import { i18n } from "../../../shared/i18n/i18n";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import type { DocumentKind } from "@uml-platform/contracts";

export const GENERATION_COMPLETED_EVENT = "uml-generation-completed";

export function notifyGenerationCompleted(kind: "requirements" | "design") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(GENERATION_COMPLETED_EVENT, {
        detail: { kind },
      }),
    );
  }
}

export function notifyGenerationStarted(
  _kind: "requirements" | "design" | "document",
  _documentKind?: DocumentKind,
) {
  // Progress is visible in the page state and generation-task drawer; avoid a second user-facing popup.
}

export function notifyGenerationFailed(message: string) {
  void message;
}

export function notifyGenerationResultStale() {
  floatingAlert.message(i18n.t("generation.resultStale"));
}
