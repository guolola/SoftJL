// Exercises the actual imported homepage with persisted project data and the authenticated command contract.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { createStandardProjectState, standardDiagramKinds } from "@uml-platform/contracts";
import { i18n } from "../../../shared/i18n";
import { patchUserSettings, loadUserSettings } from "../../../shared/lib/user-settings";
import { standardApi, type StandardCommand } from "../services/standard-api";
import { ProjectConversation } from "./project-conversation";
import { homeEffortPreference } from "./home-demo/integration/persisted-preference";
import conversationStyles from "./conversation.css?raw";

vi.mock("../services/standard-api", () => ({ standardApi: { modelContext: vi.fn() } }));
const originalObjectURL = URL.createObjectURL;
const originalRevokeURL = URL.revokeObjectURL;
beforeEach(async () => {
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: vi.fn(() => "blob:attachment-preview") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
  localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks(); await i18n.changeLanguage("zh-CN");
  homeEffortPreference.resync();
  patchUserSettings({ providerConfigId: "provider", defaultModel: "strict", providerModelOptions: ["strict", "json", "compatible"],
    providerModelCapabilities: { strict: { structuredOutputMode: "strict_json" }, json: { structuredOutputMode: "json_object" }, compatible: { structuredOutputMode: "compatible" } } });
  vi.mocked(standardApi.modelContext).mockImplementation(async (_, __, model) => ({ model, contextBudget: 64000,
    capacity: { context: 64000, output: 8000, source: "modelpedia", matchedId: `origin/${model}`, updatedAt: null, capabilities: { vision: false, reasoning: false, toolCall: true } } }));
});
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); URL.createObjectURL = originalObjectURL; URL.revokeObjectURL = originalRevokeURL; });
const defaults = () => ({ projectId: "p", state: createStandardProjectState(), disabled: false, canCancel: true,
  onSend: vi.fn(async (_command: StandardCommand) => true), onCancel: vi.fn(async () => true), onFeedback: vi.fn(async () => true), onSettings: vi.fn(), onOpenDocuments: vi.fn() });
const view = (props = defaults()) => <I18nextProvider i18n={i18n}><ProjectConversation {...props} /></I18nextProvider>;

it.each([false, true])("keeps the chat surface and composer footer transparent with saved messages=%s", (hasMessages) => {
  const props = defaults();
  if (hasMessages) props.state.conversation = [{ id: "u", role: "user", text: "生成图书管理系统", status: "completed", createdAt: "now" }];
  const mounted = render(view(props));
  expect(mounted.container.querySelector(".homepage-conversation")).toHaveStyle({ "background-color": "rgba(0, 0, 0, 0)" });
  expect(screen.getByTestId("conversation-composer-footer")).not.toHaveClass("bg-background");
  if (hasMessages) expect(screen.getByTestId("conversation-message-viewport")).not.toContainElement(screen.getByTestId("conversation-composer-footer"));
  else expect(screen.getByTestId("conversation-message-viewport")).toContainElement(screen.getByTestId("conversation-composer-footer"));
  expect(screen.getByPlaceholderText("发送消息…")).toBeVisible();
  if (hasMessages) expect(screen.getByText("生成图书管理系统")).toBeVisible();
});

