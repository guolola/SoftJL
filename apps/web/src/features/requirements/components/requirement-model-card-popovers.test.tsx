// Verifies compact requirement-model card actions reveal details only on demand.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../app/providers/i18n-provider";
import { TooltipProvider } from "../../../shared/ui/tooltip";
import { createRule } from "../../../test/workspace-test-utils";
import { RequirementModelCardPopovers } from "./requirement-model-card-popovers";

function renderActions(
  overrides: Partial<React.ComponentProps<typeof RequirementModelCardPopovers>> = {},
) {
  const onDecideAutoReviews = vi.fn();
  const onLocateRule = vi.fn();
  render(
    <AppI18nProvider>
      <TooltipProvider>
        <RequirementModelCardPopovers
          autoFillLabels={["规则映射"]}
          label="部署需求模型"
          linkedRules={[createRule({ id: "R1", text: "系统必须保留审计记录。" })]}
          pendingAutoReviews={[]}
          onDecideAutoReviews={onDecideAutoReviews}
          onLocateRule={onLocateRule}
          showRuleLocations={false}
          {...overrides}
        />
      </TooltipProvider>
    </AppI18nProvider>,
  );
  return { onDecideAutoReviews, onLocateRule };
}

describe("RequirementModelCardPopovers", () => {
  it("keeps auto-fill copy hidden behind a labeled icon", async () => {
    const user = userEvent.setup();
    renderActions({ linkedRules: [] });

    const trigger = screen.getByRole("button", {
      name: "查看部署需求模型自动补齐说明",
    });
    expect(screen.queryByText(/将自动补齐：规则映射/)).not.toBeInTheDocument();

    expect(trigger).toHaveAttribute("title", "查看部署需求模型自动补齐说明");
    await user.click(trigger);
    expect(screen.getByText(/将自动补齐：规则映射/)).toBeVisible();
  });

  it("shows one view button and a read-only linked-rule popover on model-only pages", async () => {
    const user = userEvent.setup();
    renderActions({ autoFillLabels: [] });

    expect(screen.queryByText("系统必须保留审计记录。")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "查看部署需求模型关联需求规则" }),
    );

    expect(screen.getByText("系统必须保留审计记录。")).toBeVisible();
    expect(screen.queryByRole("button", { name: "定位需求规则 R1" })).not.toBeInTheDocument();
  });
});
