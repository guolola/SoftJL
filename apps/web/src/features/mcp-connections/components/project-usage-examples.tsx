// Adapts the supplied shadcn-studio FAQ layout to copyable project workflow examples.
import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { CodeBlock } from "../../../shared/ui/code-block";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../../shared/ui/accordion";
import { projectAgentPrompt } from "../model/client-configurations";

export const usageExampleIds = ["implement", "change", "feature", "verify"] as const;

export function ProjectUsageExamples({ onCopy }: { onCopy: (value: string) => Promise<void | boolean> }) {
  const { t, i18n } = useTranslation();
  return <section className="min-w-0" aria-label={t("mcp.guide")}>
      <Accordion className="w-full">
        {usageExampleIds.map((id) => {
          const prompt = `${t("mcp.exampleProjectHelp")}\n\n${projectAgentPrompt(t("mcp.exampleProjectName"), i18n.resolvedLanguage ?? i18n.language)}\n\n${t(`mcp.examples.${id}.prompt`)}`;
          return <AccordionItem key={id} value={id}>
            <AccordionTrigger className="text-lg">{t(`mcp.examples.${id}.title`)}</AccordionTrigger>
            <AccordionContent className="space-y-3 text-base text-muted-foreground">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1">{t(`mcp.examples.${id}.description`)}</p>
                <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label={t("mcp.copyExample")} title={t("mcp.copyExample")} onClick={() => void onCopy(prompt)}><Copy className="size-4" /></Button>
              </div>
              <CodeBlock code={prompt} language="text" filename="prompt.txt" panelClassName="[&_pre]:whitespace-pre-wrap! [&_pre]:break-words" showCopy={false} />
            </AccordionContent>
          </AccordionItem>;
        })}
      </Accordion>
  </section>;
}
