// Offers bundled avatars with an accessible selection state in the profile editor.
import { CHARACTER_AVATARS } from "@uml-platform/contracts";
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared/ui/button";
import { cn } from "../../../shared/ui/utils";

export function DefaultAvatarPicker({ value, disabled, onSelect }: {
  value: string;
  disabled: boolean;
  onSelect: (url: string) => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div className="w-full max-w-70 space-y-2">
      <p className="text-xs text-muted-foreground">{t("account.defaultAvatarsHint")}</p>
      <div role="group" aria-label={t("account.defaultAvatars")} className="grid grid-cols-6 gap-2">
        {CHARACTER_AVATARS.map(avatar => {
          const { url } = avatar;
          const name = i18n.resolvedLanguage === "en" ? avatar.en : avatar.zh;
          return (
            <Button key={url} type="button" variant="ghost" disabled={disabled}
              aria-label={name}
              aria-pressed={value === url}
              onClick={() => { if (!disabled) onSelect(url); }}
              className="flex h-auto min-w-0 flex-col items-center gap-1 rounded-sm p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <span className={cn("aspect-square w-full max-w-10 overflow-hidden rounded-full border-2 border-transparent transition-shadow hover:ring-2 hover:ring-primary/30", value === url && "border-primary ring-2 ring-primary/20")}>
                <img src={url} alt="" width={40} height={40} loading="lazy" className="size-full object-cover" />
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
