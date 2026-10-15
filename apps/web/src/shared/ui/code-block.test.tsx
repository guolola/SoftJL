// Verifies highlighted snippets preserve their source text and copy the active file.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { CodeBlock } from "./code-block";

it("highlights JSON and copies the original text including unsafe-looking strings", async () => {
  const code = '{"url":"https://example.test/mcp","label":"<script>alert(1)</script>"}';
  const onCopy = vi.fn().mockResolvedValue(undefined);
  const { container } = render(<CodeBlock code={code} language="json" filename="mcp.json" onCopy={onCopy} />);
  expect(container.querySelector("pre")).toHaveTextContent(code);
  await waitFor(() => expect(container.querySelector("pre.shiki span[style]")).toBeInTheDocument());
  expect(container.querySelector("pre")!.textContent).toBe(code);
  expect(container.querySelector("script")).toBeNull();
  expect(screen.getByText("mcp.json")).toHaveAttribute("data-slot", "code-block-filename");
  await userEvent.click(screen.getByRole("button", { name: "Copy code" }));
  expect(onCopy).toHaveBeenCalledWith(code);
  expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
});

it("copies the selected file after switching tabs", async () => {
  const user = userEvent.setup();
  const onCopy = vi.fn().mockResolvedValue(undefined);
  render(<CodeBlock files={[{ filename: "mcp.json", language: "json", code: '{"mcpServers":{}}' }, { filename: "terminal.sh", language: "bash", code: "qoder mcp list\n/mcp reload" }]} onCopy={onCopy} />);
  await user.click(screen.getByRole("tab", { name: "terminal.sh" }));
  await user.click(screen.getByRole("button", { name: "Copy code" }));
  expect(onCopy).toHaveBeenCalledWith("qoder mcp list\n/mcp reload");
});

it.each(["reject", "false"])("does not report success when copying fails with %s", async (failure) => {
  const onCopy = failure === "reject" ? vi.fn().mockRejectedValue(new Error("Clipboard denied")) : vi.fn().mockResolvedValue(false);
  render(<CodeBlock code="qoder mcp list" language="bash" onCopy={onCopy} />);
  await userEvent.click(screen.getByRole("button", { name: "Copy code" }));
  expect(onCopy).toHaveBeenCalledWith("qoder mcp list");
  expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
});