it("shows the Agent capability intro for an empty thread and keeps it while composing a draft", async () => {
  render(view());
  const badges = screen.getByTestId("agent-intro-badges");
  const showcase = screen.getByTestId("agent-feature-showcase");
  expect(within(badges).getByRole("img", { name: "需求澄清" })).toBeInTheDocument();
  for (const title of ["梳理与澄清需求", "通过对话修改模型", "生成 8 类模型", "生成测试用例", "生成 2 类说明书"]) {
    expect(within(showcase).getByText(title)).toBeInTheDocument();
  }
  const input = screen.getByPlaceholderText("发送消息…");
  expect(badges.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(input.compareDocumentPosition(showcase) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await userEvent.type(input, "还没发送的需求");
  expect(badges).toBeInTheDocument();
  expect(showcase).toBeInTheDocument();
});

it.each(["zh-CN", "en"])("lists all supported models, test outputs and both specifications in %s", async language => {
  await i18n.changeLanguage(language);
  render(view());
  const showcase = screen.getByTestId("agent-feature-showcase");
  const models = within(showcase.querySelector<HTMLElement>('[data-intro-feature="models"]')!);
  const description = showcase.querySelector('[data-intro-feature="models"] [data-slot="card-description"]')!;
  for (const kind of standardDiagramKinds) {
    expect(description).toHaveTextContent(i18n.t(`standardProject.diagramKinds.${kind}`));
  }
  const documents = showcase.querySelector('[data-intro-feature="documents"] [data-slot="card-description"]')!;
  for (const name of ["requirements", "design"]) {
    expect(documents.textContent!.toLowerCase()).toContain(i18n.t(`standardProject.intro.documents.${name}`).toLowerCase());
  }
  expect(documents).toHaveTextContent("DOCX");
  expect(within(showcase).getByRole("img", { name: i18n.t("standardProject.intro.revision.before") })).toBeInTheDocument();
  expect(within(showcase).getByRole("img", { name: i18n.t("standardProject.intro.revision.after") })).toBeInTheDocument();
  expect(models.getByText(i18n.t("standardProject.intro.demo.label"))).toBeInTheDocument();
  expect(showcase.querySelectorAll('img[src^="http"]')).toHaveLength(0);
  expect(showcase).not.toHaveTextContent(/shadcn|Figma|Lovable|claude-3-7|Theme Builder/);
  const tests = within(showcase.querySelector<HTMLElement>('[data-intro-feature="tests"]')!);
  for (const field of ["preconditions", "steps", "expected"]) {
    expect(tests.getByText(i18n.t(`standardProject.intro.tests.${field}Label`))).toBeInTheDocument();
  }
});

it("hides both intro blocks after the first user turn and restores them for a new empty project", () => {
  const props = defaults();
  const mounted = render(view(props));
  mounted.rerender(view({ ...props, state: { ...props.state, conversation: [
    { id: "u", role: "user", text: "帮我分析图书借阅需求", status: "completed", createdAt: "now" },
  ] } }));
  expect(screen.queryByTestId("agent-intro-badges")).not.toBeInTheDocument();
  expect(screen.queryByTestId("agent-feature-showcase")).not.toBeInTheDocument();
  expect(screen.getByText("帮我分析图书借阅需求")).toBeInTheDocument();
  mounted.unmount();
  render(view({ ...props, projectId: "new-project" }));
  expect(screen.getByTestId("agent-intro-badges")).toBeInTheDocument();
  expect(screen.getByTestId("agent-feature-showcase")).toBeInTheDocument();
});

it("does not reintroduce the intro when opening saved conversation history", () => {
  const props = defaults();
  props.state.conversation = [{ id: "u", role: "user", text: "已保存需求", status: "completed", createdAt: "now" }];
  render(view(props));
  expect(screen.queryByTestId("agent-intro-badges")).not.toBeInTheDocument();
  expect(screen.queryByTestId("agent-feature-showcase")).not.toBeInTheDocument();
});

it("retains failed drafts, sends real project commands and clears only accepted text", async () => {
  const props = defaults(); props.onSend.mockResolvedValueOnce(false);
  const user = userEvent.setup(); render(view(props));
  const input = screen.getByPlaceholderText("发送消息…");
  await user.type(input, "学生借阅图书"); await user.click(screen.getByRole("button", { name: "发送消息" }));
  await waitFor(() => expect(input).toHaveValue("学生借阅图书"));
  expect(screen.getByTestId("agent-intro-badges")).toBeInTheDocument();
  expect(screen.getByTestId("agent-feature-showcase")).toBeInTheDocument();
  expect(JSON.parse(sessionStorage.getItem("uml-standard-draft:p")!).text).toBe("学生借阅图书");
  await user.click(screen.getByRole("button", { name: "发送消息" }));
  await waitFor(() => expect(input).toHaveValue(""));
  expect(props.onSend).toHaveBeenLastCalledWith({ operation: "chat", message: "学生借阅图书", language: "zh-CN" });
  expect(sessionStorage.getItem("uml-standard-draft:p")).toBeNull();
});

it("shows the durable interruption explanation without a generic error for an interrupted tool-only reply", () => {
  const props = defaults();
  props.state.run = { id: "r", operation: "chat", status: "stopped", startedAt: "now" };
  props.state.conversation = [
    { id: "tool", role: "assistant", text: "", status: "failed", createdAt: "now", tools: [{ id: "t", name: "generate_diagrams", status: "failed" }] },
    { id: "notice", role: "assistant", text: "生成服务已重启，本次已完成 1 张，未完成 23 张。", status: "completed", createdAt: "now" },
  ];
  render(view(props));
  expect(screen.getByText("生成服务已重启，本次已完成 1 张，未完成 23 张。")).toBeInTheDocument();
  expect(screen.queryByText("An error occurred")).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText("发送消息…")).toBeEnabled();
});
it("keeps each project's draft separate and polling never replaces edits", async () => {
  const props = defaults(); const first = render(view(props)); const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("发送消息…"), "未发送内容");
  first.rerender(view({ ...props, state: { ...props.state, conversation: [{ id: "a", role: "assistant", text: "后台更新", status: "completed", createdAt: "now" }] } }));
  expect(screen.getByPlaceholderText("发送消息…")).toHaveValue("未发送内容"); first.unmount();
  const other = render(view({ ...props, projectId: "other" })); expect(screen.getByPlaceholderText("发送消息…")).toHaveValue(""); other.unmount();
  render(view(props)); expect(screen.getByPlaceholderText("发送消息…")).toHaveValue("未发送内容");
});
it("accepts a MIME-less Markdown drop and sends its contents as an attachment-only message", async () => {
  const props = defaults(); render(view(props));
  fireEvent.drop(screen.getByPlaceholderText("发送消息…"), { dataTransfer: { types: ["Files"], files: [new File(["# 系统需求\n学生借阅"], "requirements.md")] } });
  expect(await screen.findByRole("group", { name: "文档附件 requirements.md" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "发送消息" }));
  await waitFor(() => expect(props.onSend).toHaveBeenCalledWith({ operation: "chat", language: "zh-CN", attachments: [expect.objectContaining({ type: "document", contentType: "text/markdown", name: "requirements.md", text: "# 系统需求\n学生借阅" })] }));
});
it("uses the upstream error tile and tooltip for unsupported images", async () => {
  const props = defaults(); render(view(props));
  fireEvent.drop(screen.getByPlaceholderText("发送消息…"), { dataTransfer: { types: ["Files"], files: [new File(["image"], "photo.png", { type: "image/png" })] } });
  const tile = await screen.findByRole("button", { name: /photo.png，读取失败/ });
  await userEvent.hover(tile);
  expect(await screen.findByText(/请切换到支持视觉的模型/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "发送消息" }));
  expect(await screen.findByRole("button", { name: /photo.png，读取失败/ })).toBeInTheDocument();
  expect(props.onSend).not.toHaveBeenCalled();
});
it("uses the original model selector while retaining all three configured output modes", async () => {
  const props = defaults(); render(view(props)); const user = userEvent.setup();
  await user.click(screen.getByRole("combobox"));
  expect(await screen.findByRole("option", { name: /strict/ })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: /json/ })).toBeInTheDocument();
  expect(screen.queryByRole("switch", { name: "推理" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("option", { name: /compatible/ }));
  expect(loadUserSettings().defaultModel).toBe("compatible");
  expect(loadUserSettings().providerModelCapabilities).toMatchObject({ strict: { structuredOutputMode: "strict_json" }, json: { structuredOutputMode: "json_object" }, compatible: { structuredOutputMode: "compatible" } });
  expect(props.onSend).not.toHaveBeenCalled();
});
it("disables composing for read-only projects while preserving saved messages", () => {
  const props = defaults(); props.state.conversation = [{ id: "u", role: "user", text: "已保存需求", status: "completed", createdAt: "now" }];
  render(view({ ...props, disabled: true, canCancel: false }));
  expect(screen.getByText("已保存需求")).toBeInTheDocument(); expect(screen.getByPlaceholderText("发送消息…")).toBeDisabled();
});
it("updates Modelpedia options without replacing or blurring an in-progress draft", async () => {
  let finish!: (value: Awaited<ReturnType<typeof standardApi.modelContext>>) => void;
  vi.mocked(standardApi.modelContext).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  render(view()); const user = userEvent.setup();
  const input = screen.getByPlaceholderText("发送消息…");
  await user.type(input, "正在填写的需求");
  await act(async () => finish({ model: "strict", contextBudget: 64000, capacity: { source: "modelpedia", context: 64000, output: 8000, name: "Catalog model", matchedId: "origin/strict", updatedAt: null, capabilities: { reasoning: true, vision: false, toolCall: true } } }));
  expect(screen.getByPlaceholderText("发送消息…")).toBe(input);
  expect(input).toHaveValue("正在填写的需求"); expect(input).toHaveFocus();
  expect(screen.getByRole("combobox")).toHaveTextContent("Catalog model");
});

it.each(["zh-CN", "en"])("uses the project's reasoning Switch and sends the matching boolean in %s", async language => {
  await i18n.changeLanguage(language);
  vi.mocked(standardApi.modelContext).mockResolvedValue({ model: "strict", contextBudget: 64000,
    capacity: { context: 64000, output: 8000, source: "modelpedia", matchedId: "origin/strict", updatedAt: null,
      capabilities: { reasoning: true, vision: false, toolCall: true } } });
  const props = defaults(); render(view(props)); const user = userEvent.setup();
  const selector = screen.getByRole("combobox");
  const control = await screen.findByRole("switch", { name: language === "zh-CN" ? "推理" : "Reasoning" });
  expect(control.closest('[data-slot="popover-content"]')).toBeNull();
  expect(selector).not.toHaveTextContent("No");
  expect(control).not.toBeChecked();
  expect(control).toHaveAttribute("data-slot", "switch");
  expect(control).toHaveAttribute("data-size", "md");
  expect(control.querySelector('[data-slot="switch-thumb"]')).toBeInTheDocument();
  expect(screen.queryByRole("radio", { name: "Yes" })).not.toBeInTheDocument();
  expect(screen.queryByRole("radio", { name: "No" })).not.toBeInTheDocument();
  expect(screen.queryByText("推理强度")).not.toBeInTheDocument();
  await user.click(selector);
  expect(screen.getByRole("option", { name: /strict/ })).toBeInTheDocument();
  expect(screen.queryByRole("radiogroup", { name: language === "zh-CN" ? "推理" : "Reasoning" })).not.toBeInTheDocument();
  expect(control.closest('[data-slot="popover-content"]')).toBeNull();
  await user.click(selector);
  control.focus(); await user.keyboard("[Space]");
  expect(control).toBeChecked();
  expect(selector).not.toHaveTextContent("Yes");
  await user.type(screen.getByPlaceholderText(language === "zh-CN" ? "发送消息…" : "Send a message..."), "explain project");
  await user.click(screen.getByRole("button", { name: language === "zh-CN" ? "发送消息" : "Send message" }));
  expect(props.onSend).toHaveBeenLastCalledWith({ operation: "chat", message: "explain project", reasoning: true, language });
  await user.click(control);
  await user.type(screen.getByPlaceholderText(language === "zh-CN" ? "发送消息…" : "Send a message..."), "brief answer");
  await user.click(screen.getByRole("button", { name: language === "zh-CN" ? "发送消息" : "Send message" }));
  expect(props.onSend).toHaveBeenLastCalledWith({ operation: "chat", message: "brief answer", reasoning: false, language });
});

