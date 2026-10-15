// Presents the client directory and opens existing connection instructions from each catalog card.
import { PRODUCT_TUTORIAL_URL } from "../../../shared/lib/product-links";
import { ArrowRight, BookOpen, Copy } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import AppIntegration from "./app-integration-03/app-integration-03";
import { mcpClients, type McpClientId } from "../model/client-configurations";
import { ClientIcon } from "./client-icon";

export function ClientCatalogHero() {
  const { t } = useTranslation();

  return <div className="grid min-w-0 items-center gap-8 py-4 sm:py-6 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.6fr)] lg:gap-12 lg:py-10">
    <div className="min-w-0">
      <p className="mb-5 font-mono text-xs font-medium uppercase tracking-[0.16em] text-foreground sm:mb-6">{t("mcp.catalog.eyebrow")}</p>
      <h1 className="whitespace-pre-line text-4xl font-normal leading-[1.16] tracking-tight text-foreground sm:text-5xl xl:text-[3.6rem]">{t("mcp.catalog.title")}</h1>
      <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">{t("mcp.catalog.description")}</p>
      <Button variant="outline" className="mt-6" role="link" nativeButton={false} render={<Link href={PRODUCT_TUTORIAL_URL} target="_blank" rel="noopener noreferrer" />}>
        <BookOpen aria-hidden="true" className="size-4" />
        {t("mcp.documentation")}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Button>
    </div>
    <svg aria-hidden="true" viewBox="0 0 320 320" fill="none" className="aspect-square w-full max-w-72 justify-self-start sm:max-w-80 lg:justify-self-end">
      <path fill="#D6F255" d="M0 0h160v160H0z" />
      <path fill="#BC9CF2" d="M160 0h160v160H160z" />
      <path fill="#FF985B" d="M0 160h160v160H0z" />
      <path fill="#D947BD" d="M160 160h160v160H160z" />
      <path d="M0 160V80a80 80 0 0 1 160 0v80H0Z" fill="#754DDB" />
      <path d="M40 160V80a40 40 0 0 1 80 0v80H40Z" fill="#D6F255" />
      <path d="m240 18 62 62-62 62-62-62 62-62Z" fill="#202020" />
      <path d="m240 50 30 30-30 30-30-30 30-30Z" fill="#BC9CF2" />
      <path d="M0 280h40v-40h40v-40h40v-40h40v160H0v-40Z" fill="#202020" />
      <path d="M160 320V160" stroke="#FF985B" strokeWidth="2" />
      <circle cx="240" cy="240" r="63" stroke="#D6F255" strokeWidth="2" />
      <ellipse cx="240" cy="240" rx="42" ry="63" stroke="#D6F255" strokeWidth="2" />
      <ellipse cx="240" cy="240" rx="20" ry="63" stroke="#D6F255" strokeWidth="2" />
      <path d="M177 240h126M183 214h114M183 266h114" stroke="#D6F255" strokeWidth="2" />
    </svg>
  </div>;
}

export function ClientCatalog({ onSelect, serverUrl, onCopy }: {
  onSelect: (id: McpClientId, trigger: HTMLButtonElement) => void;
  serverUrl: string;
  onCopy: (value: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();

  return <AppIntegration
    title={t("mcp.address")}
    description={t("mcp.transportHelp")}
    titleId="mcp-client-catalog-title"
    header={<div className="space-y-4">
      <h2 id="mcp-client-catalog-title" className="text-2xl font-semibold md:text-3xl lg:text-4xl">
        <Label htmlFor="mcp-address" className="justify-center text-2xl font-semibold md:text-3xl lg:text-4xl">{t("mcp.address")}</Label>
      </h2>
      <p id="mcp-transport-help" className="mx-auto max-w-4xl text-xl leading-8 text-muted-foreground">{t("mcp.transportHelp")}</p>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 pt-2 sm:flex-row">
        <Input id="mcp-address" aria-describedby="mcp-transport-help" className="h-11 min-w-0 flex-1 font-mono text-sm" readOnly value={serverUrl} />
        <Button variant="outline" className="h-11" disabled={!serverUrl} onClick={() => void onCopy(serverUrl)}><Copy aria-hidden="true" className="size-4" />{t("mcp.copyAddress")}</Button>
      </div>
    </div>}
    integrations={mcpClients.map((client) => ({
      id: client.id,
      name: client.name,
      icon: <ClientIcon clientId={client.id} className="size-8.5 [&_svg]:size-8" />,
      description: <ul className="list-disc space-y-2 pl-4 text-sm leading-6 marker:text-foreground">
        <li>{t("mcp.catalog.sources")}</li>
        <li>{t("mcp.catalog.readOnly")}</li>
        <li>{t(client.mode === "manual" ? "mcp.catalog.manual" : "mcp.catalog.remote")}</li>
      </ul>,
      action: <Button
        variant="link"
        className="h-auto max-w-full justify-start gap-2 whitespace-normal p-0 text-left text-sm font-medium text-foreground"
        aria-label={t("mcp.catalog.openGuide", { name: client.name })}
        aria-haspopup="dialog"
        onClick={(event) => onSelect(client.id, event.currentTarget)}
      >
        {t("mcp.catalog.installGuide")}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Button>,
    }))}
  />;
}
