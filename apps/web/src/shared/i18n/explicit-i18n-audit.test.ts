// Guards explicitly migrated UI surfaces against reintroducing hard-coded Chinese copy or DOM text replacement.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const explicitlyLocalizedUiFiles = [
  "features/user-platform/components/auth-page.tsx",
  "features/user-platform/components/account-dialog.tsx",
  "features/user-platform/components/account-pages.tsx",
  "features/settings/components/global-settings-panel.tsx",
  "features/lineage/components/lineage-graph-page.tsx",
  "features/lineage/components/lineage-workflow-canvas.tsx",
  "features/lineage/components/lineage-generation-info.tsx",
  "features/lineage/components/lineage-node.tsx",
  "features/diagrams/components/inline-svg.tsx",
  "features/documents/components/document-style-dialog.tsx",
  "features/user-platform/components/account-avatar-preview.tsx",
  "features/user-platform/components/project-create-form.tsx",
  "features/user-platform/components/project-documents.tsx",
  "features/user-platform/components/project-members.tsx",
  "features/user-platform/components/project-new-page.tsx",
  "features/user-platform/components/invitation-accept-page.tsx",
  "features/user-platform/components/mfa-setup-panel.tsx",
];

describe("explicit UI internationalization audit", () => {
  it.each(explicitlyLocalizedUiFiles)("keeps %s free of hard-coded Chinese UI copy", (file) => {
    const source = readFileSync(resolve(process.cwd(), "src", file), "utf8");
    expect(source).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it("does not restore runtime DOM text mutation", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/shared/i18n/i18n-provider.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/RuntimeUiLocalizer|MutationObserver|textContent\s*=/u);
  });
});
