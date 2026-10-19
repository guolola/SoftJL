// Covers archive state and member-based ownership transfer without exposing internal user IDs.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectSettings } from "./project-settings";
import { platformApi, type PlatformProject } from "../services/platform-api";

const project: PlatformProject = { id: "project", name: "订单系统", description: null, visibility: "private", status: "active", projectMode: "professional", ownerUserId: "owner", updatedAt: "2026-01-01T00:00:00Z" };
const members = [
  { id: "one", projectId: "project", userId: "owner", email: "owner@example.test", displayName: "Owner", role: "owner", status: "active" },
  { id: "two", projectId: "project", userId: "editor-id", email: "editor@example.test", displayName: "Editor", role: "editor", status: "active" },
  { id: "three", projectId: "project", userId: "pending", email: "pending@example.test", displayName: "Pending", role: "editor", status: "invited" },
];
afterEach(() => vi.restoreAllMocks());

it("saves project settings without hierarchy bindings", async () => {
  vi.spyOn(platformApi, "listProjectMembers").mockResolvedValue({ members });
  const update = vi.spyOn(platformApi, "updateProject").mockResolvedValue({ project });
  vi.spyOn(platformApi, "updateProjectRetentionPolicy").mockResolvedValue({ project });
  render(<ProjectSettings project={project} membershipRole="owner" />);
  expect(screen.queryByLabelText("课程 / 班级 / 团队")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "保存项目设置" }));
  expect(update).toHaveBeenCalledWith(project.id, { name: project.name, description: null, visibility: "private", backgroundKey: null });
});

it("shows only the archive action appropriate to the current project state", async () => {
  vi.spyOn(platformApi, "listProjectMembers").mockResolvedValue({ members });
  const archive = vi.spyOn(platformApi, "archiveProject").mockResolvedValue({ project: { ...project, status: "archived" } });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<ProjectSettings project={project} membershipRole="owner" />);
  expect(screen.queryByRole("button", { name: "恢复项目" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "归档项目" }));
  expect(archive).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  await userEvent.click(screen.getByRole("button", { name: "归档项目" }));
  expect(await screen.findByRole("button", { name: "恢复项目" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "归档项目" })).not.toBeInTheDocument();
});

it("transfers only to a joined member selected by name", async () => {
  vi.spyOn(platformApi, "listProjectMembers").mockResolvedValue({ members });
  const transfer = vi.spyOn(platformApi, "transferProjectOwner").mockResolvedValue({ project: { ...project, projectMode: "professional", ownerUserId: "editor-id" } });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<ProjectSettings project={project} membershipRole="owner" />);
  expect(screen.getByRole("button", { name: "转移所有者" })).toBeDisabled();
  const select = screen.getByRole("combobox", { name: "转移所有者" });
  await waitFor(() => expect(select).not.toHaveAttribute("aria-disabled", "true"));
  await userEvent.click(select);
  expect(screen.queryByRole("option", { name: /Pending|Owner/ })).not.toBeInTheDocument();
  await userEvent.click(await screen.findByRole("option", { name: "Editor (editor@example.test)" }));
  expect(screen.queryByText("editor-id")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "转移所有者" }));
  expect(transfer).toHaveBeenCalledWith("project", "editor-id");
});
