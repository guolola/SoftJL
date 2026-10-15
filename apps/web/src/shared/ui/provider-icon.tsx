// Renders locally bundled provider marks for model selection while preserving a generic fallback.
import { Cpu } from "lucide-react";
import claudeUrl from "@lobehub/icons-static-svg/icons/claude-color.svg?url";
import deepseekUrl from "@lobehub/icons-static-svg/icons/deepseek-color.svg?url";
import doubaoUrl from "@lobehub/icons-static-svg/icons/doubao-color.svg?url";
import geminiUrl from "@lobehub/icons-static-svg/icons/gemini-color.svg?url";
import hunyuanUrl from "@lobehub/icons-static-svg/icons/hunyuan-color.svg?url";
import kimiUrl from "@lobehub/icons-static-svg/icons/kimi-color.svg?url";
import minimaxUrl from "@lobehub/icons-static-svg/icons/minimax-color.svg?url";
import openaiUrl from "@lobehub/icons-static-svg/icons/openai.svg?url";
import qwenUrl from "@lobehub/icons-static-svg/icons/qwen-color.svg?url";
import sparkUrl from "@lobehub/icons-static-svg/icons/spark-color.svg?url";
import stepfunUrl from "@lobehub/icons-static-svg/icons/stepfun-color.svg?url";
import wenxinUrl from "@lobehub/icons-static-svg/icons/wenxin-color.svg?url";
import zhipuUrl from "@lobehub/icons-static-svg/icons/zhipu-color.svg?url";
import { cn } from "./utils";

const providerIconUrls: Record<string, string> = {
  claude: claudeUrl,
  deepseek: deepseekUrl,
  doubao: doubaoUrl,
  ernie: wenxinUrl,
  google: geminiUrl,
  hunyuan: hunyuanUrl,
  kimi: kimiUrl,
  minimax: minimaxUrl,
  qwen: qwenUrl,
  step: stepfunUrl,
  xunfei: sparkUrl,
  zhipu: zhipuUrl,
};

export function ProviderIcon({ providerId, className }: { providerId: string; className?: string }) {
  if (providerId === "openai") {
    return (
      <span
        aria-hidden="true"
        data-testid="provider-icon-openai"
        className={cn("size-4 shrink-0 bg-foreground", className)}
        style={{
          maskImage: `url(${openaiUrl})`,
          maskPosition: "center",
          maskRepeat: "no-repeat",
          maskSize: "contain",
          WebkitMaskImage: `url(${openaiUrl})`,
          WebkitMaskPosition: "center",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskSize: "contain",
        }}
      />
    );
  }

  const iconUrl = providerIconUrls[providerId];
  if (iconUrl) {
    return (
      <img
        alt=""
        aria-hidden="true"
        data-testid={`provider-icon-${providerId}`}
        className={cn("size-4 shrink-0", className)}
        src={iconUrl}
      />
    );
  }

  return <Cpu aria-hidden="true" data-testid="provider-icon-fallback" className={cn("size-4 shrink-0 text-muted-foreground", className)} />;
}
