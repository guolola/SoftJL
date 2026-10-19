// Verifies specification cards retain document management without navigating into the editor.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { DocumentLibraryItem } from "@uml-platform/contracts";
import { platformApi } from "../../user-platform/services/platform-api";
import { DocumentManagementActions } from "./document-management-actions";
import { DeletedDocuments } from "./deleted-documents";

const document: DocumentLibraryItem = {
  id: "doc-1", projectId: "project-a", workspaceId: "workspace-a", documentKind: "requirementsSpec",
  title: "需求规格说明书", fileName: "requirements.docx", mimeType: "application/docx", byteLength: 20,
  version: 2, status: "active", sourceRunId: null, createdAt: "2026-01-01", updatedAt: "2026-01-02",
};
afterEach(() => vi.restoreAllMocks());

it("opens version history without opening the document editor", async () => {
  const onOpen = vi.fn();
  vi.spyOn(platformApi, "listProjectDocumentVersions").mockResolvedValue({ versions: [{ version: 1, fileName: "requirements-v1.docx" }] });
  render(<div onClick={onOpen}><DocumentManagementActions document={document} projectId="project-a" canManage onChanged={vi.fn()} /></div>);
  await userEvent.click(screen.getByRole("button", { name: "文档操作 requirements.docx" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "版本记录" }));
  expect(await screen.findByText("v1 requirements-v1.docx")).toBeInTheDocument();
  expect(platformApi.listProjectDocumentVersions).toHaveBeenCalledWith("project-a", "doc-1");
  expect(onOpen).not.toHaveBeenCalled();
});

it("validates renames and confirms reversible deletion before mutating", async () => {
  const rename = vi.spyOn(platformApi, "renameProjectDocument").mockResolvedValue({ document });
  const remove = vi.spyOn(platformApi, "deleteProjectDocument").mockResolvedValue({});
  const onChanged = vi.fn(async () => {});
  render(<DocumentManagementActions document={document} projectId="project-a" canManage onChanged={onChanged} />);
  await userEvent.click(screen.getByRole("button", { name: "文档操作 requirements.docx" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "重命名" }));
  await userEvent.clear(screen.getByLabelText("文档名称"));
  await userEvent.click(screen.getByRole("button", { name: "重命名" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("文档名称不能为空");
  expect(rename).not.toHaveBeenCalled();
  await userEvent.type(screen.getByLabelText("文档名称"), "renamed.docx");
  await userEvent.click(screen.getByRole("button", { name: "重命名" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  expect(rename).toHaveBeenCalledWith("project-a", "doc-1", "renamed.docx");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await userEvent.click(screen.getByRole("button", { name: "文档操作 requirements.docx" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "删除" }));
  expect(remove).not.toHaveBeenCalled();
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "删除" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2));
  expect(remove).toHaveBeenCalledWith("project-a", "doc-1");
});

it("lets read-only members inspect versions but blocks document mutations", async () => {
  render(<DocumentManagementActions document={document} projectId="project-a" canManage={false} onChanged={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "文档操作 requirements.docx" }));
  expect(await screen.findByRole("menuitem", { name: "重命名" })).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("menuitem", { name: "删除" })).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("menuitem", { name: "版本记录" })).not.toHaveAttribute("aria-disabled", "true");
});

it("keeps the confirmation open if deleting the document fails", async () => {
  vi.spyOn(platformApi, "deleteProjectDocument").mockRejectedValue(new Error("offline"));
  const onChanged = vi.fn(async () => {});
  render(<DocumentManagementActions document={document} projectId="project-a" canManage onChanged={onChanged} />);
  await userEvent.click(screen.getByRole("button", { name: "文档操作 requirements.docx" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "删除" }));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "删除" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("删除失败");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(onChanged).not.toHaveBeenCalled();
});

it("loads deleted files after a fresh mount and restores them using the project API", async () => {
  const list = vi.spyOn(platformApi, "listProjectDocuments").mockResolvedValue({ documents: [{ ...document, status: "deleted" }] });
  const restore = vi.spyOn(platformApi, "restoreProjectDocument").mockResolvedValue({ document });
  const onChanged = vi.fn(async () => {});
  const view = render(<DeletedDocuments projectId="project-a" canManage revision={0} onChanged={onChanged} />);
  await userEvent.click(await screen.findByText("已删除文档（1）"));
  await userEvent.click(screen.getByRole("button", { name: "恢复 requirements.docx" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
  expect(list).toHaveBeenCalledWith("project-a", { includeDeleted: true });
  expect(restore).toHaveBeenCalledWith("project-a", "doc-1");
  list.mockResolvedValue({ documents: [] });
  view.rerender(<DeletedDocuments projectId="project-a" canManage revision={1} onChanged={onChanged} />);
  await waitFor(() => expect(screen.queryByText("已删除文档（1）")).not.toBeInTheDocument());
});
