// Draws the decorative order-system use case result shown in the quick modeling animation.
import { useTranslation } from "react-i18next";

export function OrderUseCasePreview() {
  const { t } = useTranslation();
  return (
    <svg aria-hidden="true" data-diagram-preview="order-use-case" viewBox="0 0 152 140" className="size-full text-foreground">
      <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 27 65 L 63 48 M 27 65 L 63 80 M 27 65 L 63 112" className="text-muted-foreground" />
        <circle cx="17" cy="49" r="7" />
        <path d="M 17 56 V 79 M 7 65 H 27 M 17 79 L 7 94 M 17 79 L 27 94" />
        <rect x="45" y="25" width="102" height="108" rx="3" className="text-border" />
      </g>
      <g className="fill-primary/5 stroke-primary/60" strokeWidth="1.2">
        <ellipse cx="100" cy="48" rx="37" ry="13" />
        <ellipse cx="100" cy="80" rx="37" ry="13" />
        <ellipse cx="100" cy="112" rx="37" ry="13" />
      </g>
      <g fill="currentColor" textAnchor="middle" dominantBaseline="middle" fontSize="8">
        <text x="96" y="14" fontWeight="600">{t("projects.createForm.illustration.diagram.system")}</text>
        <text x="17" y="108">{t("projects.createForm.illustration.diagram.actor")}</text>
        <text x="100" y="48">{t("projects.createForm.illustration.diagram.createOrder")}</text>
        <text x="100" y="80">{t("projects.createForm.illustration.diagram.payOrder")}</text>
        <text x="100" y="112">{t("projects.createForm.illustration.diagram.viewOrder")}</text>
      </g>
    </svg>
  );
}
