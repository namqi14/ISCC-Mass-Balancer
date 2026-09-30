/**
 * A small cache abstraction. Call sites never know which backend is
 * active: an `ioredis`-backed one when `REDIS_URL` is set, or an
 * `lru-cache`-backed in-memory one (today's actual state, since this
 * environment has no Redis server installed) when it isn't.
 *
 * Documented tradeoff under clustering (item 8): the in-memory backend is
 * per-worker-process, so a write handled by one worker only invalidates
 * its own copy -- other workers can serve a stale value for up to the TTL
 * window until `REDIS_URL` actually points at a real shared instance. The
 * explicit invalidation calls (see dashboard.routes.ts's callers) make this
 * a non-issue for whichever worker handled the write; the short TTL below
 * is a safety net for the others, not the primary invalidation mechanism.
 */

import { LRUCache } from "lru-cache";
import Redis from "ioredis";

export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}

class InMemoryCache implements Cache {
  private store = new LRUCache<string, string>({ max: 500 });

  async get<T>(key: string): Promise<T | undefined> {
    const raw = this.store.get(key);
    return raw === undefined ? undefined : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.store.set(key, JSON.stringify(value), { ttl: ttlMs });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

class RedisCache implements Cache {
  private client: Redis;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl);
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), "PX", ttlMs);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }
}

let instance: Cache | null = null;

/** Lazily constructs the singleton cache instance on first use, honestly
 * noted: the Redis-backed path is written correctly against ioredis's real
 * API but is untested in this environment, since no Redis server exists
 * here to test it against. */
export function getCache(): Cache {
  if (!instance) {
    const redisUrl = process.env.REDIS_URL;
    instance = redisUrl ? new RedisCache(redisUrl) : new InMemoryCache();
  }
  return instance;
}
