import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileRuntimeConfigSource } from './FileRuntimeConfigSource.js';

describe('FileRuntimeConfigSource.read', () => {
  it('shoud infer format from file extension when format is omitted', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runtime-config-source-file-'));
    const filePath = join(dir, 'runtime.json');
    await writeFile(filePath, '{"profiles":{}}', 'utf8');

    try {
      const source = new FileRuntimeConfigSource(filePath);

      await expect(source.read()).resolves.toEqual({
        content: '{"profiles":{}}',
        format: 'json',
        reference: filePath,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shoud prefer explicit format over inferred extension format', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runtime-config-source-file-'));
    const filePath = join(dir, 'runtime.json');
    await writeFile(filePath, 'profiles: {}', 'utf8');

    try {
      const source = new FileRuntimeConfigSource(filePath, 'yaml');

      await expect(source.read()).resolves.toEqual({
        content: 'profiles: {}',
        format: 'yaml',
        reference: filePath,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
