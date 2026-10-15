// Provides mail delivery adapters for auth, MFA, and invitation workflows.
import nodemailer from "nodemailer";

export type MailPurpose =
  | "verify_email"
  | "reset_password"
  | "project_invitation"
  | "admin_invitation";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  purpose: MailPurpose;
  token?: string;
  expiresAt?: string;
};

export type MailAdapter = {
  send(message: MailMessage): Promise<void>;
};

export function createMailAdapterFromEnv(): MailAdapter {
  if (process.env.NODE_ENV === "production") {
    return createSmtpMailAdapter();
  }
  return createDevMailAdapter();
}

export function createDevMailAdapter(): MailAdapter & { sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
      console.info(
        `[mail:dev] ${message.purpose} to=${message.to} token=${message.token ?? "<none>"} expiresAt=${message.expiresAt ?? "<none>"}`,
      );
    },
  };
}

export function createSmtpMailAdapter(): MailAdapter {
  const host = readRequiredEnv("SMTP_HOST");
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = readRequiredEnv("SMTP_USER");
  const pass = readRequiredEnv("SMTP_PASS");
  const from = readRequiredEnv("SMTP_FROM");
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return {
    async send(message) {
      await transport.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    },
  };
}

export function buildTokenMail({
  email,
  purpose,
  token,
  expiresAt,
  projectName,
  adminRoleLabel,
}: {
  email: string;
  purpose: MailPurpose;
  token: string;
  expiresAt: string;
  projectName?: string;
  adminRoleLabel?: string;
}): MailMessage {
  if (purpose === "reset_password") {
    const resetUrl = buildPublicWebUrl(
      `/reset-password?token=${encodeURIComponent(token)}`,
    );
    return {
      to: email,
      purpose,
      token,
      expiresAt,
      subject: "重置 SoftJL 密码",
      text: resetUrl
        ? `请点击以下链接重置密码：${resetUrl}\n\n如果链接无法打开，请复制完整链接到浏览器。短期 token：${token}\n过期时间：${expiresAt}\n如果不是你本人操作，请忽略这封邮件。`
        : `请使用以下短期 token 重置密码：${token}\n过期时间：${expiresAt}\n如果不是你本人操作，请忽略这封邮件。`,
    };
  }
  if (purpose === "project_invitation") {
    const invitationUrl = buildPublicWebUrl(
      `/invitations/accept?token=${encodeURIComponent(token)}`,
    );
    return {
      to: email,
      purpose,
      token,
      expiresAt,
      subject: `项目邀请：${projectName ?? "SoftJL 项目"}`,
      text: invitationUrl
        ? `你被邀请加入项目「${projectName ?? "SoftJL 项目"}」。\n\n请点击以下链接接受邀请：${invitationUrl}\n\n如果链接无法打开，请在注册页的邀请码中粘贴以下邀请 token：${token}\n过期时间：${expiresAt}`
      : `你被邀请加入项目「${projectName ?? "SoftJL 项目"}」。请在注册页的邀请码中粘贴以下邀请 token：${token}\n过期时间：${expiresAt}`,
    };
  }
  if (purpose === "admin_invitation") {
    const configured = process.env.ADMIN_PUBLIC_WEB_BASE_URL?.trim();
    const invitationUrl = configured
      ? `${configured.replace(/\/+$/u, "")}/admin-invitations/accept?token=${encodeURIComponent(token)}`
      : null;
    return {
      to: email,
      purpose,
      token,
      expiresAt,
      subject: "SoftJL 管理员邀请",
      text: invitationUrl
        ? `你被邀请成为 SoftJL 的${adminRoleLabel ?? "管理员"}。\n\n请点击以下链接接受邀请：${invitationUrl}\n\n邀请将在 ${expiresAt} 失效。如果这不是你的预期，请忽略此邮件。`
        : `你被邀请成为 SoftJL 的${adminRoleLabel ?? "管理员"}。邀请 token：${token}\n过期时间：${expiresAt}`,
    };
  }
  const verificationUrl = buildPublicWebUrl(
    `/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`,
  );
  return {
    to: email,
    purpose,
    token,
    expiresAt,
    subject: "验证 SoftJL 邮箱",
    text: verificationUrl
      ? `请点击以下链接验证邮箱：${verificationUrl}\n\n如果链接无法打开，请在验证邮箱页面粘贴以下短期 token：${token}\n过期时间：${expiresAt}`
      : `请在验证邮箱页面粘贴以下短期 token：${token}\n过期时间：${expiresAt}`,
  };
}

function buildPublicWebUrl(path: string) {
  const configured =
    process.env.PUBLIC_WEB_BASE_URL?.trim() ||
    process.env.PUBLIC_API_BASE_URL?.trim();
  if (!configured) return null;
  const baseUrl = configured.replace(/\/+$/u, "").replace(/\/api$/iu, "");
  return `${baseUrl}${path}`;
}

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for production SMTP mail delivery`);
  }
  return value;
}