it("retains the enabled meaning of an existing saved reasoning preference", async () => {
  localStorage.setItem("aui-home-effort", "medium"); homeEffortPreference.resync();
  vi.mocked(standardApi.modelContext).mockResolvedValue({ model: "strict", contextBudget: 64000,
    capacity: { context: 64000, output: 8000, source: "modelpedia", matchedId: "origin/strict", updatedAt: null,
      capabilities: { reasoning: true, vision: false, toolCall: true } } });
  render(view());
  expect(await screen.findByRole("switch", { name: "推理" })).toBeChecked();
  expect(screen.getByRole("combobox")).not.toHaveTextContent("Yes");
});

it("locks the reasoning Switch in a read-only project without changing its saved value", async () => {
  localStorage.setItem("aui-home-effort", "medium"); homeEffortPreference.resync();
  vi.mocked(standardApi.modelContext).mockResolvedValue({ model: "strict", contextBudget: 64000,
    capacity: { context: 64000, output: 8000, source: "modelpedia", matchedId: "origin/strict", updatedAt: null,
      capabilities: { reasoning: true, vision: false, toolCall: true } } });
  render(view({ ...defaults(), disabled: true, canCancel: false }));
  const control = await screen.findByRole("switch", { name: "推理" });
  expect(control).toHaveAttribute("aria-disabled", "true"); await userEvent.click(control);
  expect(control).toBeChecked(); expect(homeEffortPreference.get()).toBe("medium");
});
it("renders project starter prompts and preserves the full original feedback popover", async () => {
  const props = defaults(); const mounted = render(view(props)); const user = userEvent.setup();
  expect(screen.getByText("今天有什么可以帮你？")).toBeInTheDocument();
  for (const label of ["梳理项目需求", "选择八类模型", "生成用例图", "生成业务流程图", "生成时序图", "生成设计类图", "生成测试用例", "需求规格说明书", "软件设计说明书"]) {
    expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
  }
  expect(screen.queryByRole("button", { name: /销售看板|东京天气|技术栈/ })).not.toBeInTheDocument();
  mounted.rerender(view({ ...props, state: { ...props.state, conversation: [{ id: "a", role: "assistant", text: "已保存的回复", status: "completed", createdAt: "now" }] } }));
  await user.click(screen.getByRole("button", { name: "反馈回复问题" }));
  expect(await screen.findByText("回复有什么问题？")).toBeInTheDocument();
  await user.click(screen.getByRole("radio", { name: "信息有误" }));
  await user.type(screen.getByPlaceholderText("补充说明（选填）"), "反馈详情");
  await user.click(screen.getByRole("button", { name: "提交" }));
  expect(props.onFeedback).toHaveBeenCalledWith("a", "negative");
});

it.each(["zh-CN", "en"])("sends project-specific model, test and specification prompts in %s", async language => {
  await i18n.changeLanguage(language);
  const props = defaults(); render(view(props)); const user = userEvent.setup();
  const group = within(screen.getByRole("group", { name: language === "zh-CN" ? "试试这些项目任务" : "Try these project tasks" }));
  expect(group.getAllByRole("button")).toHaveLength(9);
  const choices = language === "zh-CN"
    ? ["选择八类模型", "生成测试用例", "需求规格说明书", "软件设计说明书"]
    : ["Choose model types", "Generate test cases", "Requirements spec", "Software design spec"];
  for (const [index, label] of choices.entries()) {
    await user.click(group.getByRole("button", { name: label }));
    await waitFor(() => expect(props.onSend).toHaveBeenCalledTimes(index + 1));
    const command = props.onSend.mock.calls.at(-1)![0];
    expect(command).toMatchObject({ operation: "chat", language });
    if (index === 0) {
      for (const kind of standardDiagramKinds) expect(command.message).toContain(i18n.t(`standardProject.diagramKinds.${kind}`));
    } else {
      expect(command.message).toContain(language === "zh-CN" ? "模型" : "models");
      expect(command.message).toMatch(language === "zh-CN" ? /测试用例|需求规格说明书|软件设计说明书/ : /test cases|requirements specification|software design specification/);
    }
    expect(command.message).not.toMatch(/sales dashboard|road trip|dinner party|Tokyo|销售看板|东京天气/);
  }
});

it("renders LLM-authored clarification as selectable questions and submits structured answers", async () => {
  const props = defaults(); props.state.rounds = [{ questions: [{ id: "role", title: "哪些人可以借阅？", options: ["学生", "教师"], recommendation: "学生", multiple: false }], answers: [] }];
  props.state.run = { id: "r", operation: "chat", status: "stopped", startedAt: "now" };
  props.state.conversation = [{ id: "role-question", role: "assistant", text: "请确认借阅范围。", status: "completed", createdAt: "now" }];
  render(view(props));
  expect(screen.getByText("哪些人可以借阅？")).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "学生" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "继续未完成内容" })).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText("发送消息…")).toBeEnabled();
  expect(screen.getByRole("button", { name: "提交答案" })).toBeDisabled();
  await userEvent.click(screen.getByRole("radio", { name: "学生" }));
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
  expect(props.onSend).toHaveBeenCalledWith({ operation: "chat", language: "zh-CN", message: "学生", answers: [{ questionId: "role", answer: "学生" }] });
});

it("shows a saved model question as Agent text and only the selected option in the user's bubble", () => {
  const props = defaults();
  const title = "你目前只发来了问候，还没有具体的项目需求说明。请先选择本次希望生成的模型（可多选）：";
  const answer = "功能结构图：展示系统模块及功能划分";
  props.state.rounds = [
    { purpose: "generation_scope", questions: [{ id: "scope", title, options: [answer, "用例图"], recommendation: answer, multiple: true }], answers: [{ questionId: "scope", answer }] },
    { questions: [{ id: "topic", title: "请选择本次项目的课题方向", options: ["校园二手交易平台", "学生信息管理系统"], recommendation: "校园二手交易平台", multiple: false }], answers: [] },
  ];
  props.state.conversation = [
    { id: "hello", role: "user", text: "你好", status: "completed", createdAt: "now" },
    { id: "scope-question", role: "assistant", text: title, tools: [{ id: "scope-tool", name: "ask_questions", status: "completed" }], status: "completed", createdAt: "now" },
    { id: "scope-answer", role: "user", text: answer, status: "completed", createdAt: "now" },
    { id: "topic-question", role: "assistant", text: "请确认项目方向。", tools: [{ id: "topic-tool", name: "ask_questions", status: "completed" }], status: "completed", createdAt: "now" },
  ];
  render(view(props));
  expect(screen.getByText(title).closest('[data-role="assistant"]')).not.toBeNull();
  expect(screen.getByText(answer).closest('[data-role="user"]')).not.toBeNull();
  for (const bubble of document.querySelectorAll('[data-role="user"]')) expect(bubble).not.toHaveTextContent(title);
  expect(screen.getByRole("radio", { name: "校园二手交易平台" })).toBeInTheDocument();
  expect(props.state.conversation[2]!.text).toBe(answer);
});

