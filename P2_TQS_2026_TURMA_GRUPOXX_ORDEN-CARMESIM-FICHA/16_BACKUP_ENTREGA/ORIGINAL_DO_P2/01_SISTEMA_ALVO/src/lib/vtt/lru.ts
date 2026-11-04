/** Guarda os N itens usados por último; quem sai passa por `onEvict`. */
export class LruCache<T> {
  private items = new Map<string, T>();

  constructor(
    private capacity: number,
    private onEvict: (value: T, key: string) => void
  ) {}

  /** Retira sem chamar `onEvict`: quem pegou passa a cuidar do item. */
  take(key: string): T | undefined {
    const value = this.items.get(key);
    this.items.delete(key);
    return value;
  }

  set(key: string, value: T): void {
    this.items.delete(key);
    this.items.set(key, value);
    while (this.items.size > this.capacity) {
      const oldest = this.items.keys().next().value as string;
      const evicted = this.items.get(oldest) as T;
      this.items.delete(oldest);
      this.onEvict(evicted, oldest);
    }
  }

  clear(): void {
    this.items.forEach((value, key) => this.onEvict(value, key));
    this.items.clear();
  }

  get size(): number {
    return this.items.size;
  }
}
