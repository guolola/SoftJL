// Shares provider secret encryption and hashing across memory and PostgreSQL storage.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export class ProviderConfigSecretError extends Error {}

export function createSecretKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(apiKey: string, secretKey: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey, iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Both stores persist the same authenticated payload: IV, tag, then ciphertext.
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptSecret(payload: string, secretKey: Buffer) {
  const [ivBase64, tagBase64, ciphertextBase64] = payload.split(".");
  if (!ivBase64 || !tagBase64 || !ciphertextBase64) {
    throw new ProviderConfigSecretError("Provider secret payload is invalid");
  }
  const decipher = createDecipheriv("aes-256-gcm", secretKey, Buffer.from(ivBase64, "base64"));
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function hashSecret(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex");
}
