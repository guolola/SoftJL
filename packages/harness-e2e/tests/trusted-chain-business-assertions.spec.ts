// Verifies representative generated workflows enforce trusted business assertions in a real browser.
import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";

test("representative generated workflow enforces business assertions in browser", async ({
  page,
}, testInfo) => {
  await page.setContent(`
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <title>Generated Workflow Acceptance</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; color: #18212f; }
          main { max-width: 720px; display: grid; gap: 16px; }
          label { display: grid; gap: 6px; font-weight: 600; }
          input, select, button { min-height: 36px; font: inherit; }
          button { width: fit-content; padding: 0 14px; }
          #feedback { min-height: 28px; padding: 10px 12px; border: 1px solid #bac6d8; }
          #status { font-weight: 700; }
        </style>
      </head>
      <body>
        <main>
          <h1>审批工作流</h1>
          <label>角色
            <select id="role" aria-label="角色">
              <option value="viewer">访客</option>
              <option value="approver">审批人</option>
            </select>
          </label>
          <label>申请编号
            <input id="requestId" aria-label="申请编号" />
          </label>
          <label>金额
            <input id="amount" aria-label="金额" type="number" />
          </label>
          <button id="submit" type="button">提交审批</button>
          <button id="approve" type="button">批准</button>
          <div>状态：<span id="status">draft</span></div>
          <div>批准次数：<span id="approvalCount">0</span></div>
          <div id="feedback" role="status" aria-live="polite"></div>
        </main>
        <script>
          const role = document.querySelector("#role");
          const requestId = document.querySelector("#requestId");
          const amount = document.querySelector("#amount");
          const status = document.querySelector("#status");
          const approvalCount = document.querySelector("#approvalCount");
          const feedback = document.querySelector("#feedback");
          const setFeedback = (message) => { feedback.textContent = message; };
          document.querySelector("#submit").addEventListener("click", () => {
            if (role.value !== "approver") {
              setFeedback("未授权用户不能审批");
              return;
            }
            if (!requestId.value.trim()) {
              setFeedback("申请编号必填");
              return;
            }
            const numericAmount = Number(amount.value);
            if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
              setFeedback("金额必须大于0");
              return;
            }
            if (numericAmount > 100) {
              setFeedback("金额不能超过100");
              return;
            }
            status.textContent = "pending";
            setFeedback("申请已提交，等待批准");
          });
          document.querySelector("#approve").addEventListener("click", () => {
            if (status.textContent === "approved") {
              setFeedback("重复审批已忽略");
              return;
            }
            if (status.textContent !== "pending") {
              setFeedback("只有待审批状态可以批准");
              return;
            }
            status.textContent = "approved";
            approvalCount.textContent = String(Number(approvalCount.textContent) + 1);
            setFeedback("审批已通过");
          });
        </script>
      </body>
    </html>
  `);

  await page.getByRole("button", { name: "提交审批" }).click();
  await expect(page.getByRole("status")).toHaveText("未授权用户不能审批");

  await page.getByLabel("角色").selectOption("approver");
  await page.getByRole("button", { name: "提交审批" }).click();
  await expect(page.getByRole("status")).toHaveText("申请编号必填");

  await page.getByLabel("申请编号").fill("REQ-001");
  await page.getByLabel("金额").fill("-1");
  await page.getByRole("button", { name: "提交审批" }).click();
  await expect(page.getByRole("status")).toHaveText("金额必须大于0");

  await page.getByLabel("金额").fill("101");
  await page.getByRole("button", { name: "提交审批" }).click();
  await expect(page.getByRole("status")).toHaveText("金额不能超过100");

  await page.getByLabel("金额").fill("80");
  await page.getByRole("button", { name: "提交审批" }).click();
  await expect(page.getByText("状态：pending")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("申请已提交，等待批准");

  await page.getByRole("button", { name: "批准" }).click();
  await expect(page.getByText("状态：approved")).toBeVisible();
  await expect(page.locator("#approvalCount")).toHaveText("1");
  await expect(page.getByRole("status")).toHaveText("审批已通过");

  await page.getByRole("button", { name: "批准" }).click();
  await expect(page.locator("#approvalCount")).toHaveText("1");
  await expect(page.getByRole("status")).toHaveText("重复审批已忽略");

  await page.screenshot({
    path: testInfo.outputPath("generated-workflow-accepted.png"),
    fullPage: true,
  });
  await fs.writeFile(
    testInfo.outputPath("generated-workflow.html"),
    await page.content(),
    "utf8",
  );
});