it("renders Agent-authored model choices, preserves answers on rejection and hides the component after acknowledgement", async () => {
  const props = defaults(); props.onSend.mockResolvedValueOnce(false);
  props.state.generationScope = { status: "awaiting_selection", kinds: ["usecase"] };
  props.state.rounds = [{ purpose: "generation_scope", questions: [{ id: "models", title: "这轮需要哪些图？", options: ["功能结构图", "用例图", "总体架构图"], recommendation: "功能结构图、用例图", multiple: true }], answers: [] }];
  props.state.conversation = [{ id: "a", role: "assistant", text: "请选择需要的模型。", status: "completed", createdAt: "now" }];
  const mounted = render(view(props)); const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("发送消息…"), "保留的草稿");
  expect(screen.getByRole("button", { name: "确认并生成" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "填入推荐答案" }));
  expect(screen.getByRole("checkbox", { name: "功能结构图" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "用例图" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "总体架构图" })).not.toBeChecked();
  await user.click(screen.getByRole("button", { name: "确认并生成" }));
  expect(props.onSend).toHaveBeenCalledWith({ operation: "chat", language: "zh-CN", message: "功能结构图、用例图", answers: [{ questionId: "models", answer: "功能结构图、用例图" }] });
  expect(screen.getByRole("checkbox", { name: "用例图" })).toBeChecked();
  expect(screen.getByPlaceholderText("发送消息…")).toHaveValue("保留的草稿");
  mounted.rerender(view({ ...props, disabled: true }));
  expect(screen.getByRole("button", { name: "确认并生成" })).toBeDisabled();
  mounted.rerender(view({ ...props, state: { ...props.state, generationScope: { status: "confirmed", kinds: ["function", "usecase"] },
    rounds: [{ ...props.state.rounds[0]!, answers: [{ questionId: "models", answer: "功能结构图、用例图" }] }] } }));
  expect(screen.queryByRole("checkbox", { name: "用例图" })).not.toBeInTheDocument();
});
it("selects model recommendations when LLM options include numbered purpose descriptions", async () => {
  const props = defaults();
  props.state.rounds = [{ purpose: "generation_scope", questions: [{ id: "models", title: "需要哪些模型？", multiple: true,
    options: ["1. 功能结构图 — 展示系统模块", "2. 用例图 — 展示哪些角色使用哪些功能", "7. 时序图 — 展示对象交互"],
    recommendation: "推荐功能结构图、用例图；时序图按业务生成。" }], answers: [] }];
  props.state.conversation = [{ id: "a", role: "assistant", text: "请选择。", status: "completed", createdAt: "now" }];
  render(view(props)); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "填入推荐答案" }));
  expect(screen.getByRole("checkbox", { name: "1. 功能结构图 — 展示系统模块" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "2. 用例图 — 展示哪些角色使用哪些功能" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "7. 时序图 — 展示对象交互" })).not.toBeChecked();
  await user.click(screen.getByRole("button", { name: "确认并生成" }));
  expect(props.onSend).toHaveBeenCalledWith(expect.objectContaining({ answers: [{ questionId: "models", answer: "1. 功能结构图 — 展示系统模块、2. 用例图 — 展示哪些角色使用哪些功能" }] }));
});
it("connects the source timing, follow-ups and provider Token display after a stopped task", async () => {
  const props = defaults();
  props.state.run = { id: "r", operation: "chat", status: "stopped", startedAt: "now" };
  props.state.conversation = [{ id: "a", role: "assistant", text: "已读取项目，reasoning 是原始内容。", reasoning: "分析需求", durationMs: 4290,
    suggestions: ["检查现有模型中遗漏的业务规则"],
    tools: [{ id: "tool", name: "read_project", status: "completed" }], status: "completed", createdAt: "now" }];
  props.state.tokenUsage = { model: "strict", contextBudget: 64000, contextTokens: 111,
    lastCall: { input: 12000, output: 400, cacheRead: 8000, cacheWrite: null, total: 12400 }, cumulative: { total: 12400, calls: 1, unreportedCalls: 0 } };
  render(view(props)); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "处理已停止" }));
  expect(screen.getByRole("button", { name: /读取项目.*已完成/ })).toBeInTheDocument();
  expect(screen.getByText("已读取项目，reasoning 是原始内容。")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "回复耗时" })).toHaveTextContent("4.29s");
  const counter = await screen.findByRole("button", { name: /Token 用量/ });
  await waitFor(() => expect(counter).toHaveTextContent("12.4k / 64k"));
  await user.hover(counter); expect(await screen.findByText("缓存输入")).toBeInTheDocument();
  await user.unhover(counter);
  const followUp = screen.getByRole("button", { name: "检查现有模型中遗漏的业务规则" });
  await user.click(followUp);
  expect(props.onSend).toHaveBeenCalledWith({ operation: "chat", message: "检查现有模型中遗漏的业务规则", language: "zh-CN" });
});
it("keeps single tool details collapsed by default and reflects failures without a success mark", async () => {
  const props = defaults();
  props.state.conversation = [{ id: "a", role: "assistant", text: "已整理方案。", status: "completed", createdAt: "now",
    tools: [{ id: "save", name: "save_outline", status: "completed" }] }];
  const mounted = render(view(props));
  await userEvent.click(screen.getByRole("button", { name: "推理过程" }));
  const trigger = screen.getByRole("button", { name: /保存方案.*已完成/ });
  expect(within(trigger).getByText("已完成")).toHaveClass("rounded-md");
  expect(within(trigger).getByText("保存方案")).not.toHaveClass("rounded-md");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(trigger);
  const call = trigger.closest('[data-slot="tool-call"]')!;
  expect(call).toHaveAttribute("data-outcome", "completed");
  expect(within(call as HTMLElement).getByText("状态")).toBeVisible();
  await userEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  mounted.rerender(view({ ...props, state: { ...props.state, conversation: [{ ...props.state.conversation[0]!,
    tools: [{ id: "save", name: "save_outline", status: "failed" }] }] } }));
  expect(screen.getByRole("button", { name: /保存方案.*执行失败或已中断/ }).closest('[data-slot="tool-call"]')).toHaveAttribute("data-outcome", "failed");
});

it.each([
  ["generate_document", "生成说明书"],
  ["generate_diagrams", "生成图表"],
  ["generate_tests", "生成测试用例"],
])("keeps %s running after the assistant finishes requesting it", async (name, label) => {
  const props = defaults();
  props.state.run = { id: "run", status: "running", operation: "chat", startedAt: "now" };
  props.state.conversation = [{ id: "a", role: "assistant", text: "", reasoning: "需求已经明确，开始生成。", status: "completed", createdAt: "now",
    tools: [{ id: "generate", name, status: "running" }] }];
  const mounted = render(view(props));
  const trigger = screen.getByRole("button", { name: new RegExp(`${label}.*正在执行`) });
  const call = trigger.closest('[data-slot="tool-call"]')!;
  expect(call).toHaveAttribute("data-outcome", "running");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(Array.from(call.querySelectorAll(".shimmer"), node => node.textContent)).toEqual([label]);
  expect(screen.queryByText("正在推理")).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "正在执行" })).toHaveLength(1);
  expect(screen.queryByRole("button", { name: new RegExp(`${label}.*已完成`) })).not.toBeInTheDocument();
  await userEvent.click(trigger);
  expect(within(call as HTMLElement).getByText("状态").parentElement).toHaveTextContent("正在执行");
  mounted.rerender(view({ ...props, state: { ...props.state, conversation: [{ ...props.state.conversation[0]!,
    tools: [{ id: "generate", name, status: "completed" }] }] } }));
  expect(screen.getByRole("button", { name: new RegExp(`${label}.*已完成`) }).closest('[data-slot="tool-call"]')).toHaveAttribute("data-outcome", "completed");
  expect(call.querySelector(".shimmer")).not.toBeInTheDocument();
});

