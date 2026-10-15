// Renders the shared language preference menu used across public and authenticated shells.
import { useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { cn } from "../../ui/utils";
import {
  LOCALE_LABELS,
  type LocalePreference,
} from "../types";
import { useAppI18n } from "../i18n-provider";

type LanguagePreferenceMenuProps = {
  className?: string;
  showLabel?: boolean;
};

export function LanguagePreferenceMenu({ className, showLabel = false }: LanguagePreferenceMenuProps) {
  const { t } = useTranslation();
  const { locale, preference, setPreference } = useAppI18n();
  const [open, setOpen] = useState(false);
  const preferenceItems: Array<{
    value: LocalePreference;
    label: string;
  }> = [
    { value: "system", label: t("language.system") },
    { value: "zh-CN", label: t("language.zhCN") },
    { value: "en", label: t("language.en") },
  ];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={<Button
            variant="ghost"
            size={showLabel ? "sm" : "icon"}
            className={cn(className, (open || preference !== "system") && "text-primary")}
            title={t("language.title")}
            aria-label={t("language.title")}
          />}
        nativeButton={true}
      >
        {showLabel ? <>{LOCALE_LABELS[locale]}<ChevronDown className="size-3.5" /></> : <Languages className="size-5" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {preferenceItems.map((item) => (
          <DropdownMenuItem
            key={item.value}
            className={cn(
              (preference === item.value ||
                (item.value !== "system" && locale === item.value)) &&
                "text-primary",
            )}
            onClick={() => setPreference(item.value)}
          >
            <span>{item.label}</span>
            {item.value === "system" && preference === "system" && (
              <span className="ml-auto text-xs text-muted-foreground">
                {LOCALE_LABELS[locale]}
              </span>
            )}
            {item.value !== "system" && locale === item.value && (
              <Check className="ml-auto size-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
