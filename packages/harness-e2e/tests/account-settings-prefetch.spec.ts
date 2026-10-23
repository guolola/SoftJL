// Verifies account settings preloading and request stability through the real browser UI.
import { expect, test } from "@playwright/test";
import { mockProjectApi, projectId } from "./fixtures/project-workspace";

const now = "2026-09-22T02:00:00.000Z";

function json(body: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

test("preloads global settings before the tab is selected without duplicate requests", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("uml-lab-locale-preference", "zh-CN");
  });
  await mockProjectApi(page);

  const requestCounts = {
    me: 0,
    providerConfigs: 0,
    billingSummary: 0,
    temporaryTests: 0,
  };

  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/auth/me") requestCounts.me += 1;
    if (pathname === "/api/provider-configs") requestCounts.providerConfigs += 1;
    if (pathname === "/api/billing/summary") requestCounts.billingSummary += 1;
    if (pathname === "/api/provider-configs/test-temporary") requestCounts.temporaryTests += 1;
  });

  await page.route("**/api/provider-configs", async (route) => {
    await route.fulfill(
      json({
        generatedAt: now,
        providerConfigs: [
          {
            id: "provider-1",
            name: "课程 OpenAI",
            provider: "openai",
            baseUrl: "https://api.example.test/v1",
            defaultModel: "gpt-5.6",
            allowedModels: ["gpt-5.6", "gpt-5.5"],
            maskedKey: "sk-***",
            keyPurpose: "course",
            status: "active",
            riskState: "approved",
            quota: "managed",
            createdBy: "admin-1",
            createdAt: now,
            updatedAt: now,
            lastUsedAt: null,
            allowlisted: true,
            scopeType: "system",
            scopeId: null,
          },
        ],
      }),
    );
  });
  await page.route("**/api/provider-configs/discover-models/stream", route => {
    const failure = route.request().postDataJSON().apiKey === "incorrect-key";
    const event = failure
      ? { type: "error", code: "PROVIDER_AUTH_FAILED", message: "Provider model discovery failed", retryable: false, status: 401 }
      : { type: "completed", result: { models: [{ id: "deepseek-ai/DeepSeek-V3", structuredOutputMode: "strict_json" }, { id: "gpt-5.6", structuredOutputMode: "json_object" }, { id: "gemini-3.1-pro", structuredOutputMode: "compatible" }].map(model => ({ ...model, category: "text_chat", supportsJsonSchema: model.structuredOutputMode === "strict_json", supportsJsonObject: model.structuredOutputMode !== "compatible", strictJson: model.structuredOutputMode === "strict_json", modeLabel: model.structuredOutputMode, probeStatus: model.structuredOutputMode === "strict_json" ? "strict" : model.structuredOutputMode, probedAt: now })), fetchedAt: now, sourceBaseUrl: "https://provider.example.test/v1" } };
    return route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify(event)}\n\n` });
  });
  await page.route("**/api/billing/summary", async (route) => {
    await route.fulfill(
      json({
        creditBalance: 8,
        signupBonus: { granted: false, creditAmount: 0, validUntil: null },
        recentOrders: [],
      }),
    );
  });
  await page.route("**/api/account/profile", async (route) => {
    await route.fulfill(
      json({
        user: {
          id: "user-1",
          username: "model_nav",
          displayName: "Model Nav Reviewer",
          status: "active",
          mfaEnabled: false,
          avatarUrl: null, systemRoles: [], createdAt: now, updatedAt: now, lastLoginAt: now,
        },
        session: {
          id: "session-1",
          userId: "user-1",
          createdAt: now,
          expiresAt: "2026-10-22T02:00:00.000Z",
          lastSeenAt: now,
          ipAddress: "127.0.0.1",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0",
        },
        mfa: { enabled: false, enforcement: "totp" },
        generationUsage: {
          usedToday: 0,
          limit: null,
          remaining: null,
          windowSeconds: 86400,
          limited: false,
          scope: "user",
        },
      }),
    );
  });
  await page.route("**/api/account/sessions", async (route) => {
    await route.fulfill(
      json({
        sessions: [
          {
            id: "session-1",
            userId: "user-1",
            createdAt: now,
            expiresAt: "2026-10-22T02:00:00.000Z",
            lastSeenAt: now,
            ipAddress: "127.0.0.1",
            locationLabel: "本机",
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0",
          },
        ],
      }),
    );
  });

  await page.goto(`/projects/${projectId}`);
  await expect(page.locator("#requirement-text")).toBeVisible();
  await expect.poll(() => requestCounts.providerConfigs).toBe(1);

  await page.getByRole("button", { name: "账号", exact: true }).click();
  await page.getByRole("menuitem", { name: "账号", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => requestCounts.billingSummary).toBe(0);

  const countsBeforeTabSwitch = { ...requestCounts };
  await dialog.getByRole("tab", { name: "模型配置" }).click();
  const providers = dialog.getByRole("table", { name: "模型配置" });
  await expect(providers.getByRole("columnheader")).toHaveText(["供应商名称", "状态", "默认模型", "更新时间", "启用", "操作"]);
  await expect(providers.getByText("课程 OpenAI")).toBeVisible();
  await expect(providers.getByText("gpt-5.6")).toBeVisible();
  await expect(providers.getByText("默认", { exact: true })).toBeVisible();
  await expect(providers.getByRole("switch", { name: "启用 课程 OpenAI" })).toBeChecked();
  await expect(providers.getByRole("button", { name: /编辑/ })).toHaveCount(0);
  await expect(dialog.getByLabel("模型来源", { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("switch", { name: "完成提示音" })).toHaveCount(0);
  await dialog.getByRole("tab", { name: "工作台偏好" }).click();
  await expect(dialog.getByRole("switch", { name: "完成提示音" })).toBeVisible();
  await dialog.getByRole("tab", { name: "模型配置" }).click();

  await expect.poll(() => ({ ...requestCounts })).toEqual(countsBeforeTabSwitch);

  // The table scrolls inside its own container while the dialog fits both viewports.
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(dialog.locator("[data-page-description]")).not.toHaveText(/[。.]+$/u);

  await dialog.getByRole("button", { name: "添加供应商", exact: true }).click();
    const creation = page.getByRole("dialog", { name: "添加供应商", exact: true });
    const fetchButton = creation.getByRole("button", { name: "获取模型列表", exact: true });
    await expect(creation.getByRole("button", { name: "测试托管配置", exact: true })).toHaveCount(0);
    await expect(creation.getByRole("button", { name: "保存供应商", exact: true })).toBeDisabled();
    const assertVisibleAlert = async (message: string) => {
      const alert = page.getByRole("alert").filter({ hasText: message });
      await expect(alert).toBeVisible();
      // Visibility alone does not detect another popup covering the message.
      await expect.poll(() => alert.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
      })).toBe(true);
      await expect(creation).toBeVisible();
      await alert.getByRole("button", { name: "关闭提示" }).click();
      await expect(alert).toHaveCount(0);
      await expect(creation).toBeVisible();
    };
    await fetchButton.click();
    await assertVisibleAlert("请填写供应商名称");
    await creation.getByLabel("名称", { exact: true }).fill("My provider");
    await creation.getByLabel("Base URL", { exact: true }).fill("https://provider.example.test/v1");
    await creation.getByLabel("API Key", { exact: true }).fill("incorrect-key");
    await creation.getByLabel("Base URL", { exact: true }).fill("incorrect-url");
    await fetchButton.click();
    await assertVisibleAlert("请输入有效的 HTTP 或 HTTPS 服务地址。");
    await creation.getByLabel("Base URL", { exact: true }).fill("https://provider.example.test/v1");
    await fetchButton.click();
    const authAlert = page.getByRole("alert").filter({ hasText: "模型供应商鉴权失败，请检查密钥和账号权限。" });
    await expect(authAlert).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`provider-error-alert-${width}.png`) });
    await assertVisibleAlert("模型供应商鉴权失败，请检查密钥和账号权限。");
    await expect(creation.getByRole("button", { name: "保存供应商", exact: true })).toBeDisabled();
    await creation.getByLabel("API Key", { exact: true }).fill("test-only-key");
    await fetchButton.click();
    const modelInput = creation.getByRole("combobox", { name: "供应商默认模型" });
    await expect(modelInput).toHaveValue("deepseek-ai/DeepSeek-V3");
    await creation.getByRole("button", { name: "展开模型列表" }).click();
    await expect(page.getByRole("option", { name: "deepseek-ai/DeepSeek-V3" }).getByTestId("provider-icon-deepseek")).toBeVisible();
    await expect(page.getByRole("option", { name: "gpt-5.6" }).getByTestId("provider-icon-openai")).toBeVisible();
    await expect(page.getByRole("option", { name: "deepseek-ai/DeepSeek-V3" }).getByText("严格 JSON")).toBeVisible();
    await expect(page.getByRole("option", { name: "gpt-5.6" }).getByText("JSON 模式")).toBeVisible();
    await expect(page.getByRole("option", { name: "gemini-3.1-pro" }).getByText("兼容", { exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`provider-model-combobox-${width}.png`) });
    await modelInput.fill("gpt");
    await expect(page.getByRole("option", { name: "deepseek-ai/DeepSeek-V3" })).toHaveCount(0);
    await page.getByRole("option", { name: "gpt-5.6" }).click();
    await expect(modelInput).toHaveValue("gpt-5.6");
    await expect(creation.getByRole("button", { name: "保存供应商", exact: true })).toBeEnabled();
    await expect(creation.locator('[data-slot="input-group"]').getByText("JSON 模式")).toBeVisible();
    expect(requestCounts.temporaryTests).toBe(0);
    await creation.getByRole("button", { name: "取消", exact: true }).click();
    await expect(dialog).toBeVisible();
  }
});
