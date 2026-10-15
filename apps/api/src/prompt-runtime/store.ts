// Persists editable prompt instructions and resolves the version pinned by each new run.
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { createPostgresPoolFromEnv, getDatabaseUrl } from "../db/postgres.js";
import { withTransaction } from "../db/transactions.js";
import { catalog, catalogById, findPromptForMessage, type CatalogEntry } from "./catalog.js";
import type { LlmTransport, ChatMessage } from "../llm.js";


type Status = "draft" | "pending" | "published" | "superseded";
export type PromptVersion = {
  id: string;
  promptId: string;
  content: string;
  status: Status;
  revision: number;
  author: string;
  approver: string | null;
  createdAt: string;
  updatedAt: string;
};
type VersionRow = {
  id: string; prompt_id: string; content: string; status: Status; revision: number;
  author: string; approver: string | null; created_at: Date | string; updated_at: Date | string;
};
export type PublishedSnapshot = Record<string, { id: string; content: string }>;

export class PromptRuntimeError extends Error {
  constructor(message: string, readonly statusCode: number) { super(message); }
}

function editable(id: string): CatalogEntry {
  const item = catalogById.get(id);
  if (!item) throw new PromptRuntimeError("提示词不存在", 404);
  if (item.kind === "locked" || item.kind === "skill") throw new PromptRuntimeError("该项目只读", 403);
  return item;
}
function validateContent(content: unknown): string {
  if (typeof content !== "string" || !content.trim() || content.length > 4000) {
    throw new PromptRuntimeError("指令内容长度必须在 1 到 4000 字符之间", 400);
  }
  return content.trim();
}
function versionFromRow(row: VersionRow): PromptVersion {
  return { id: row.id, promptId: row.prompt_id, content: row.content, status: row.status,
    revision: row.revision, author: row.author, approver: row.approver,
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
}

export class PromptRuntimeStore {
  private readonly pool: Pool | null;
  private readonly memory = new Map<string, PromptVersion[]>();
  private readonly activeMemory = new Map<string, string>();
  constructor(pool?: Pool | null) {
    this.pool = pool === undefined ? (getDatabaseUrl() ? createPostgresPoolFromEnv() : null) : pool;
  }

  async versions(id: string): Promise<PromptVersion[]> {
    if (!catalogById.has(id)) throw new PromptRuntimeError("运行时项目不存在", 404);
    if (!this.pool) return [...(this.memory.get(id) ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const rows = await this.pool.query<VersionRow>(
      "select * from prompt_runtime_versions where prompt_id=$1 order by created_at desc", [id]);
    return rows.rows.map(versionFromRow);
  }

  async publishedSnapshot(): Promise<PublishedSnapshot> {
    if (!this.pool) {
      const snapshot: PublishedSnapshot = {};
      for (const [id, versionId] of this.activeMemory) {
        const version = (this.memory.get(id) ?? []).find((row) => row.id === versionId);
        if (version) snapshot[id] = { id: version.id, content: version.content };
      }
      return snapshot;
    }
    const rows = await this.pool.query<VersionRow>(
      "select v.* from prompt_runtime_active a join prompt_runtime_versions v on v.id=a.version_id");
    return Object.fromEntries(rows.rows.map((row) => [row.prompt_id, { id: row.id, content: row.content }]));
  }

  async list() {
    const active = await this.publishedSnapshot();
    return catalog.map((item) => ({ id: item.id, name: item.path.at(-1) ?? item.id,
      path: item.path, kind: item.kind ?? "prompt", editable: !item.kind,
      source: item.source, activeVersionId: active[item.id]?.id ?? null,
      activeStatus: active[item.id] ? "published" : item.kind ? "read-only" : "default" }));
  }

  async detail(id: string) {
    const item = catalogById.get(id);
    if (!item) throw new PromptRuntimeError("运行时项目不存在", 404);
    const [versions, active] = await Promise.all([this.versions(id), this.publishedSnapshot()]);
    let defaultInstruction = item.instruction;
    const variables = item.path[0] === "需求建模" ? ["已确认需求文本或规则", "需求基线及上游模型", "目标图类型或校验错误"]
      : item.path[0] === "可行性分析" ? ["需求规则与基线", "系统环境图和业务流程图", "候选方案或修复错误"]
      : item.path[0] === "设计建模" ? ["需求模型及用例事件流", "已生成的设计模型", "目标图类型或校验错误"]
      : ["当前产物及文档类型", "原始内容和校验错误", "结构化模型及图源码"];
    const readOnlyConstraints = ["系统消息与 JSON 输出要求", "响应 Schema 和字段契约", "图类型、追踪关系及安全规则"];
    const instruction = active[id]?.content ?? defaultInstruction;
    return { ...item, kind: item.kind ?? "prompt", editable: !item.kind,
      defaultInstruction, activeInstruction: instruction,
      activeVersionId: active[id]?.id ?? null, versions, variables, readOnlyConstraints,
      preview: "任务指令：\n" + instruction +
        "\n\n只读约束：\n" + readOnlyConstraints.map((value) => "- " + value).join("\n") +
        "\n\n动态输入（已脱敏）：\n" + variables.map((value) => "- [" + value + "]").join("\n") +
        "\n\n来源：" + item.source + "。预览不包含真实项目数据。" };

  }

  async createDraft(id: string, content: unknown, actor: string) {
    editable(id);
    const next: PromptVersion = { id: randomUUID(), promptId: id, content: validateContent(content),
      status: "draft", revision: 1, author: actor, approver: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (!this.pool) { this.memory.set(id, [...(this.memory.get(id) ?? []), next]); return next; }
    await this.pool.query("insert into prompt_runtime_versions (id,prompt_id,content,status,revision,author,created_at,updated_at) values ($1,$2,$3,'draft',1,$4,now(),now())",
      [next.id, id, next.content, actor]);
    return next;
  }

  async updateDraft(id: string, versionId: string, content: unknown, revision: number, actor: string) {
    editable(id);
    const value = validateContent(content);
    if (!Number.isInteger(revision) || revision < 1) throw new PromptRuntimeError("版本号无效", 400);
    if (!this.pool) {
      const row = (this.memory.get(id) ?? []).find((item) => item.id === versionId);
      if (!row || row.status !== "draft" || row.revision !== revision) throw new PromptRuntimeError("草稿已变化，请刷新后重试", 409);
      row.content = value; row.revision++; row.updatedAt = new Date().toISOString(); row.author = actor;
      return row;
    }
    const result = await this.pool.query<VersionRow>(
      "update prompt_runtime_versions set content=$4,revision=revision+1,author=$5,updated_at=now() where prompt_id=$1 and id=$2 and revision=$3 and status='draft' returning *",
      [id, versionId, revision, value, actor]);
    if (!result.rows[0]) throw new PromptRuntimeError("草稿已变化，请刷新后重试", 409);
    return versionFromRow(result.rows[0]);
  }

  async submit(id: string, versionId: string, actor: string) {
    editable(id);
    if (!this.pool) {
      const row = (this.memory.get(id) ?? []).find((item) => item.id === versionId && item.status === "draft");
      if (!row) throw new PromptRuntimeError("只有草稿可以提交", 409);
      row.status = "pending"; row.updatedAt = new Date().toISOString(); return row;
    }
    const result = await this.pool.query<VersionRow>(
      "update prompt_runtime_versions set status='pending',updated_at=now() where prompt_id=$1 and id=$2 and status='draft' returning *", [id, versionId]);
    if (!result.rows[0]) throw new PromptRuntimeError("只有草稿可以提交", 409);
    return versionFromRow(result.rows[0]);
  }

  async approve(id: string, versionId: string, actor: string) {
    editable(id);
    if (!this.pool) {
      const row = (this.memory.get(id) ?? []).find((item) => item.id === versionId && item.status === "pending");
      if (!row) throw new PromptRuntimeError("只有待审批版本可以发布", 409);
      for (const current of this.memory.get(id) ?? []) if (current.status === "published") current.status = "superseded";
      row.status = "published"; row.approver = actor; row.updatedAt = new Date().toISOString();
      this.activeMemory.set(id, versionId); return row;
    }
    return withTransaction(this.pool, async (db) => {
      await db.query("select pg_advisory_xact_lock(hashtext($1))", [id]);
      const result = await db.query<VersionRow>(
        "update prompt_runtime_versions set status='published',approver=$3,updated_at=now() where prompt_id=$1 and id=$2 and status='pending' returning *", [id, versionId, actor]);
      if (!result.rows[0]) throw new PromptRuntimeError("只有待审批版本可以发布", 409);
      await db.query("update prompt_runtime_versions set status='superseded' where prompt_id=$1 and id<>$2 and status='published'", [id, versionId]);
      await db.query("insert into prompt_runtime_active(prompt_id,version_id) values($1,$2) on conflict(prompt_id) do update set version_id=excluded.version_id", [id, versionId]);
      return versionFromRow(result.rows[0]);
    });
  }

  async rollback(id: string, versionId: string) {
    editable(id);
    if (!this.pool) {
      const row = (this.memory.get(id) ?? []).find((item) => item.id === versionId && ["published", "superseded"].includes(item.status));
      if (!row) throw new PromptRuntimeError("只能回滚到已发布过的版本", 409);
      for (const current of this.memory.get(id) ?? []) if (current.status === "published") current.status = "superseded";
      row.status = "published"; row.updatedAt = new Date().toISOString(); this.activeMemory.set(id, versionId); return row;
    }
    return withTransaction(this.pool, async (db) => {
      await db.query("select pg_advisory_xact_lock(hashtext($1))", [id]);
      const result = await db.query<VersionRow>("select * from prompt_runtime_versions where prompt_id=$1 and id=$2 and status in ('published','superseded') for update", [id, versionId]);
      if (!result.rows[0]) throw new PromptRuntimeError("只能回滚到已发布过的版本", 409);
      await db.query("update prompt_runtime_versions set status='superseded' where prompt_id=$1 and status='published'", [id]);
      await db.query("update prompt_runtime_versions set status='published',updated_at=now() where id=$1", [versionId]);
      await db.query("insert into prompt_runtime_active(prompt_id,version_id) values($1,$2) on conflict(prompt_id) do update set version_id=excluded.version_id", [id, versionId]);
      return { ...versionFromRow(result.rows[0]), status: "published" as const };
    });
  }

  async disable(id: string) {
    editable(id);
    if (!this.pool) {
      const activeId = this.activeMemory.get(id);
      if (!activeId) throw new PromptRuntimeError("当前已使用代码默认版本", 409);
      const row = (this.memory.get(id) ?? []).find((item) => item.id === activeId);
      if (row) row.status = "superseded";
      this.activeMemory.delete(id); return { defaultRestored: true };
    }
    return withTransaction(this.pool, async (db) => {
      await db.query("select pg_advisory_xact_lock(hashtext($1))", [id]);
      const result = await db.query("delete from prompt_runtime_active where prompt_id=$1", [id]);
      if (!result.rowCount) throw new PromptRuntimeError("当前已使用代码默认版本", 409);
      await db.query("update prompt_runtime_versions set status='superseded' where prompt_id=$1 and status='published'", [id]);
      return { defaultRestored: true };
    });
  }
}

const runSnapshots = new WeakMap<object, PublishedSnapshot>();
export function pinPromptRuntimeSnapshot(run: object, snapshot: PublishedSnapshot) { runSnapshots.set(run, snapshot); }
export function getPinnedPromptRuntimeSnapshot(run: object): PublishedSnapshot { return runSnapshots.get(run) ?? {}; }

let singleton: PromptRuntimeStore | null = null;
export function getPromptRuntimeStore() { return singleton ??= new PromptRuntimeStore(); }

export function applyPublishedInstructions(content: string, snapshot: PublishedSnapshot): string {
  const item = findPromptForMessage(content);
  const version = item && snapshot[item.id];
  return version && content.includes(item.match) ? content.replace(item.match, version.content) : content;
}

export function withPinnedPrompts(transport: LlmTransport, snapshot: PublishedSnapshot): LlmTransport {
  return {
    async *streamChatCompletion(input) {
      const messages: ChatMessage[] = input.messages.map((message) =>
        (message.role === "user" || message.role === "system") && typeof message.content === "string"
          ? { ...message, content: applyPublishedInstructions(message.content, snapshot) }
          : message);
      yield* transport.streamChatCompletion({ ...input, messages });
    },
  };
}
