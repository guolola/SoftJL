// Exercises occupied ports and community service responses so demo startup cannot silently accept a stale API.
import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";
import { checkDemoPorts, checkDemoReadiness, waitForDemo } from "./check-demo-startup.mjs";

async function listen(server, host) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolve);
  });
  return server.address().port;
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

for (const host of ["127.0.0.1", "::1", "0.0.0.0", "::"]) {
  test(`rejects an occupied ${host} port without stopping its owner, then permits restart`, async (t) => {
    const server = createServer((socket) => socket.end());
    let port;
    try {
      port = await listen(server, host);
    } catch (error) {
      if (host.includes(":") && ["EAFNOSUPPORT", "EADDRNOTAVAIL"].includes(error.code)) return t.skip("IPv6 unavailable");
      throw error;
    }
    t.after(() => server.listening && close(server));
    await assert.rejects(checkDemoPorts([{ name: "旧 API", port }]), /端口被占用：旧 API.*Ctrl\+C/);
    assert.equal(server.listening, true);
    await close(server);
    await checkDemoPorts([{ name: "API", port }]);
  });
}

function readyResponse(url) {
  const { pathname } = new URL(url);
  if (pathname === "/projects") return new Response("<!doctype html><html></html>", { headers: { "content-type": "text/html" } });
  return Response.json({ status: "ok" });
}

test("accepts a complete public demo with healthy API and render services", async () => {
  assert.deepEqual(await checkDemoReadiness(async (url) => readyResponse(url)), []);
});

test("waits for API startup before sending traffic through the Web proxy", async () => {
  const requested = [];
  const failures = await checkDemoReadiness(async (url) => {
    requested.push(url);
    throw new Error("connection refused");
  });
  assert.deepEqual(failures, ["API：尚未就绪"]);
  assert.deepEqual(requested, ["http://127.0.0.1:4101/health"]);
});

test("reports ready only after all startup checks pass", async () => {
  let time = 0;
  const logs = [];
  await waitForDemo({
    probe: async () => time < 2_000 ? ["API 尚未就绪"] : [],
    now: () => time,
    pause: async (ms) => { time += ms; },
    log: (line) => logs.push(line),
  });
  assert.equal(time, 2_000);
  assert.match(logs.at(-1), /启动成功/);
  assert.match(logs.at(-1), /http:\/\/localhost:3000\/projects/);
});

test("fails with the unresolved service when startup times out", async () => {
  let time = 0;
  const logs = [];
  await assert.rejects(waitForDemo({
    probe: async () => ["API 转发：HTTP 404"],
    timeoutMs: 2_000,
    now: () => time,
    pause: async (ms) => { time += ms; },
    log: (line) => logs.push(line),
  }), /启动检查超时：API 转发：HTTP 404/);
  assert.equal(logs.some((line) => line.includes("启动成功")), false);
});
