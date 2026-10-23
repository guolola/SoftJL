// Exercises management through the unified specifications page with real repository refreshes.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { DocumentLibraryItem } from "@uml-platform/contracts";
import { createMockWorkspaceRepository, WorkspaceRepositoryProvider } from "../../../services/workspace-repository/index";
import { withWorkspaceProviders } from "../../../../tests/helpers/workspace-test-utils";
import { platformApi } from "../../user-platform/services/platform-api";
import { InstructionDocumentsPage } from "./instruction-documents-page";

vi.mock("../../../shared/lib/download", () => ({ downloadBlobFile: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

function file(id: string): DocumentLibraryItem {
  return { id, workspaceId: "workspace-a", projectId: "project-a", documentKind: "requirementsSpec", status: "active",
    title: "需求规格说明书", fileName: `${id}.docx`, mimeType: "application/docx", byteLength: 20, version: 1,
    sourceRunId: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
}

it("renames, deletes and restores a generated document from the same page", async () => {
  let document = file("requirements");
  const repository = createMockWorkspaceRepository();
  repository.listDocuments = vi.fn(async () => document.status === "active" ? [document] : []);
  vi.spyOn(platformApi, "listProjectDocuments").mockImplementation(async () => ({ documents: [document] }));
  vi.spyOn(platformApi, "renameProjectDocument").mockImplementation(async (_projectId, _id, name) => {
    document = { ...document, fileName: name }; return { document };
  });
  vi.spyOn(platformApi, "deleteProjectDocument").mockImplementation(async () => {
    document = { ...document, status: "deleted" }; return {};
  });
  vi.spyOn(platformApi, "restoreProjectDocument").mockImplementation(async () => {
    document = { ...document, status: "active" }; return { document };
  });
  render(withWorkspaceProviders(<WorkspaceRepositoryProvider repository={repository} projectId="project-a">
    <InstructionDocumentsPage ordinary={{ onOpen: vi.fn(), onBack: vi.fn() }} />
  </WorkspaceRepositoryProvider>, repository));
  await userEvent.click(await screen.findByRole("button", { name: "文档操作 requirements.docx" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "重命名" }));
  await userEvent.clear(screen.getByLabelText("文档名称"));
  await userEvent.type(screen.getByLabelText("文档名称"), "renamed.docx");
  await userEvent.click(screen.getByRole("button", { name: "重命名" }));
  expect(await screen.findByRole("heading", { name: "renamed.docx" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "文档操作 renamed.docx" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "删除" }));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "删除" }));
  expect(await screen.findByText("已删除文档（1）")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "renamed.docx" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByText("已删除文档（1）"));
  await userEvent.click(screen.getByRole("button", { name: "恢复 renamed.docx" }));
  expect(await screen.findByRole("heading", { name: "renamed.docx" })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("已删除文档（1）")).not.toBeInTheDocument());
});

it("batch-downloads only the current search results", async () => {
  const repository = createMockWorkspaceRepository();
  repository.listDocuments = vi.fn(async () => [file("first"), file("second")]);
  repository.downloadDocument = vi.fn(async id => ({ fileName: `${id}.docx`, blob: new Blob([id]) }));
  render(withWorkspaceProviders(<InstructionDocumentsPage />, repository));
  await screen.findByRole("heading", { name: "second.docx" });
  await userEvent.type(screen.getByPlaceholderText("搜索已生成的文档..."), "second");
  await userEvent.click(screen.getByRole("button", { name: "批量下载" }));
  await waitFor(() => expect(repository.downloadDocument).toHaveBeenCalledExactlyOnceWith("second", "second.docx"));
});
