import { Queue } from './Queue.js';

describe('Queue.shift', () => {
  it('shoud preserve FIFO order through compaction and subsequent reuse', () => {
    const queue = new Queue<number>();
    for (let value = 0; value < 4096; value += 1) queue.push(value);
    for (let value = 0; value < 3000; value += 1) {
      expect(queue.shift()).toBe(value);
    }
    for (let value = 4096; value < 6000; value += 1) queue.push(value);
    expect(queue.length).toBe(3000);
    for (let value = 3000; value < 6000; value += 1) {
      expect(queue.shift()).toBe(value);
    }
    expect(queue.length).toBe(0);
    expect(queue.shift()).toBeUndefined();
    queue.push(42);
    expect(queue.shift()).toBe(42);
    expect(queue.length).toBe(0);
  });
});
