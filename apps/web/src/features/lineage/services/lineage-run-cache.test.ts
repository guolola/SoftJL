// Checks shared reads, bounded concurrency, cancellation, and revision-aware reuse.
import { describe, expect, it, vi } from 'vitest';
import { LineageRunCache } from './lineage-run-cache';
import type { LineageRunDetail } from '../lib/lineage-generation';
const run = (runId: string, status = 'completed') => ({ runId, status });
function deferred() { let resolve!: (value: LineageRunDetail) => void; const promise = new Promise<LineageRunDetail>(done => { resolve = done; }); return { promise, resolve }; }
describe('lineage run cache', () => {
  it('deduplicates within a project and keeps shared work alive for its remaining consumer', async () => {
    const pending = deferred(); let underlying!: AbortSignal;
    const loader = vi.fn((_project: string, _run: string, signal: AbortSignal) => { underlying = signal; return pending.promise; });
    const cache = new LineageRunCache(loader);
    const first = new AbortController(), second = new AbortController();
    const a = cache.read('one', run('run'), first.signal).catch(error => error.name);
    const b = cache.read('one', run('run'), second.signal);
    first.abort();
    expect(await a).toBe('AbortError'); expect(underlying.aborted).toBe(false); expect(loader).toHaveBeenCalledTimes(1);
    pending.resolve({ run: run('run') }); await b;
    await cache.read('one', run('run'), new AbortController().signal);
    expect(loader).toHaveBeenCalledTimes(1);
    await cache.read('two', run('run'), new AbortController().signal);
    expect(loader).toHaveBeenCalledTimes(2);
  });
  it('limits requests to four and removes queued and active reads when the view leaves', async () => {
    const pending = Array.from({ length: 8 }, deferred); const signals: AbortSignal[] = [];
    const loader = vi.fn((_project: string, id: string, signal: AbortSignal) => { signals.push(signal); return pending[Number(id)].promise; });
    const cache = new LineageRunCache(loader); const view = new AbortController();
    const results = Array.from({ length: 8 }, (_, index) => cache.read('one', run(String(index)), view.signal).catch(error => error.name));
    expect(loader).toHaveBeenCalledTimes(4);
    pending[0].resolve({ run: run('0') }); await results[0]; await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(5);
    view.abort();
    expect((await Promise.all(results)).slice(1)).toEqual(Array(7).fill('AbortError'));
    expect(signals.every(signal => signal.aborted)).toBe(true);
    for (let index = 1; index < 5; index++) pending[index].resolve({ run: run(String(index)) });
    await Promise.resolve(); expect(loader).toHaveBeenCalledTimes(5);
  });
  it('re-reads active snapshots and invalidates terminal runs when their revision changes', async () => {
    const loader = vi.fn(async (_project: string, id: string) => ({ run: run(id) }));
    const cache = new LineageRunCache(loader); const signal = new AbortController().signal;
    await cache.read('one', run('r', 'running'), signal); await cache.read('one', run('r', 'running'), signal);
    await cache.read('one', run('r'), signal); await cache.read('one', run('r'), signal);
    expect(loader).toHaveBeenCalledTimes(3);
    await cache.read('one', { ...run('r'), updatedAt: 'later' }, signal);
    expect(loader).toHaveBeenCalledTimes(4);
  });
  it('does not cache failures or abandoned reads and allows later retries', async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue({ run: run('r') });
    const cache = new LineageRunCache(loader); const signal = new AbortController().signal;
    await expect(cache.read('one', run('r'), signal)).rejects.toThrow('unavailable');
    await expect(cache.read('one', run('r'), signal)).resolves.toMatchObject({ run: run('r') });
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
