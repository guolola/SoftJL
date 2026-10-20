// Translates source-owned UI text only; messages, model identifiers and quoted user content stay intact.
import { useTranslation } from "react-i18next";
import { i18n } from "../../../../../shared/i18n";
import chinese from "./home-demo-zh.json";
import { homeContextUsesBudget } from "./model";
export function useHomeLocale(_implicit?: boolean): void { useTranslation(); }
export function homeText(value: string): string;
export function homeText<T>(value: T): T;
export function homeText(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const zh = i18n.resolvedLanguage?.startsWith("zh");
  // Keep the source selector and persisted choice IDs; the platform exposes a boolean reasoning choice.
  if (value === "Low") return "No";
  if (value === "Med" || value === "Medium") return "Yes";
  if (value === "Thinking" || value === "Reasoning effort") return zh ? "推理" : "Reasoning";
  if (value === "Context usage") return homeContextUsesBudget()
    ? zh ? "当前上下文占用（当前预算）" : "Current context usage (current budget)"
    : zh ? "当前上下文占用" : "Current context usage";
  if (value.endsWith("% full") && homeContextUsesBudget()) return zh ? `${value.slice(0, -6)}% 预算已使用` : `${value.slice(0, -6)}% of budget used`;
  if (!zh) return value;
  if (Object.hasOwn(chinese, value)) return (chinese as Record<string, string>)[value];
  if (value.startsWith("Welcome back, ") && value.endsWith(".")) return `欢迎回来，${value.slice(14, -1)}。`;
  if (value.startsWith("Preview of ")) return `预览 ${value.slice(11)}`;
  if (value.startsWith("Preview ")) return `预览 ${value.slice(8)}`;
  if (value.startsWith("Remove ")) return `移除 ${value.slice(7)}`;
  const lines = /^Show all (\d+) lines$/.exec(value);
  if (lines) return `显示全部 ${lines[1]} 行`;
  const attachment = /^(Image|Document|File|图片|文档|文件) attachment (.+)$/s.exec(value);
  if (attachment) return `${homeText(attachment[1])}附件 ${attachment[2]}`;
  if (value.endsWith("% full")) return `${value.slice(0, -6)}% 已使用`;
  if (/^\d+ tools$/.test(value)) return `${value.split(" ")[0]} 个工具`;
  return value;
}
