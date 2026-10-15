// Verifies production mail copy gives users an actionable browser path, not only raw tokens.
import assert from "node:assert/strict";
import test from "node:test";
import { buildTokenMail } from "./mail-adapter.js";

test("verification email includes a clickable verify link and token fallback", () => {
  const previousPublicWebBaseUrl = process.env.PUBLIC_WEB_BASE_URL;
  const previousPublicApiBaseUrl = process.env.PUBLIC_API_BASE_URL;
  process.env.PUBLIC_WEB_BASE_URL = "http://platform.example.com/";
  delete process.env.PUBLIC_API_BASE_URL;

  try {
    const message = buildTokenMail({
      email: "student@example.com",
      purpose: "verify_email",
      token: "verification-token",
      expiresAt: "2026-05-25T14:36:55.027Z",
    });

    assert.match(
      message.text,
      /http:\/\/platform\.example\.com\/verify-email\?token=verification-token&email=student%40example\.com/u,
    );
    assert.match(message.text, /短期 token：verification-token/u);
    assert.equal(message.subject, "验证 SoftJL 邮箱");
  } finally {
    if (previousPublicWebBaseUrl === undefined) {
      delete process.env.PUBLIC_WEB_BASE_URL;
    } else {
      process.env.PUBLIC_WEB_BASE_URL = previousPublicWebBaseUrl;
    }
    if (previousPublicApiBaseUrl === undefined) {
      delete process.env.PUBLIC_API_BASE_URL;
    } else {
      process.env.PUBLIC_API_BASE_URL = previousPublicApiBaseUrl;
    }
  }
});

test("password reset email includes a clickable reset link and token fallback", () => {
  const previousPublicWebBaseUrl = process.env.PUBLIC_WEB_BASE_URL;
  const previousPublicApiBaseUrl = process.env.PUBLIC_API_BASE_URL;
  process.env.PUBLIC_WEB_BASE_URL = "https://platform.example.com/";
  delete process.env.PUBLIC_API_BASE_URL;

  try {
    const message = buildTokenMail({
      email: "student@example.com",
      purpose: "reset_password",
      token: "reset token+?/",
      expiresAt: "2026-05-25T14:36:55.027Z",
    });

    assert.match(
      message.text,
      /https:\/\/platform\.example\.com\/reset-password\?token=reset%20token%2B%3F%2F/u,
    );
    assert.match(message.text, /短期 token：reset token\+\?\//u);
    assert.equal(message.subject, "重置 SoftJL 密码");
  } finally {
    if (previousPublicWebBaseUrl === undefined) {
      delete process.env.PUBLIC_WEB_BASE_URL;
    } else {
      process.env.PUBLIC_WEB_BASE_URL = previousPublicWebBaseUrl;
    }
    if (previousPublicApiBaseUrl === undefined) {
      delete process.env.PUBLIC_API_BASE_URL;
    } else {
      process.env.PUBLIC_API_BASE_URL = previousPublicApiBaseUrl;
    }
  }
});

test("project invitation email includes a clickable accept link and token fallback", () => {
  const previousPublicWebBaseUrl = process.env.PUBLIC_WEB_BASE_URL;
  const previousPublicApiBaseUrl = process.env.PUBLIC_API_BASE_URL;
  process.env.PUBLIC_API_BASE_URL = "http://api.example.com/api";
  delete process.env.PUBLIC_WEB_BASE_URL;

  try {
    const message = buildTokenMail({
      email: "invitee@example.com",
      purpose: "project_invitation",
      token: "invite-token",
      expiresAt: "2026-05-25T14:36:55.027Z",
      projectName: "图书馆项目",
    });

    assert.match(
      message.text,
      /http:\/\/api\.example\.com\/invitations\/accept\?token=invite-token/u,
    );
    assert.match(message.text, /邀请码中粘贴以下邀请 token：invite-token/u);
    assert.match(message.subject, /图书馆项目/u);
  } finally {
    if (previousPublicWebBaseUrl === undefined) {
      delete process.env.PUBLIC_WEB_BASE_URL;
    } else {
      process.env.PUBLIC_WEB_BASE_URL = previousPublicWebBaseUrl;
    }
    if (previousPublicApiBaseUrl === undefined) {
      delete process.env.PUBLIC_API_BASE_URL;
    } else {
      process.env.PUBLIC_API_BASE_URL = previousPublicApiBaseUrl;
    }
  }
});
