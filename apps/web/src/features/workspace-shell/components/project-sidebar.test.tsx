// Ensures the optional coding CTA scrolls with navigation instead of covering it in the footer.
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SidebarProvider } from "../../../shared/ui/sidebar";
import { ProjectSidebar } from "./project-sidebar";

vi.mock("./sidebar-user-dropdown", () => ({ SidebarUserDropdown: () => <span>Account</span> }));
vi.mock("./sidebar-coding-agent-card", () => ({ SidebarCodingAgentCard: () => <span>Coding assistant</span> }));

it("keeps the CTA hidden until design readiness and places it in scrollable content", () => {
  const renderSidebar = (ready: boolean) => <SidebarProvider><ProjectSidebar showCodingAgent={ready} onOpenAccount={() => {}} onNavigate={() => {}}><span>Documents</span></ProjectSidebar></SidebarProvider>;
  const { rerender } = render(renderSidebar(false));
  expect(screen.queryByText("Coding assistant")).not.toBeInTheDocument();
  rerender(renderSidebar(true));
  expect(screen.getByText("Coding assistant").closest('[data-slot="sidebar-content"]')).not.toBeNull();
  expect(screen.getByText("Coding assistant").closest('[data-slot="sidebar-footer"]')).toBeNull();
  expect(screen.getByText("Account").closest('[data-slot="sidebar-footer"]')).not.toBeNull();
});
