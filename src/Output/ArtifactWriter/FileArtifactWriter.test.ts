import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileArtifactWriter } from './FileArtifactWriter.js';

describe('FileArtifactWriter.write', () => {
  it('shoud write string content to target path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'file-artifact-writer-'));
    const target = join(dir, 'nested', 'graph.dot');
    const writer = new FileArtifactWriter();

    try {
      await writer.write({
        target,
        artifact: {
          content: 'digraph G {}',
          mediaType: 'text/vnd.graphviz',
          extension: 'dot',
        },
      });

      const written = await readFile(target, 'utf8');
      expect(written).toBe('digraph G {}');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shoud write binary content to target path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'file-artifact-writer-'));
    const target = join(dir, 'diagram.png');
    const writer = new FileArtifactWriter();

    try {
      await writer.write({
        target,
        artifact: {
          content: Buffer.from([10, 20, 30]),
          mediaType: 'image/png',
          extension: 'png',
        },
      });

      const written = await readFile(target);
      expect(written).toEqual(Buffer.from([10, 20, 30]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shoud fail when no target path is provided', async () => {
    const writer = new FileArtifactWriter();

    await expect(
      writer.write({
        artifact: {
          content: 'data',
          mediaType: 'text/plain',
        },
      }),
    ).rejects.toThrow('FileArtifactWriter requires a target path');
  });

  it('shoud skip directory creation when disabled', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'file-artifact-writer-'));
    const target = join(dir, 'graph.dot');
    const writer = new FileArtifactWriter({ createDirectories: false });

    try {
      await writer.write({
        target,
        artifact: {
          content: 'digraph G {}',
          mediaType: 'text/vnd.graphviz',
          extension: 'dot',
        },
      });

      const written = await readFile(target, 'utf8');
      expect(written).toBe('digraph G {}');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shoud use constructor target when write input omits it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'file-artifact-writer-'));
    const target = join(dir, 'graph.dot');
    const writer = new FileArtifactWriter({ target });

    try {
      await writer.write({
        artifact: {
          content: 'digraph G {}',
          mediaType: 'text/vnd.graphviz',
          extension: 'dot',
        },
      });

      const written = await readFile(target, 'utf8');
      expect(written).toBe('digraph G {}');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shoud prefer write input target over constructor target', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'file-artifact-writer-'));
    const fallbackTarget = join(dir, 'fallback.dot');
    const target = join(dir, 'preferred.dot');
    const writer = new FileArtifactWriter({ target: fallbackTarget });

    try {
      await writer.write({
        target,
        artifact: {
          content: 'digraph G {}',
          mediaType: 'text/vnd.graphviz',
          extension: 'dot',
        },
      });

      const written = await readFile(target, 'utf8');
      expect(written).toBe('digraph G {}');
      await expect(readFile(fallbackTarget, 'utf8')).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
