import { MossClient } from '@inferedge/moss';
import { money } from '../src/lib/budget.js';

// Lila's memory: things the user told it (preferences, goals, places they like or avoid)
// plus their purchases, searchable by meaning. With MOSS_PROJECT_ID / MOSS_PROJECT_KEY it
// uses Moss (the index is loaded into memory, so lookups take milliseconds, which keeps
// voice replies snappy); without them, a simple word-overlap search stands in.
//
// The server keeps the canonical list of memories in its saved data; this module only
// keeps the search index in step with it.

const INDEX = 'lila-memory';

export const transactionDoc = t => ({
  id: `tx:${t.id}`,
  text: `Spent ${money(t.amountCents, true)} at ${t.merchant} (${t.category}) on ${t.date}`,
  metadata: { kind: 'transaction', category: t.category },
});
export const memoryDoc = m => ({ id: `mem:${m.id}`, text: m.text, metadata: { kind: 'memory' } });

const words = text => new Set(String(text).toLowerCase().match(/[a-z0-9$]+/g) || []);

// Fallback search: share of query words found in each document.
export function createLocalIndex() {
  const docs = new Map();
  return {
    kind: 'local',
    ready: Promise.resolve(),
    async upsert(list) { for (const d of list) docs.set(d.id, d); },
    async remove(ids) { for (const id of ids) docs.delete(id); },
    async search(query, topK = 4) {
      const q = words(query);
      if (!q.size) return [];
      return [...docs.values()]
        .map(d => { const w = words(d.text); let hits = 0; for (const x of q) if (w.has(x)) hits++; return { ...d, score: hits / q.size }; })
        .filter(d => d.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    },
  };
}

export function createMossIndex({ projectId, projectKey, client = new MossClient(projectId, projectKey), logger = console }) {
  // Creating or loading the index takes a few seconds; searches before that use a
  // local copy, so the agent never waits on it.
  const local = createLocalIndex();
  let loaded = false;
  const ready = (async () => {
    try {
      await client.getIndex(INDEX);
    } catch {
      // A new index needs at least one document.
      await client.createIndex(INDEX, [{ id: 'about', text: 'Lila is a budgeting assistant.', metadata: { kind: 'about' } }]);
    }
    await client.loadIndex(INDEX);
    loaded = true;
  })().catch(error => logger.warn('Moss unavailable, using local memory search:', error.message));

  // Mutations are queued so they apply in order; each reloads the in-memory index.
  let queue = ready;
  const mutate = fn => (queue = queue.then(fn).then(() => loaded && client.loadIndex(INDEX)).catch(error => logger.warn('Moss update failed:', error.message)));

  return {
    kind: 'moss',
    ready,
    async upsert(list) { await local.upsert(list); if (list.length) mutate(() => client.addDocs(INDEX, list, { upsert: true })); },
    async remove(ids) { await local.remove(ids); if (ids.length) mutate(() => client.deleteDocs(INDEX, ids)); },
    async search(query, topK = 4) {
      if (!loaded) return local.search(query, topK);
      try {
        const result = await client.query(INDEX, query, { topK: topK + 1 });
        return result.docs.filter(d => d.metadata?.kind !== 'about').slice(0, topK);
      } catch {
        return local.search(query, topK);
      }
    },
  };
}

export function createMemoryIndex({ env = process.env, logger = console } = {}) {
  return env.MOSS_PROJECT_ID && env.MOSS_PROJECT_KEY
    ? createMossIndex({ projectId: env.MOSS_PROJECT_ID, projectKey: env.MOSS_PROJECT_KEY, logger })
    : createLocalIndex();
}
