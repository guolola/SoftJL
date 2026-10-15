// Rejects stale local services and verifies the public Web -> API -> render path before declaring the demo ready.
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ORIGIN = "http://localhost:3000";
const DEMO_PORTS = [
  { name: "网页", port: 3000 },
  { name: "API", port: 4101 },
  { name: "图形渲染", port: 4002 },
];

function probePort(port, host) {
  return new Promise((resolveProbe, reject) => {
    const server = createServer();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") return resolveProbe(false);
      if (["EAFNOSUPPORT", "EADDRNOTAVAIL"].includes(error.code) && host.includes(":")) {
        return resolveProbe(true);
      }
      reject(error);
    });
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolveProbe(true)));
  });
}

export async function checkDemoPorts(ports = DEMO_PORTS) {
  const conflicts = [];
  for (const { name, port } of ports) {
    // Check every binding Windows may treat separately. Close each probe before
    // opening the next: loopback and wildcard listeners conflict on Linux.
    for (const host of ["127.0.0.1", "::1", "0.0.0.0", "::"]) {
      if (!await probePort(port, host)) {
        conflicts.push(`${name}（${port}）`);
        break;
      }
    }
  }
  if (conflicts.length) {
    throw new Error(
      `端口被占用：${conflicts.join("、")}。请先在原开发终端按 Ctrl+C 停止旧服务，再运行 npm run dev:postgres:demo。若旧终端已关闭，请在任务管理器中确认并结束对应开发进程。此次未启动新服务，也未结束其他程序。`,
    );
  }
}

const checks = [
  { name: "网页", url: `${ORIGIN}/projects`, html: true },
  { name: "API 转发", url: `${ORIGIN}/api/health`, accepts: (body) => body.status === "ok" },
  { name: "图形渲染", url: "http://127.0.0.1:4002/health", accepts: (body) => body.status === "ok" },
];

export async function checkDemoReadiness(fetcher = fetch) {
  // Wait for the upstream before probing Next rewrites, avoiding proxy error floods during API startup.
  try {
    const response = await fetcher("http://127.0.0.1:4101/health", { signal: AbortSignal.timeout(5_000), redirect: "manual" });
    const body = await response.json();
    if (response.status !== 200 || body.status !== "ok") return ["API：尚未就绪"];
  } catch {
    return ["API：尚未就绪"];
  }
  const failures = await Promise.all(checks.map(async (check) => {
    try {
      const response = await fetcher(check.url, { signal: AbortSignal.timeout(5_000), redirect: "manual" });
      if (response.status !== (check.status ?? 200)) {
        await response.arrayBuffer();
        return `${check.name}：HTTP ${response.status}`;
      }
      if (check.html) {
        if (!response.headers.get("content-type")?.includes("text/html")) return `${check.name}：不是网页`;
        await response.arrayBuffer();
      } else if (!check.accepts(await response.json())) {
        return `${check.name}：返回内容或公共地址不符合演示配置`;
      }
      return null;
    } catch {
      return `${check.name}：尚未就绪或未返回有效内容`;
    }
  }));
  return failures.filter(Boolean);
}

export async function waitForDemo({
  probe = checkDemoReadiness,
  timeoutMs = 180_000,
  pause = delay,
  now = Date.now,
  log = console.log,
} = {}) {
  const deadline = now() + timeoutMs;
  let nextLogAt = 0;
  let failures;
  do {
    failures = await probe();
    if (!failures.length) {
      log(`[demo] 启动成功：网页、API、图形渲染检查通过。\n[demo] 项目入口：${ORIGIN}/projects\n[demo] 停止本次开发服务请按 Ctrl+C。`);
      return;
    }
    if (now() >= nextLogAt) {
      log(`[demo] 等待启动：${failures.join("；")}`);
      nextLogAt = now() + 15_000;
    }
    await pause(1_000);
  } while (now() < deadline);
  throw new Error(`启动检查超时：${failures.join("；")}。请查看上方对应服务的错误日志；本次启动的服务将停止。`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  const task = mode === "--ports" ? checkDemoPorts : mode === "--ready" ? waitForDemo : null;
  if (!task) {
    console.error("Usage: node scripts/dev/check-demo-startup.mjs --ports|--ready");
    process.exitCode = 1;
  } else {
    task().catch((error) => {
      console.error(`[demo] ${error.message}`);
      process.exitCode = 1;
    });
  }
}
