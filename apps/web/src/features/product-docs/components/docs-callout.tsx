// Gives authored notes, tips and warnings distinct labels, icons and accessible colors.
import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { Info, Lightbulb, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../../../shared/ui/alert";

const variants = {
  NOTE: { Icon: Info, zh: "说明", en: "Note", style: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200" },
  TIP: { Icon: Lightbulb, zh: "操作建议", en: "Tip", style: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" },
  WARNING: { Icon: TriangleAlert, zh: "注意事项", en: "Warning", style: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
};
const marker = /^\s*\[!(NOTE|TIP|WARNING)\]\s*/;

export function DocsCallout({ children, english }: { children: ReactNode; english: boolean }) {
  const blocks = Children.toArray(children);
  const firstParagraph = blocks.findIndex((child) => isValidElement(child));
  const paragraph = blocks[firstParagraph];
  if (!isValidElement<{ children?: ReactNode }>(paragraph)) return <blockquote>{children}</blockquote>;
  const inline = Children.toArray(paragraph.props.children);
  const firstText = inline[0];
  const match = typeof firstText === "string" ? firstText.match(marker) : null;
  if (!match) return <blockquote className="my-6 rounded-xl bg-muted/40 px-5 py-1 text-foreground/85">{children}</blockquote>;

  // Strip only the leading authoring marker; preserve inline links and emphasis in the note.
  inline[0] = (firstText as string).replace(marker, "");
  blocks[firstParagraph] = cloneElement(paragraph, {}, ...inline);
  const variant = variants[match[1] as keyof typeof variants];
  return (
    <Alert role="note" data-doc-callout={match[1].toLowerCase()} className={`my-6 rounded-xl px-5 py-4 ${variant.style}`}>
      <variant.Icon aria-hidden="true" />
      <AlertTitle className="font-semibold">{english ? variant.en : variant.zh}</AlertTitle>
      <AlertDescription className="text-inherit [&_p]:my-1 [&_p]:text-inherit [&_strong]:text-inherit [&_li]:text-inherit [&_ul]:text-inherit">
        {blocks}
      </AlertDescription>
    </Alert>
  );
}