it("replaces the thinking placeholder with tool progress while retaining the reasoning disclosure", async () => {
  const props = defaults();
  props.state.conversation = [{ id: "a", role: "assistant", text: "", status: "streaming", createdAt: "now" }];
  const mounted = render(view(props));
  expect(screen.getAllByText("正在推理")).toHaveLength(1);
  mounted.rerender(view({ ...props, state: { ...props.state, conversation: [{ ...props.state.conversation[0]!,
    reasoning: "接下来生成测试用例。", status: "completed", tools: [{ id: "generate", name: "generate_tests", status: "running" }] }] } }));
  expect(screen.queryByText("正在推理")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /生成测试用例.*正在执行/ })).toBeVisible();
  expect(screen.getByRole("button", { name: "正在执行" })).toHaveAttribute("aria-expanded", "true");
  expect(await screen.findByText("接下来生成测试用例。")).toBeVisible();
});

it("keeps tool timelines collapsed by default and the reply outside them", async () => {
  const props = defaults();
  props.state.conversation = [{ id: "a", role: "assistant", text: "处理结果。", status: "completed", createdAt: "now",
    tools: [{ id: "read", name: "read_project", status: "completed" }, { id: "generate", name: "generate_diagrams", status: "running" }] }];
  const mounted = render(view(props));
  const trigger = screen.getByRole("button", { name: /2 个工具调用.*正在执行/ });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(trigger);
  const timeline = trigger.closest('[data-slot="tool-timeline"]')!;
  expect(screen.getAllByText("读取项目")).toHaveLength(1);
  expect(screen.getAllByText("生成图表")).toHaveLength(1);
  expect(within(timeline as HTMLElement).getByText("正在执行")).toBeVisible();
  expect(Array.from(timeline.querySelectorAll(".shimmer"), node => node.textContent)).toEqual(["生成图表"]);
  expect(timeline).not.toContainElement(await screen.findByText("处理结果。"));
  await userEvent.click(trigger);
  expect(screen.getByText("处理结果。")).toBeVisible();
  mounted.rerender(view({ ...props, state: { ...props.state, conversation: [{ ...props.state.conversation[0]!, status: "completed",
    tools: [{ id: "read", name: "read_project", status: "completed" }, { id: "generate", name: "generate_diagrams", status: "failed" }] }] } }));
  // A failed call stays accessible even after the completed activity folds.
  expect(screen.getByRole("button", { name: /生成图表.*执行失败或已中断/ })).toBeVisible();
});

it("keeps a completed question tool waiting until its form is answered", async () => {
  const props = defaults();
  props.state.rounds = [{ questions: [{ id: "role", title: "谁使用系统？", options: ["学生"], recommendation: "学生", multiple: false }], answers: [] }];
  props.state.conversation = [{ id: "a", role: "assistant", text: "请补充。", status: "completed", createdAt: "now",
    tools: [{ id: "ask", name: "ask_questions", status: "completed" }] }];
  const mounted = render(view(props));
  expect(screen.getByRole("button", { name: /补充需求.*等待回答/ }).closest('[data-slot="tool-call"]')).toHaveAttribute("data-outcome", "waiting");
  expect(screen.getByRole("radio", { name: "学生" })).toBeVisible();
  mounted.rerender(view({ ...props, state: { ...props.state, rounds: [{ ...props.state.rounds[0]!, answers: [{ questionId: "role", answer: "学生" }] }] } }));
  await userEvent.click(screen.getByRole("button", { name: "推理过程" }));
  expect(screen.getByRole("button", { name: /补充需求.*已完成/ })).toBeInTheDocument();
});

it("localizes the timeline labels without changing saved reply text", async () => {
  const props = defaults();
  props.state.conversation = [{ id: "a", role: "assistant", text: "保留项目回复。", status: "completed", createdAt: "now",
    tools: [{ id: "read", name: "read_diagram", status: "completed" }, { id: "save", name: "save_diagram", status: "completed" }] }];
  render(view(props));
  await act(() => i18n.changeLanguage("en"));
  await userEvent.click(screen.getByRole("button", { name: "Reasoning" }));
  const trigger = screen.getByRole("button", { name: /2 tool calls.*Completed/ });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(trigger);
  expect(screen.getByText("Read diagrams")).toBeVisible();
  expect(screen.getByText("Save diagram")).toBeVisible();
  expect(screen.getByText("保留项目回复。")).toBeVisible();
});

it("keeps completed Agent reasoning collapsed while preserving answer actions outside it", async () => {
  const props = defaults();
  props.state.conversation = [
    { id: "u", role: "user", text: "继续生成", status: "completed", createdAt: "2026-10-15T09:00:00" },
    { id: "a1", role: "assistant", text: "", reasoning: "先检查已保存的项目。", status: "completed", createdAt: "2026-10-15T09:00:01", tools: [{ id: "read", name: "read_project", status: "completed" }] },
    { id: "a2", role: "assistant", text: "", reasoning: "生成剩余图表。", status: "completed", createdAt: "2026-10-15T09:00:02", tools: [{ id: "generate", name: "generate_diagrams", status: "completed" }] },
    { id: "a3", role: "assistant", text: "已完成上一轮中断后剩余的图表生成。", reasoning: "整理执行结果。", status: "completed", createdAt: "2026-10-15T09:00:03" },
  ];
  const mounted = render(view(props));
  expect(mounted.container.querySelectorAll('[data-slot="run-activity"]')).toHaveLength(1);
  const trigger = screen.getByRole("button", { name: "推理过程" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(await screen.findByText("已完成上一轮中断后剩余的图表生成。")).toBeVisible();
  await userEvent.click(trigger);
  expect(screen.getByText("先检查已保存的项目。")).toBeVisible();
  expect(screen.getByText("生成剩余图表。")).toBeVisible();
  expect(screen.getByText("整理执行结果。")).toBeVisible();
  expect(screen.getAllByRole("button", { name: /读取项目.*已完成/ })).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: /生成图表.*已完成/ })).toHaveLength(1);
  await userEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText("已完成上一轮中断后剩余的图表生成。")).toBeVisible();
  const answer = screen.getByText("已完成上一轮中断后剩余的图表生成。").closest('[data-role="assistant"]')!;
  await userEvent.click(within(answer as HTMLElement).getByRole("button", { name: "重新生成回复" }));
  expect(props.onSend).toHaveBeenCalledWith({ operation: "regenerate", messageId: "a3", expectedHeadId: "a3", language: "zh-CN" });
});

it("uses the same reasoning container, scroll area and Markdown renderer for single and merged responses", async () => {
  const props = defaults();
  const first = { id: "a1", role: "assistant" as const, text: "已检查。", reasoning: "先检查 `usecase`，**保留业务范围**。", status: "completed" as const, createdAt: "now" };
  props.state.conversation = [first];
  const mounted = render(view(props));
  const checkPanel = async (alreadyOpen = false) => {
    expect(mounted.container.querySelectorAll('[data-slot="reasoning-root"]')).toHaveLength(1);
    const trigger = screen.getByRole("button", { name: "推理过程" });
    expect(trigger).toHaveAttribute("aria-expanded", String(alreadyOpen));
    if (!alreadyOpen) await userEvent.click(trigger);
    const content = mounted.container.querySelector('[data-slot="reasoning-content"]')!;
    expect(content).toHaveClass("aui-reasoning-content", "text-sm");
    expect(content.querySelector('[data-slot="reasoning-text"]')).toHaveClass("max-h-64", "overflow-y-auto");
    expect(within(content as HTMLElement).getByText("usecase").tagName).toBe("CODE");
    expect(within(content as HTMLElement).getByText("保留业务范围").tagName).toBe("STRONG");
  };
  await checkPanel();
  const second = { id: "a2", role: "assistant" as const, text: "生成完成。", reasoning: "再生成说明书。", status: "completed" as const, createdAt: "now" };
  mounted.rerender(view({ ...props, state: { ...props.state, conversation: [first, second] } }));
  await checkPanel(true);
  expect(screen.getByText("再生成说明书。")).toBeVisible();
  expect(screen.getByText("生成完成。")).toBeVisible();
  mounted.rerender(view({ ...props, state: { ...props.state, conversation: [first, { ...second, status: "streaming" }] } }));
  expect(mounted.container.querySelector('[data-slot="reasoning-content"]')).toHaveAttribute("aria-busy", "true");
});

