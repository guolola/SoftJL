// Provides public docs navigation, language selection, search, and theme controls.
import { useEffect, useRef } from "react";
import { ArrowUpRight, Moon, Search, Sun, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import Link from "../../../shared/lib/template-link";
import Logo from "../../../shared/template/assets/svg/logo";
import { LanguagePreferenceMenu } from "../../../shared/i18n/components/language-preference-menu";
import { Button } from "../../../shared/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "../../../shared/ui/input-group";
import { useTheme } from "../../../shared/ui/theme-provider";

type DocsHeaderProps = {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
};

export function DocsHeader({ searchQuery, onSearchQueryChange }: DocsHeaderProps) {
  const { t, i18n } = useTranslation();
  const { theme, toggle } = useTheme();
  const searchRef = useRef<HTMLInputElement>(null);
  const isEnglish = i18n.resolvedLanguage === "en" || i18n.language === "en";

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  return (
    <header data-testid="docs-header" className="shrink-0 border-b border-border bg-background">
      <div className="mx-auto flex min-h-18 max-w-360 flex-wrap items-center gap-3 px-4 py-3 sm:px-6 @[1040px]/docs:flex-nowrap @[1040px]/docs:gap-6">
        <Link href="/" aria-label={t("nav.home")} className="flex min-w-0 shrink-0 items-center gap-2.5 text-base font-semibold tracking-tight">
          <Logo className="size-8" />
          <span>{t("nav.tutorial")}</span>
        </Link>

        <InputGroup className="order-last h-10 w-full rounded-lg bg-muted/35 shadow-none @[1040px]/docs:order-none @[1040px]/docs:mx-auto @[1040px]/docs:max-w-lg @[1040px]/docs:flex-1">
          <InputGroupAddon><Search aria-hidden="true" className="text-sky-700 dark:text-sky-300" /></InputGroupAddon>
          <InputGroupInput ref={searchRef} id="product-docs-search" aria-label={t("docs.searchLabel")}
            aria-keyshortcuts="Control+k Meta+k" autoComplete="off" value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)} placeholder={t("docs.searchPlaceholder")} />
          <InputGroupAddon align="inline-end">
            {searchQuery ? (
              <InputGroupButton size="icon-sm" aria-label={isEnglish ? "Clear search" : "清除搜索"}
                onClick={() => {
                  onSearchQueryChange("");
                  searchRef.current?.focus();
                }}>
                <X aria-hidden="true" className="size-4" />
              </InputGroupButton>
            ) : (
              <kbd aria-hidden="true" className="hidden rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground @[720px]/docs:inline-block">Ctrl / ⌘ K</kbd>
            )}
          </InputGroupAddon>
        </InputGroup>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 @[1040px]/docs:ml-0">
          <LanguagePreferenceMenu showLabel />
          <Button variant="ghost" size="icon" onClick={toggle}
            aria-label={t(theme === "dark" ? "theme.switchToLight" : "theme.switchToDark")}>
            <Moon aria-hidden="true" className="size-4 dark:hidden" />
            <Sun aria-hidden="true" className="hidden size-4 dark:block" />
          </Button>
          <Button nativeButton={false} render={<Link href="/projects" />}>
            {t("docs.openProjects")}
            <ArrowUpRight aria-hidden="true" className="hidden size-3.5 @[720px]/docs:block" />
          </Button>
        </div>
      </div>
    </header>
  );
}
