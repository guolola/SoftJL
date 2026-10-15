// Displays bundled and official client marks while preserving each product brand.
import { Plug } from "lucide-react";
import claudeUrl from "@lobehub/icons-static-svg/icons/claude-color.svg?url";
import codexUrl from "@lobehub/icons-static-svg/icons/codex-color.svg?url";
import cursorUrl from "@lobehub/icons-static-svg/icons/cursor.svg?url";
import deepseekUrl from "@lobehub/icons-static-svg/icons/deepseek-color.svg?url";
import kimiUrl from "@lobehub/icons-static-svg/icons/kimi-color.svg?url";
import minimaxUrl from "@lobehub/icons-static-svg/icons/minimax-color.svg?url";
import qoderUrl from "@lobehub/icons-static-svg/icons/qoder-color.svg?url";
import qwenUrl from "@lobehub/icons-static-svg/icons/qwen-color.svg?url";
import traeUrl from "@lobehub/icons-static-svg/icons/trae-color.svg?url";
import { cn } from "../../../shared/ui/utils";
import type { McpClientId } from "../model/client-configurations";

const clientMarks: Partial<Record<McpClientId, string>> = {
  claude: claudeUrl,
  codex: codexUrl,
  deepseek: deepseekUrl,
  kimi: kimiUrl,
  minimax: minimaxUrl,
  "minimax-cloud": minimaxUrl,
  qoder: qoderUrl,
  qwen: qwenUrl,
  trae: traeUrl,
  workbuddy: '/mcp/clients/workbuddy.svg',
  vscode: '/mcp/clients/vscode.svg',
};

export function ClientIcon({ clientId, className }: { clientId: McpClientId; className?: string }) {
  const mark = clientMarks[clientId];

  // Official WorkBuddy and VS Code marks keep their original colors without theme recoloring.
  return <span aria-hidden="true" className={cn("inline-flex size-12 shrink-0 items-center justify-center", className)}>
    {clientId === "cursor" ? <span
      className="size-full bg-foreground"
      style={{
        maskImage: `url(${cursorUrl})`,
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: `url(${cursorUrl})`,
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
    /> : mark ? <img alt="" src={mark} className={cn("size-full object-contain", clientId !== "workbuddy" && clientId !== "vscode" && ["rounded-md p-1", clientId === "kimi" ? "bg-black" : "bg-white"])} />
      : <Plug className="size-10 text-foreground" strokeWidth={1.5} />}
  </span>;
}
