// Keeps project mode badges consistent across creation and project cards.
import { GitBranch, MessagesSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "../../../shared/ui/badge";
import { cn } from "../../../shared/ui/utils";

export function ProjectModeBadge({ mode, id }: { mode: "standard" | "professional"; id?: string }) {
  const { t } = useTranslation();
  return <Badge id={id} className={cn(
    "h-auto shrink-0 gap-1.5 rounded-sm border border-transparent bg-linear-to-r bg-size-[105%] bg-center px-2! py-1 text-xs text-white md:px-2.5! md:text-sm",
    mode === "standard" ? "from-indigo-500 to-pink-500" : "from-cyan-600 to-indigo-600",
  )}>
    {mode === "standard" ? <MessagesSquare className="size-4" aria-hidden="true" /> : <GitBranch className="size-4" aria-hidden="true" />}
    {t(`projects.createForm.mode.${mode}`)}
  </Badge>;
}
