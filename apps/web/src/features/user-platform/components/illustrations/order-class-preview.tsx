// Draws a second chat result with the user-to-order class relationship and multiplicities.
import { useTranslation } from "react-i18next";

export function OrderClassPreview() {
  const { t } = useTranslation();
  return (
    <svg aria-hidden="true" data-diagram-preview="order-class" viewBox="0 0 152 140" className="size-full text-foreground">
      <g className="fill-primary/5 stroke-primary/60" strokeWidth="1.2">
        <rect x="16" y="8" width="120" height="48" rx="3" />
        <rect x="16" y="84" width="120" height="48" rx="3" />
        <path d="M 16 28 H 136 M 16 104 H 136 M 76 56 V 84" fill="none" />
      </g>
      <g fill="currentColor" textAnchor="middle" dominantBaseline="middle" fontSize="9">
        <text x="76" y="18" fontWeight="600">{t("projects.createForm.illustration.diagram.actor")}</text>
        <text x="76" y="42">{t("projects.createForm.illustration.diagram.userId")}</text>
        <text x="76" y="94" fontWeight="600">{t("projects.createForm.illustration.diagram.order")}</text>
        <text x="76" y="118">{t("projects.createForm.illustration.diagram.orderId")}</text>
        <text x="86" y="63" fontSize="7">1</text>
        <text x="90" y="78" fontSize="7">0..*</text>
      </g>
    </svg>
  );
}
