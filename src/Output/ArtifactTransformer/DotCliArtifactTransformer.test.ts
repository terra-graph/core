import { EventEmitter } from 'node:events';
import { RenderArtifact } from '../../Graph/Renderer.js';
import {
  DotCliArtifactTransformer,
  DotCliRunProcess,
  DotCliRunProcessInput,
} from './DotCliArtifactTransformer.js';

const spawnMock = jest.fn();
jest.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

const buildChild = () => {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { end: (input?: string) => void };
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { end: jest.fn() };
  return child;
};

describe('DotCliArtifactTransformer.transform', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('shoud transform dot text to the requested format', async () => {
    const calls: DotCliRunProcessInput[] = [];
    const transformer = new DotCliArtifactTransformer({
      format: 'png',
      dotArgs: ['-Gdpi=200'],
      runProcess: async (input) => {
        calls.push(input);
        return Buffer.from([1, 2, 3]);
      },
    });

    const artifact = await transformer.transform({
      artifact: {
        content: 'digraph G {}',
        mediaType: 'text/vnd.graphviz',
        extension: 'dot',
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      executable: 'dot',
      args: ['-Tpng', '-Gdpi=200'],
      stdin: 'digraph G {}',
    });
    expect(artifact.mediaType).toBe('image/png');
    expect(artifact.extension).toBe('png');
    expect(Buffer.from(artifact.content)).toEqual(Buffer.from([1, 2, 3]));
  });

  it('shoud reject artifacts that are not dot', async () => {
    const transformer = new DotCliArtifactTransformer({
      format: 'svg',
      runProcess: async () => Buffer.from([]),
    });

    const input: RenderArtifact = {
      content: '{"ok":true}',
      mediaType: 'application/json',
      extension: 'json',
    };

    await expect(
      transformer.transform({
        artifact: input,
      }),
    ).rejects.toThrow(
      "DotCliArtifactTransformer can only transform DOT artifacts ('text/vnd.graphviz' or extension 'dot')",
    );
  });

  it('shoud add context when dot process execution fails', async () => {
    const transformer = new DotCliArtifactTransformer({
      format: 'svg',
      runProcess: async () => {
        throw new Error('boom');
      },
    });

    await expect(
      transformer.transform({
        artifact: {
          content: 'digraph G {}',
          mediaType: 'text/vnd.graphviz',
          extension: 'dot',
        },
      }),
    ).rejects.toThrow(
      "DotCliArtifactTransformer failed for format 'svg': boom",
    );
  });

  it('shoud accept dot artifacts by extension and decode binary content', async () => {
    const calls: DotCliRunProcessInput[] = [];
    const transformer = new DotCliArtifactTransformer({
      format: 'svg',
      runProcess: async (input) => {
        calls.push(input);
        return Buffer.from([9, 8, 7]);
      },
    });

    const artifact = await transformer.transform({
      artifact: {
        content: Buffer.from('digraph G {}'),
        mediaType: 'text/plain',
        extension: 'dot',
      },
    });

    expect(calls[0]).toEqual({
      executable: 'dot',
      args: ['-Tsvg'],
      stdin: 'digraph G {}',
    });
    expect(artifact.mediaType).toBe('image/svg+xml');
  });

  it('shoud add context when dot process throws a non-error value', async () => {
    const transformer = new DotCliArtifactTransformer({
      format: 'svg',
      runProcess: async () => {
        throw 'boom';
      },
    });

    await expect(
      transformer.transform({
        artifact: {
          content: 'digraph G {}',
          mediaType: 'text/vnd.graphviz',
          extension: 'dot',
        },
      }),
    ).rejects.toThrow(
      "DotCliArtifactTransformer failed for format 'svg': boom",
    );
  });

  it('shoud fall back to octet-stream when format is unknown', async () => {
    const transformer = new DotCliArtifactTransformer({
      format: 'eps',
      runProcess: async () => Buffer.from([1, 2]),
    });

    const artifact = await transformer.transform({
      artifact: {
        content: 'digraph G {}',
        mediaType: 'text/vnd.graphviz',
        extension: 'dot',
      },
    });

    expect(artifact.mediaType).toBe('application/octet-stream');
  });
});

describe('DotCliArtifactTransformer.defaultRunProcess', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('shoud resolve stdout when the process succeeds', async () => {
    const transformer = new DotCliArtifactTransformer({ format: 'svg' });
    const runProcess = (
      transformer as unknown as {
        defaultRunProcess: DotCliRunProcess;
      }
    ).defaultRunProcess;

    spawnMock.mockImplementation(() => {
      const child = buildChild();
      process.nextTick(() => {
        child.stdout.emit('data', Buffer.from('ok'));
        child.emit('close', 0);
      });
      return child;
    });

    const output = await runProcess({
      executable: 'dot',
      args: ['-Tsvg'],
      stdin: 'digraph G {}',
    });

    expect(Buffer.from(output).toString('utf8')).toBe('ok');
  });

  it('shoud reject with stderr when the process exits non-zero', async () => {
    const transformer = new DotCliArtifactTransformer({ format: 'svg' });
    const runProcess = (
      transformer as unknown as {
        defaultRunProcess: DotCliRunProcess;
      }
    ).defaultRunProcess;

    spawnMock.mockImplementation(() => {
      const child = buildChild();
      process.nextTick(() => {
        child.stderr.emit('data', Buffer.from('failure'));
        child.emit('close', 2);
      });
      return child;
    });

    await expect(
      runProcess({
        executable: 'dot',
        args: ['-Tsvg'],
        stdin: 'digraph G {}',
      }),
    ).rejects.toThrow('dot exited with code 2: failure');
  });

  it('shoud include no stderr output when the process exits non-zero', async () => {
    const transformer = new DotCliArtifactTransformer({ format: 'svg' });
    const runProcess = (
      transformer as unknown as {
        defaultRunProcess: DotCliRunProcess;
      }
    ).defaultRunProcess;

    spawnMock.mockImplementation(() => {
      const child = buildChild();
      process.nextTick(() => {
        child.emit('close', 3);
      });
      return child;
    });

    await expect(
      runProcess({
        executable: 'dot',
        args: ['-Tsvg'],
        stdin: 'digraph G {}',
      }),
    ).rejects.toThrow('dot exited with code 3');
  });

  it('shoud reject when the process emits an error', async () => {
    const transformer = new DotCliArtifactTransformer({ format: 'svg' });
    const runProcess = (
      transformer as unknown as {
        defaultRunProcess: DotCliRunProcess;
      }
    ).defaultRunProcess;

    spawnMock.mockImplementation(() => {
      const child = buildChild();
      process.nextTick(() => {
        child.emit('error', new Error('spawn failed'));
      });
      return child;
    });

    await expect(
      runProcess({
        executable: 'dot',
        args: ['-Tsvg'],
        stdin: 'digraph G {}',
      }),
    ).rejects.toThrow('spawn failed');
  });
});