it("keeps the first reasoning visible before its tool and preserves the container through the whole turn", async () => {
  const props = defaults();
  const run = { id: "run", status: "running" as const, operation: "chat" as const, startedAt: "now" };
  const first = { id: "a1", role: "assistant" as const, text: "", status: "streaming" as const, createdAt: "now" };
  const mounted = render(view({ ...props, state: { ...props.state, run, conversation: [first] } }));
  const trigger = screen.getByRole("button", { name: "正在推理" });
  const root = trigger.closest('[data-slot="reasoning-root"]')!;
  const checkOpen = () => {
    expect(mounted.container.querySelector('[data-slot="reasoning-root"]')).toBe(root);
    expect(root.querySelector('[data-slot="collapsible-trigger"]')).toBe(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger.querySelector(".shimmer")).toHaveTextContent(trigger.textContent!.replace(">", ""));
    expect(trigger.querySelector('[aria-hidden="true"]')).toHaveClass("text-blue-500");
  };
  const thinking = { ...first, reasoning: "先读取当前用例图。" };
  mounted.rerender(view({ ...props, state: { ...props.state, run, conversation: [thinking] } }));
  const thought = await screen.findByText("先读取当前用例图。");
  expect(thought).toBeVisible();
  expect(screen.queryByRole("button", { name: /读取图表/ })).not.toBeInTheDocument();
  checkOpen();
  const requesting = { ...thinking, status: "completed" as const, tools: [{ id: "read", name: "read_diagram", status: "running" as const }] };
  mounted.rerender(view({ ...props, state: { ...props.state, run, conversation: [requesting] } }));
  checkOpen();
  const tool = screen.getByRole("button", { name: /读取图表.*正在执行/ });
  expect(screen.getByText("先读取当前用例图。").compareDocumentPosition(tool) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const completed = { ...requesting, tools: [{ ...requesting.tools[0]!, status: "completed" as const }] };
  // A polling snapshot can land between tool completion and the next model token.
  mounted.rerender(view({ ...props, state: { ...props.state, run, conversation: [completed] } }));
  checkOpen();
  const second = { ...first, id: "a2", reasoning: "根据读取结果继续生成。" };
  mounted.rerender(view({ ...props, state: { ...props.state, run, conversation: [completed, second] } }));
  checkOpen();
  expect(await screen.findByText("根据读取结果继续生成。")).toBeVisible();
  mounted.rerender(view({ ...props, state: { ...props.state, run: { ...run, status: "completed" },
    conversation: [completed, { ...second, status: "completed", text: "已完成。" }] } }));
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(trigger.querySelector(".shimmer")).not.toBeInTheDocument();
  expect(trigger.querySelector('[aria-hidden="true"]')).not.toHaveClass("text-blue-500");
  expect(await screen.findByText("已完成。")).toBeVisible();
});

it.each(["completed", "stopped", "failed", "waiting"] as const)("turns off the reasoning header animation when the turn is %s", status => {
  const props = defaults();
  props.state.run = { id: "run", operation: "chat", status: status === "waiting" ? "running" : status, startedAt: "now" };
  if (status === "waiting") props.state.rounds = [{ questions: [{ id: "role", title: "谁使用？", options: ["学生"], recommendation: "学生", multiple: false }], answers: [] }];
  props.state.conversation = [{ id: "a1", role: "assistant", text: "", reasoning: "检查项目。", status: status === "failed" ? "failed" : "completed", createdAt: "now",
    tools: [{ id: "tool", name: status === "waiting" ? "ask_questions" : "read_diagram", status: status === "failed" ? "failed" : "completed" }] }];
  const mounted = render(view(props));
  const trigger = mounted.container.querySelector('[data-slot="reasoning-root"] > [data-slot="collapsible-trigger"]')!;
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(trigger.querySelector(".shimmer")).not.toBeInTheDocument();
  expect(trigger.querySelector('[aria-hidden="true"]')).not.toHaveClass("text-blue-500");
});

it("shows reasoning before its tool even when polling skips the first streaming phase", async () => {
  const props = defaults();
  props.state.run = { id: "run", status: "running", operation: "chat", startedAt: "now" };
  props.state.conversation = [{ id: "a1", role: "assistant", text: "", reasoning: "先读取已有图表。", status: "completed", createdAt: "now",
    tools: [{ id: "read", name: "read_diagram", status: "completed" }] }];
  render(view(props));
  expect(screen.getByRole("button", { name: "推理过程" })).toHaveAttribute("aria-expanded", "true");
  const reasoning = await screen.findByText("先读取已有图表。");
  const tool = screen.getByRole("button", { name: /读取图表.*已完成/ });
  expect(reasoning).toBeVisible();
  expect(tool).toBeVisible();
  expect(reasoning.compareDocumentPosition(tool) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("retains a manual fold made during the first model call when subsequent calls arrive", async () => {
  const props = defaults();
  const first = { id: "a1", role: "assistant" as const, text: "", reasoning: "检查项目。", status: "streaming" as const, createdAt: "now" };
  const mounted = render(view({ ...props, state: { ...props.state, conversation: [first] } }));
  const trigger = screen.getByRole("button", { name: "正在推理" });
  await userEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  mounted.rerender(view({ ...props, state: { ...props.state, conversation: [{ ...first, status: "completed",
    tools: [{ id: "read", name: "read_project", status: "completed" }] }, { ...first, id: "a2", reasoning: "接着生成。" }] } }));
  expect(screen.getByRole("button", { name: "正在推理" })).toBe(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

it("applies body trace typography and gutter markers to both single and continuous reasoning", () => {
  const props = defaults();
  const first = { id: "a1", role: "assistant" as const, text: "回复。", reasoning: "检查项目。", status: "completed" as const, createdAt: "now" };
  props.state.conversation = [first, { id: "u2", role: "user", text: "继续", status: "completed", createdAt: "now" },
    { ...first, id: "a2" }, { ...first, id: "a3" }];
  const stylesheet = document.createElement("style");
  stylesheet.textContent = conversationStyles;
  document.head.append(stylesheet);
  try {
    render(view(props));
    const triggers = screen.getAllByRole("button", { name: "推理过程" });
    expect(triggers).toHaveLength(2);
    for (const trigger of triggers) {
      const style = getComputedStyle(trigger);
      expect(style.fontSize).toBe("15px");
      expect(style.fontFamily).toBe("inherit");
      expect(style.lineHeight).toBe("1.625");
      expect(getComputedStyle(trigger.querySelector('[aria-hidden="true"]')!).position).toBe("absolute");
    }
  } finally { stylesheet.remove(); }
});

it("keeps tools from different model calls in separate cards and retains their state through polling", async () => {
  const props = defaults();
  props.state.conversation = [
    { id: "a1", role: "assistant", text: "", reasoning: "先生成图表和说明书。", status: "completed", createdAt: "now", tools: [{ id: "generate", name: "generate_diagrams", status: "completed" }] },
    { id: "a2", role: "assistant", text: "", status: "completed", createdAt: "now", tools: [{ id: "document", name: "generate_document", status: "completed" }] },
  ];
  const mounted = render(view(props));
  await userEvent.click(screen.getByRole("button", { name: "推理过程" }));
  const trigger = screen.getByRole("button", { name: /生成说明书.*已完成/ });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(mounted.container.querySelectorAll('[data-slot="tool-call"]')).toHaveLength(2);
  expect(mounted.container.querySelector('[data-slot="tool-timeline"]')).not.toBeInTheDocument();
  await userEvent.click(trigger);
  const card = trigger.closest('[data-slot="tool-call"]')!;
  expect(within(card as HTMLElement).getByText("操作").parentElement).toHaveTextContent("生成说明书");
  mounted.rerender(view({ ...props, state: { ...props.state, conversation: [props.state.conversation[0]!, { ...props.state.conversation[1]!,
    tools: [{ id: "document", name: "generate_document", status: "running" }] }] } }));
  expect(screen.getByRole("button", { name: /生成说明书.*正在执行/ })).toHaveAttribute("aria-expanded", "true");
  expect(Array.from(card.querySelectorAll(".shimmer"), node => node.textContent)).toEqual(["生成说明书"]);
  mounted.rerender(view({ ...props, state: { ...props.state, conversation: [...props.state.conversation!,
    { id: "a3", role: "assistant", text: "", status: "completed", createdAt: "now", tools: [{ id: "read", name: "read_diagram", status: "completed" }] },
    { id: "a4", role: "assistant", text: "", reasoning: "接着检查项目约定。", status: "completed", createdAt: "now", tools: [{ id: "project", name: "read_project", status: "completed" }] }] } }));
  expect(screen.getByRole("button", { name: /生成说明书.*已完成/ })).toHaveAttribute("aria-expanded", "true");
  expect(mounted.container.querySelectorAll('[data-slot="tool-call"]')).toHaveLength(4);
  expect(mounted.container.querySelector('[data-slot="tool-timeline"]')).not.toBeInTheDocument();
  expect(screen.getByText("接着检查项目约定。")).toBeVisible();
  expect(screen.getByRole("button", { name: /读取项目.*已完成/ }).closest('[data-slot="tool-call"]')).toBeInTheDocument();
});

it("keeps streamed reasoning expanded through tool loops and preserves a manual collapse during polling", async () => {
  const props = defaults();
  props.state.conversation = [
    { id: "a1", role: "assistant", text: "", reasoning: "分析项目。", tools: [{ id: "read", name: "read_project", status: "completed" }], status: "completed", createdAt: "now" },
    { id: "a2", role: "assistant", text: "", status: "streaming", createdAt: "now" },
  ];
  const mounted = render(view(props));
  const trigger = screen.getByRole("button", { name: "正在推理" });
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: /读取项目.*已完成/ })).toBeVisible();
  expect(screen.queryByRole("button", { name: "正在处理" })).not.toBeInTheDocument();
  const liveMessage = { ...props.state.conversation[1]!, text: "先向你说明处理范围。", reasoning: "检查生成范围。" };
  mounted.rerender(view({ ...props, state: { ...props.state, conversation: [props.state.conversation[0]!, liveMessage] } }));
  expect(screen.getAllByRole("button", { name: /推理过程|正在推理/ })).toHaveLength(1);
  expect(screen.getByRole("button", { name: "正在推理" })).toHaveAttribute("aria-expanded", "true");
  expect(await screen.findByText("检查生成范围。")).toBeVisible();
  mounted.rerender(view({ ...props, state: { ...props.state, conversation: [props.state.conversation[0]!, { ...liveMessage, status: "completed" },
    { id: "a3", role: "assistant", text: "完成结果。", status: "completed", createdAt: "now" }] } }));
  expect(screen.getByRole("button", { name: "推理过程" })).toHaveAttribute("aria-expanded", "false");
  expect(await screen.findByText("完成结果。")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "推理过程" }));
  await userEvent.click(screen.getByRole("button", { name: "推理过程" }));
  mounted.rerender(view({ ...props, state: { ...props.state, conversation: [props.state.conversation[0]!, { ...liveMessage, status: "completed" },
    { id: "a3", role: "assistant", text: "完成结果。", status: "completed", createdAt: "now" },
    { id: "a4", role: "assistant", text: "", reasoning: "再检查一次结果。", status: "streaming", createdAt: "now" }] } }));
  expect(screen.getByRole("button", { name: "正在推理" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText("先向你说明处理范围。")).toBeVisible();
  expect(screen.getByText("完成结果。")).toBeVisible();
});

it("keeps failures and question controls visible when the merged reasoning is manually collapsed", async () => {
  const props = defaults();
  props.state.rounds = [{ questions: [{ id: "role", title: "需要谁确认？", options: ["管理员"], recommendation: "管理员", multiple: false }], answers: [] }];
  props.state.conversation = [
    { id: "a1", role: "assistant", text: "", reasoning: "检查失败原因。", status: "completed", createdAt: "now", tools: [{ id: "generate", name: "generate_diagrams", status: "failed" }] },
    { id: "a2", role: "assistant", text: "", status: "completed", createdAt: "now", tools: [{ id: "ask", name: "ask_questions", status: "completed" }] },
  ];
  render(view(props));
  const trigger = screen.getByRole("button", { name: "等待回答" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(trigger);
  await userEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("button", { name: /生成图表.*执行失败或已中断/ })).toBeVisible();
  expect(screen.getByRole("button", { name: /补充需求.*等待回答/ })).toBeVisible();
  await userEvent.click(screen.getByRole("radio", { name: "管理员" }));
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
  expect(props.onSend).toHaveBeenCalledWith(expect.objectContaining({ answers: [{ questionId: "role", answer: "管理员" }] }));
});

it("inserts one separator per calendar day and retains real message timestamps through localization", async () => {
  const props = defaults();
  props.state.conversation = [
    { id: "u", role: "user", text: "昨天的需求", status: "completed", createdAt: "2026-10-15T09:00:00" },
    { id: "a", role: "assistant", text: "昨天的回复", status: "completed", createdAt: "2026-10-15T09:01:00" },
    { id: "u2", role: "user", text: "今天的需求", status: "completed", createdAt: "2026-10-16T10:00:00" },
  ];
  const mounted = render(view(props));
  expect(screen.getAllByRole("separator")).toHaveLength(2);
  expect(screen.getByRole("separator", { name: "2026年10月15日" })).toBeInTheDocument();
  expect(screen.getByRole("separator", { name: "2026年10月16日" })).toBeInTheDocument();
  expect(mounted.container.querySelectorAll("time")).toHaveLength(3);
  expect(mounted.container.querySelector("time")).toHaveAttribute("datetime", new Date("2026-10-15T09:00:00").toISOString());
  expect(mounted.container.querySelector("time")).toHaveTextContent("09:00");
  await act(() => i18n.changeLanguage("en"));
  expect(screen.getByRole("separator", { name: "October 15, 2026" })).toBeInTheDocument();
  expect(screen.getByRole("separator", { name: "October 16, 2026" })).toBeInTheDocument();
  expect(screen.getByText("昨天的需求")).toBeVisible();
});

it("bounds merged reasoning by user turns and calendar days without inventing dates", () => {
  const props = defaults();
  props.state.conversation = [
    { id: "a1", role: "assistant", text: "", reasoning: "历史推理。", status: "completed", createdAt: "" },
    { id: "a2", role: "assistant", text: "历史回复。", status: "completed", createdAt: "now" },
    { id: "u", role: "user", text: "新的需求", status: "completed", createdAt: "2026-10-15T09:00:00" },
    { id: "a3", role: "assistant", text: "", reasoning: "当天推理。", status: "completed", createdAt: "2026-10-15T09:01:00" },
    { id: "a4", role: "assistant", text: "次日回复。", status: "completed", createdAt: "2026-10-16T09:00:00" },
  ];
  const mounted = render(view(props));
  expect(mounted.container.querySelectorAll('[data-slot="run-activity"]')).toHaveLength(3);
  expect(screen.getAllByRole("separator")).toHaveLength(2);
  expect(screen.getAllByRole("button", { name: "推理过程" })).toHaveLength(2);
});
it("labels a real runtime budget when Modelpedia capacity is unknown", async () => {
  vi.mocked(standardApi.modelContext).mockResolvedValue({ model: "strict", contextBudget: 48000,
    capacity: { context: null, output: null, source: "unknown", matchedId: null, updatedAt: null } });
  const props = defaults(); props.state.tokenUsage = { model: "strict", contextBudget: 48000, contextTokens: null,
    lastCall: { input: 1200, output: 200, cacheRead: null, cacheWrite: null, total: 1400 }, cumulative: { total: 1400, calls: 1, unreportedCalls: 0 } };
  render(view(props));
  const counter = await screen.findByRole("button", { name: "Token 用量（当前预算）" });
  await waitFor(() => expect(counter).toHaveTextContent("1.4k / 48k"));
});

it("uses the model table's context capacity even when output is unknown and saved usage has the old 48k budget", async () => {
  vi.mocked(standardApi.modelContext).mockResolvedValue({ model: "strict", contextBudget: 1000000,
    capacity: { context: 1000000, output: null, source: "modelpedia", matchedId: "origin/strict", updatedAt: null } });
  const props = defaults(); props.state.tokenUsage = { model: "strict", contextBudget: 48000, contextTokens: 11000,
    lastCall: { input: 10000, output: 1000, cacheRead: null, cacheWrite: null, total: 11000 }, cumulative: { total: 11000, calls: 1, unreportedCalls: 0 } };
  render(view(props));
  const counter = await screen.findByRole("button", { name: "Token 用量" });
  await waitFor(() => expect(counter).toHaveTextContent("11k / 1M"));
  expect(screen.queryByRole("button", { name: "Token 用量（当前预算）" })).not.toBeInTheDocument();
});

it("submits source message edits with attachments and rejects no draft on failure", async () => {
  const props = defaults(); props.onSend.mockResolvedValueOnce(false);
  props.state.conversation = [{ id: "u", role: "user", text: "原需求", status: "completed", createdAt: "now",
    attachments: [{ id: "f", name: "scope.txt", type: "document", contentType: "text/plain", text: "保留附件" }], quote: { text: "保留引用" } },
    { id: "a", role: "assistant", text: "旧回复", status: "completed", createdAt: "now" }];
  render(view(props)); const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("发送消息…"), "另一个未发送草稿");
  await user.hover(screen.getByText("原需求"));
  await user.click(screen.getByRole("button", { name: "编辑消息" }));
  const editor = screen.getByRole("textbox", { name: "编辑消息" });
  await user.clear(editor); await user.type(editor, "修改后的需求");
  await user.click(screen.getByRole("button", { name: "更新" }));
  await waitFor(() => expect(screen.getByRole("textbox", { name: "编辑消息" })).toHaveValue("修改后的需求"));
  expect(props.onSend).toHaveBeenCalledWith({ operation: "edit", messageId: "u", expectedHeadId: "a", message: "修改后的需求", language: "zh-CN",
    attachments: props.state.conversation[0]!.attachments, quote: { text: "保留引用" } });
  expect(screen.getByPlaceholderText("发送消息…")).toHaveValue("另一个未发送草稿");
  expect(screen.getByText("旧回复")).toBeInTheDocument();
});

it("uses the source regeneration control and persists detailed timing from the provider", async () => {
  const props = defaults();
  props.state.conversation = [{ id: "u", role: "user", text: "原需求", status: "completed", createdAt: "now" },
    { id: "a", role: "assistant", text: "旧回复", status: "completed", createdAt: "now", durationMs: 4290,
      timing: { streamStartTime: 100, totalStreamTime: 4290, firstTokenTime: 250, totalChunks: 19, toolCallCount: 0, tokenCount: 100, tokensPerSecond: 25 } }];
  render(view(props)); const user = userEvent.setup();
  await user.hover(screen.getByRole("button", { name: "回复耗时" }));
  expect(await screen.findByText("首 Token 耗时")).toBeInTheDocument();
  expect(screen.getByText("250ms")).toBeInTheDocument(); expect(screen.getByText("19")).toBeInTheDocument();
  expect(screen.getByText(/25.0.*Token\/秒/)).toBeInTheDocument();
  await user.unhover(screen.getByRole("button", { name: "回复耗时" }));
  await user.click(screen.getByRole("button", { name: "重新生成回复" }));
  expect(props.onSend).toHaveBeenCalledWith({ operation: "regenerate", messageId: "a", expectedHeadId: "a", language: "zh-CN" });
});

it("shows only generated suggestions for a completed latest reply and hides mutations when read-only", () => {
  const props = defaults(); props.state.conversation = [{ id: "u", role: "user", text: "需求", status: "completed", createdAt: "now" },
    { id: "a", role: "assistant", text: "回复", status: "completed", createdAt: "now", suggestions: ["为借阅规则补充边界测试"] }];
  const mounted = render(view(props));
  expect(screen.getByRole("button", { name: "为借阅规则补充边界测试" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "检查现有模型中遗漏的业务规则" })).not.toBeInTheDocument();
  mounted.rerender(view({ ...props, disabled: true, canCancel: false }));
  expect(screen.queryByRole("button", { name: "为借阅规则补充边界测试" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "编辑消息" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "重新生成回复" })).toBeDisabled();
});

it("replaces edited history with the server snapshot without browser-only branches", async () => {
  const props = defaults(); props.state.conversation = [{ id: "u", role: "user", text: "旧需求", status: "completed", createdAt: "now" },
    { id: "a", role: "assistant", text: "被替换的回复", status: "completed", createdAt: "now" }];
  const mounted = render(view(props)); const user = userEvent.setup();
  await user.hover(screen.getByText("旧需求")); await user.click(screen.getByRole("button", { name: "编辑消息" }));
  const editor = screen.getByRole("textbox", { name: "编辑消息" }); await user.clear(editor); await user.type(editor, "新需求");
  await user.click(screen.getByRole("button", { name: "更新" }));
  await waitFor(() => expect(props.onSend).toHaveBeenCalled());
  mounted.rerender(view({ ...props, state: { ...props.state, conversation: [{ id: "new-u", role: "user", text: "新需求", status: "completed", createdAt: "now" },
    { id: "new-a", role: "assistant", text: "新回复", status: "completed", createdAt: "now" }] } }));
  expect(screen.getByText("新需求")).toBeInTheDocument(); expect(screen.getByText("新回复")).toBeInTheDocument();
  expect(screen.queryByText("被替换的回复")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "上一版本" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "下一版本" })).not.toBeInTheDocument();
});

it("preserves an edit across a pending request that is rejected", async () => {
  const props = defaults(); props.state.conversation = [{ id: "u", role: "user", text: "原需求", status: "completed", createdAt: "now" },
    { id: "a", role: "assistant", text: "原回复", status: "completed", createdAt: "now" }];
  let finish!: (accepted: boolean) => void;
  props.onSend.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const mounted = render(view(props)); const user = userEvent.setup();
  await user.hover(screen.getByText("原需求")); await user.click(screen.getByRole("button", { name: "编辑消息" }));
  const editor = screen.getByRole("textbox", { name: "编辑消息" }); await user.clear(editor); await user.type(editor, "尚未受理的编辑");
  await user.click(screen.getByRole("button", { name: "更新" }));
  mounted.rerender(view({ ...props, disabled: true }));
  await act(async () => { finish(false); });
  mounted.rerender(view(props));
  expect(screen.getByRole("textbox", { name: "编辑消息" })).toHaveValue("尚未受理的编辑");
  expect(screen.getByText("原回复")).toBeInTheDocument();
});
