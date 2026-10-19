// Verifies uniform status icons in expanded navigation and collapsed flyouts.
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { i18n } from "../../../shared/i18n";
import { SidebarProvider } from "../../../shared/ui/sidebar";
import { ProjectSidebarNavigation, type ProjectSidebarNode } from "./project-sidebar-navigation";

const nodes: ProjectSidebarNode[] = [
  { key: "normal", label: "正常模型", status: "completed" },
  { key: "failed", label: "错误模型", status: "failed", stale: true },
  { key: "stale", label: "过期模型", status: "completed", stale: true },
  { key: "running", label: "生成中模型", status: "running", stale: true },
];

function Navigation({ expanded }: { expanded: boolean }) {
  const [openKeys, setOpenKeys] = useState(new Set(["root"]));
  return <I18nextProvider i18n={i18n}><SidebarProvider defaultOpen={expanded}>
    <ProjectSidebarNavigation tree={[{ key: "root", label: "模型列表", children: nodes }]}
      selectedKey="" openKeys={openKeys} setOpenKeys={setOpenKeys} onNavigateItemSelect={vi.fn()} />
  </SidebarProvider></I18nextProvider>;
}

describe("project sidebar statuses", () => {
  it.each([true, false])("shows one status icon and no count badge (expanded: %s)", async (expanded) => {
    render(<Navigation expanded={expanded} />);
    if (!expanded) await userEvent.click(screen.getByRole("button", { name: "模型列表" }));
    const role = expanded ? "button" : "menuitem";
    for (const [label, status, color] of [
      ["正常模型", "completed", "text-success"],
      ["错误模型", "failed", "text-destructive"],
      ["过期模型", "stale", "text-warning"],
      ["生成中模型", "running", "text-primary"],
    ]) {
      const item = await screen.findByRole(role, { name: label });
      expect(item).toHaveTextContent(new RegExp(`^${label}$`));
      expect(item.querySelectorAll("[data-sidebar-status]")).toHaveLength(1);
      expect(item.querySelector(`[data-sidebar-status="${status}"] svg`)).toHaveClass(color);
      expect(item.querySelector('[data-slot="badge"]')).toBeNull();
    }
    const normal = screen.getByRole(role, { name: "正常模型" });
    expect(within(normal).getByLabelText("已生成")).toHaveAttribute("title", "已生成");
  });
});
