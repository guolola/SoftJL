// Covers localized member pagination and owner-removal interaction guards.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withWorkspaceProviders } from "../../../test/workspace-test-utils";
import type { PlatformProject, PlatformProjectMember } from "../services/platform-api";
import { ProjectMembers } from "./project-members";

const project: PlatformProject = {
  id: "project-members-test",
  name: "成员测试项目",
  description: null,
  visibility: "private",
  status: "active",
  ownerUserId: "owner-1",
  updatedAt: "2026-09-22T00:00:00.000Z",
};

function owner(id: string, email: string): PlatformProjectMember {
  return {
    id,
    projectId: project.id,
    userId: id,
    email,
    displayName: email,
    role: "owner",
    status: "active",
    joinedAt: "2026-09-22T00:00:00.000Z",
  };
}

describe("ProjectMembers", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("localizes the member count and explains why the sole owner cannot be removed", async () => {
    const user = userEvent.setup();
    const soleOwner = owner("owner-1", "owner@example.edu");
    render(
      withWorkspaceProviders(
        <ProjectMembers project={project} members={[soleOwner]} membershipRole="owner" layout="drawer" />,
      ),
    );

    const paginationSummary = await screen.findByLabelText("1-1 / 1");
    expect(paginationSummary).toHaveTextContent("显示 1–1，共 1 名成员");
    expect(screen.queryByText(/projectShell\.membersUi\.countLabel/u)).not.toBeInTheDocument();

    const hint = screen.getByLabelText("唯一所有者不可移除，请先转移所有权");
    expect(within(hint).getByRole("button", { name: "移除 owner@example.edu" })).toBeDisabled();
    await user.hover(hint);
    expect(await screen.findByText("唯一所有者不可移除，请先转移所有权", { selector: "[data-slot='tooltip-content']" })).toBeVisible();
    hint.focus();
    expect(hint).toHaveFocus();
  });

  it("allows a manager to remove an owner when another owner remains", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      withWorkspaceProviders(
        <ProjectMembers
          project={project}
          members={[
            owner("owner-1", "owner-1@example.edu"),
            owner("owner-2", "owner-2@example.edu"),
          ]}
          membershipRole="owner"
        />,
      ),
    );

    const removeButton = await screen.findByRole("button", { name: "移除 owner-2@example.edu" });
    expect(removeButton).toBeEnabled();
    await user.click(removeButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/projects/project-members-test/members/owner-2"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });
});
