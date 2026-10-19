// Shares requirement-type icons and stable accent colors across views.
import { Gauge, Scale, ShieldCheck, Target, Database, LayoutPanelTop, Plug, TriangleAlert, type LucideIcon } from "lucide-react";
import type { RequirementRuleType } from "@uml-platform/contracts";
export const RULE_KIND_ICON = { "business-rule": Scale, functional: Target, data: Database, interaction: LayoutPanelTop, interface: Plug, exception: TriangleAlert, quality: Gauge, operations: ShieldCheck } satisfies Record<RequirementRuleType, LucideIcon>;
export const RULE_KIND_COLOR_INDEX = { "business-rule": 2, functional: 0, data: 3, interaction: 4, interface: 1, exception: 6, quality: 5, operations: 7 } satisfies Record<RequirementRuleType, number>;
