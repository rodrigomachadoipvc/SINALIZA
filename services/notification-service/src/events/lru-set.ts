/**
 * Set with a size limit that forgets the least recently used entries. Holds the ids of processed
 * events so a message delivered twice sends only one email (idempotent consumer).
 */
export class LruSet {
  private readonly items = new Set<string>();

  constructor(private readonly capacity: number) {}

  has(key: string): boolean {
    if (!this.items.has(key)) return false;
    // Re-insert so the key becomes the most recent one.
    this.items.delete(key);
    this.items.add(key);
    return true;
  }

  add(key: string): void {
    this.items.delete(key);
    this.items.add(key);
    if (this.items.size > this.capacity) {
      const oldest = this.items.values().next().value;
      if (oldest !== undefined) this.items.delete(oldest);
    }
  }

  get size(): number {
    return this.items.size;
  }
}
