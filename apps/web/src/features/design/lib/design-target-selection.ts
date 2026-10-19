// Removes blocked design targets until their remaining batch dependencies are also selectable.
import type { DesignDiagramType } from "../../../entities/diagram/model";

export function selectableDesignTargets(
  targets: DesignDiagramType[],
  blockReason: (target: DesignDiagramType, batch: DesignDiagramType[]) => string | null,
): DesignDiagramType[] {
  let selected = targets;
  for (;;) {
    const next = selected.filter(target => !blockReason(target, selected));
    if (next.length === selected.length) return selected;
    // Removing an unavailable upstream can make a downstream target unavailable too.
    selected = next;
  }
}
