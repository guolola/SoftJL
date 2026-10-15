// Renders the accessible AdminCN color-preset picker used by the shared workspace header.
import { Palette } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "../../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import {
  themePresets,
  useTheme,
  type ThemePresetKey,
} from "../../ui/theme-provider";

const DEFAULT_PRIMARY = {
  light: "oklch(0.205 0 0)",
  dark: "oklch(0.922 0 0)",
} as const;

export function ThemePresetMenu({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { theme, themePreset, setThemePreset } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={className}
            title={t("theme.palette")}
            aria-label={t("theme.palette")}
          />
        }
      >
        <Palette className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[min(32rem,var(--available-height))] min-w-48 overflow-y-auto">
        <DropdownMenuRadioGroup
          value={themePreset}
          onValueChange={(value) => setThemePreset(value as ThemePresetKey)}
        >
          <DropdownMenuRadioItem value="default">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: DEFAULT_PRIMARY[theme] }}
            />
            {t("theme.defaultPreset")}
          </DropdownMenuRadioItem>
          {Object.entries(themePresets).map(([key, preset]) => (
            <DropdownMenuRadioItem key={key} value={key}>
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-full border border-border"
                style={{ backgroundColor: preset.styles[theme].primary }}
              />
              {preset.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
