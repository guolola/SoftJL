// Shares cancellable run reads across lineage mounts, with a global four-request ceiling.
import { platformApi, type PlatformRunSummary } from '../../user-platform/services/platform-api';
import type { LineageRunDetail } from '../lib/lineage-generation';
type Loader = (projectId: string, runId: string, signal: AbortSignal) => Promise<LineageRunDetail>;
type Pending = { controller: AbortController; promise: Promise<LineageRunDetail>; consumers: number };
export class LineageRunCache {
  private cache = new Map<string, { revision: string; value: LineageRunDetail }>();
  private pending = new Map<string, Pending>();
  private queue: (() => void)[] = [];
  private active = 0;
  constructor(private readonly loader: Loader, private readonly limit = 4) {}
  private async schedule<T>(signal: AbortSignal, action: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve, reject) => {
      const resume = () => { signal.removeEventListener('abort', cancel); this.active++; resolve(); };
      const cancel = () => { this.queue = this.queue.filter(item => item !== resume); reject(new DOMException('Cancelled', 'AbortError')); };
      this.queue.push(resume);
      signal.addEventListener('abort', cancel, { once: true });
    }); else this.active++;
    try { signal.throwIfAborted(); return await action(); }
    finally { this.active--; this.queue.shift()?.(); }
  }
  read(projectId: string, run: PlatformRunSummary, signal: AbortSignal): Promise<LineageRunDetail> {
    if (signal.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
    const key = `${projectId}\0${run.runId}`;
    const revision = JSON.stringify([run.status, run.updatedAt, run.completedAt, run.documentVersion, run.snapshotAvailable]);
    const cached = this.cache.get(key);
    if (run.status !== 'running' && run.status !== 'queued' && cached?.revision === revision) return Promise.resolve(cached.value);
    let entry = this.pending.get(key);
    if (entry?.controller.signal.aborted) { this.pending.delete(key); entry = undefined; }
    if (!entry) {
      const controller = new AbortController();
      const created: Pending = { controller, consumers: 0, promise: Promise.resolve({ run }) };
      created.promise = this.schedule(controller.signal, () => this.loader(projectId, run.runId, controller.signal)).then(value => {
        if (!controller.signal.aborted) {
          this.cache.delete(key);
          this.cache.set(key, { revision, value });
          if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value!);
        }
        return value;
      }).finally(() => { if (this.pending.get(key) === created) this.pending.delete(key); });
      this.pending.set(key, created);
      entry = created;
    }
    const current = entry;
    current.consumers++;
    // A departing view releases its lease; another view's shared read can finish normally.
    return new Promise((resolve, reject) => {
      let settled = false;
      const release = () => { if (settled) return false; settled = true; signal.removeEventListener('abort', cancel); current.consumers--; if (!current.consumers) current.controller.abort(); return true; };
      const cancel = () => { if (release()) reject(new DOMException('Cancelled', 'AbortError')); };
      signal.addEventListener('abort', cancel, { once: true });
      current.promise.then(value => { if (release()) resolve(value); }, error => { if (release()) reject(error); });
    });
  }
}
export const lineageRunCache = new LineageRunCache((projectId, runId, signal) => platformApi.getProjectRun(projectId, runId, { includeEvents: true, signal }));
