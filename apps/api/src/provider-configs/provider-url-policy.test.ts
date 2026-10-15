// Verifies provider endpoints remain public HTTPS destinations at request time.
import assert from "node:assert/strict";
import test from "node:test";
import {
  assertManagedProviderBaseUrlResolvesPublicly,
  inferOpenAiCompatibleProvider,
  normalizeManagedProviderBaseUrl,
} from "./provider-url-policy.js";

test("provider URL policy accepts arbitrary public HTTPS origins", async () => {
  const result = await assertManagedProviderBaseUrlResolvesPublicly(
    "https://custom-provider.example/v1/chat/completions",
    async () => ["8.8.8.8", "1.1.1.1"],
  );

  assert.equal(result, "https://custom-provider.example");
});

test("provider URL policy recognizes NoneLinear domestic endpoint", () => {
  assert.equal(
    inferOpenAiCompatibleProvider("https://api.nonelinear.com.cn/v1"),
    "nonelinear",
  );
});

test("provider URL policy rejects unsafe URL shapes", () => {
  assert.throws(() => normalizeManagedProviderBaseUrl("http://example.com"), /HTTPS/);
  assert.throws(
    () => normalizeManagedProviderBaseUrl("https://user:secret@example.com"),
    /credentials/,
  );
  assert.throws(
    () => normalizeManagedProviderBaseUrl("https://example.com:8443"),
    /default HTTPS port/,
  );
  assert.throws(() => normalizeManagedProviderBaseUrl("https://127.0.0.1"), /public HTTPS/);
});

test("provider URL policy rejects any private DNS answer", async () => {
  await assert.rejects(
    () =>
      assertManagedProviderBaseUrlResolvesPublicly(
        "https://mixed-dns.example",
        async () => ["8.8.8.8", "169.254.169.254"],
      ),
    /public HTTPS/,
  );
});

test("provider URL policy rejects private and link-local IPv6 answers", async () => {
  for (const address of ["fd00:ec2::254", "fe90::1", "::ffff:10.0.0.8"]) {
    await assert.rejects(
      () =>
        assertManagedProviderBaseUrlResolvesPublicly(
          "https://ipv6-provider.example",
          async () => [address],
        ),
      /public HTTPS/,
    );
  }
});

test("provider URL policy catches DNS changes between saved and runtime checks", async () => {
  let addresses = ["8.8.8.8"];
  const resolver = async () => addresses;
  await assert.doesNotReject(() =>
    assertManagedProviderBaseUrlResolvesPublicly("https://rebind.example", resolver),
  );

  addresses = ["10.0.0.9"];
  await assert.rejects(
    () => assertManagedProviderBaseUrlResolvesPublicly("https://rebind.example", resolver),
    /public HTTPS/,
  );
});
