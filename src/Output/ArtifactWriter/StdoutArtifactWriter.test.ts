import { Writable } from 'node:stream';
import { StdoutArtifactWriter } from './StdoutArtifactWriter.js';

class CaptureWritable extends Writable {
  public readonly chunks: Buffer[] = [];

  override _write(
    chunk: string | Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    if (typeof chunk === 'string') {
      this.chunks.push(Buffer.from(chunk));
    } else {
      this.chunks.push(chunk);
    }
    callback();
  }
}

class BackpressureWritable extends Writable {
  public drainCount = 0;

  override _write(
    _chunk: string | Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
  }

  override write(
    chunk: string | Buffer,
    callback?: (error?: Error | null) => void,
  ): boolean;
  override write(
    chunk: string | Buffer,
    encoding: BufferEncoding,
    callback?: (error?: Error | null) => void,
  ): boolean;
  override write(
    chunk: string | Buffer,
    encoding?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ): boolean {
    if (typeof encoding === 'function') {
      super.write(chunk, encoding);
    } else {
      super.write(chunk, encoding as BufferEncoding, callback);
    }
    setImmediate(() => {
      this.drainCount += 1;
      this.emit('drain');
    });
    return false;
  }
}

describe('StdoutArtifactWriter.write', () => {
  it('shoud write artifact content to the configured stream', async () => {
    const stream = new CaptureWritable();
    const writer = new StdoutArtifactWriter(stream);

    await writer.write({
      artifact: {
        content: 'digraph G {}',
        mediaType: 'text/vnd.graphviz',
      },
    });
    await writer.write({
      artifact: {
        content: Buffer.from([1, 2, 3]),
        mediaType: 'application/octet-stream',
      },
    });

    expect(Buffer.concat(stream.chunks)).toEqual(
      Buffer.concat([Buffer.from('digraph G {}'), Buffer.from([1, 2, 3])]),
    );
  });

  it('shoud wait for drain when backpressure is signaled', async () => {
    const stream = new BackpressureWritable();
    const writer = new StdoutArtifactWriter(stream);

    await writer.write({
      artifact: {
        content: 'digraph G {}',
        mediaType: 'text/vnd.graphviz',
      },
    });

    expect(stream.drainCount).toBeGreaterThan(0);
  });

  it('shoud default to process stdout when no stream is provided', async () => {
    const originalWrite = process.stdout.write.bind(process.stdout);
    const writeMock = jest.fn(() => true);
    process.stdout.write = writeMock as unknown as typeof process.stdout.write;
    const writer = new StdoutArtifactWriter();

    try {
      await writer.write({
        artifact: {
          content: 'digraph G {}',
          mediaType: 'text/vnd.graphviz',
        },
      });
    } finally {
      process.stdout.write = originalWrite;
    }

    expect(writeMock).toHaveBeenCalled();
  });
});
