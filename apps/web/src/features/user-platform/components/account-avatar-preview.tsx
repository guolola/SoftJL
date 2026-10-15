// Renders the account dialog avatar image or initials fallback.
import type { PlatformUser } from "../services/platform-api";
import { useTranslation } from "react-i18next";
import { initials } from "../lib/account-dialog-formatting";

export function AccountAvatarPreview({
  src,
  user,
}: {
  src: string;
  user: PlatformUser | null;
}) {
  const { t } = useTranslation();
  if (src) {
    return (
      <img
        src={src}
        alt={t("account.avatarAria")}
        className="size-full object-cover"
      />
    );
  }

  return <span>{initials(user)}</span>;
}
