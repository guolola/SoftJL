// Verifies zoom and expansion of saved diagram previews.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it } from "vitest";
import { I18nextProvider } from "react-i18next";
import { i18n } from "../../../shared/i18n";
import { DiagramPreview } from "./diagram-preview";
const wrapper = ({ children }: { children: React.ReactNode }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
beforeEach(async () => { await i18n.changeLanguage("zh-CN"); });
it("zooms, resets and expands saved diagrams with safe image rendering", async () => {
  render(<DiagramPreview diagram={{ id: "class", kind: "class", title: "类图", status: "completed", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"/>' }} />, { wrapper });
  await userEvent.click(screen.getByRole("button", { name: "放大" })); expect(screen.getByText("125%")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "复位视图" })); expect(screen.getByText("100%")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "展开查看" }));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(within(screen.getByRole("dialog")).getByRole("img", { name: "类图" }).getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
});
