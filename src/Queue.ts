export class Queue<T> {
  private items: Array<T | undefined> = [];
  private head = 0;

  public get length(): number {
    return this.items.length - this.head;
  }

  public push(item: T): void {
    this.items.push(item);
  }

  public shift(): T | undefined {
    if (this.length === 0) {
      return undefined;
    }
    const item = this.items[this.head];
    this.items[this.head] = undefined;
    this.head += 1;
    if (this.head >= 1024 && this.head * 2 >= this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return item;
  }
}
