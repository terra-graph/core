import { InMemoryRuntimeConfigSource } from './InMemoryRuntimeConfigSource.js';

describe('InMemoryRuntimeConfigSource.read', () => {
  it('shoud return default metadata when optional constructor args are omitted', async () => {
    const source = new InMemoryRuntimeConfigSource('{}');

    await expect(source.read()).resolves.toEqual({
      content: '{}',
      format: 'json',
      reference: 'in-memory',
    });
  });

  it('shoud return provided format and reference metadata', async () => {
    const source = new InMemoryRuntimeConfigSource(
      '{}',
      'yaml',
      'memory://cfg',
    );

    await expect(source.read()).resolves.toEqual({
      content: '{}',
      format: 'yaml',
      reference: 'memory://cfg',
    });
  });
});
