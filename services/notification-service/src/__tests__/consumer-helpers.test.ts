import { describe, expect, it } from 'vitest';

import { loadConfig, parseDelays } from '../config.js';
import { LruSet } from '../events/lru-set.js';
import { retryQueue } from '../events/topology.js';

describe('LruSet', () => {
  it('forgets the least recently used key when full', () => {
    const set = new LruSet(2);
    set.add('a');
    set.add('b');
    expect(set.has('a')).toBe(true); // `a` becomes the most recent
    set.add('c'); // evicts `b`
    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(false);
    expect(set.has('c')).toBe(true);
    expect(set.size).toBe(2);
  });
});

describe('retry configuration', () => {
  it('parses the delays and names one queue per delay', () => {
    expect(parseDelays(undefined, [5000, 30000])).toEqual([5000, 30000]);
    expect(parseDelays(' 100, 2000 ', [])).toEqual([100, 2000]);
    expect(() => parseDelays('100,abc', [])).toThrow();
    expect(() => parseDelays('0', [])).toThrow();
    expect(retryQueue(5000)).toBe('notification.emails.retry.5000ms');
  });

  it('defaults to 3 attempts against the local Mailpit', () => {
    const config = loadConfig({ RABBITMQ_URL: 'amqp://x' });
    expect(config.retryDelaysMs).toHaveLength(2);
    expect(config.smtp).toEqual({
      host: 'localhost',
      port: 1025,
      secure: false,
      user: undefined,
      password: undefined,
    });
  });
});
