// Uses the API visibility enum and a single label set in project creation and settings.
import { projectVisibilitySchema } from "@uml-platform/contracts";
import type { TFunction } from "i18next";

export function projectVisibilityOptions(t: TFunction) {
  return projectVisibilitySchema.options.map(value => ({ value, label: t(`projectSettings.visibilityValues.${value}`) }));
}
