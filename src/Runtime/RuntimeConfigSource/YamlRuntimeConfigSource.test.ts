import {
  RuntimeConfigDocument,
  RuntimeConfigSource,
} from '../RuntimeConfigSource.js';
import { YamlRuntimeConfigSource } from './YamlRuntimeConfigSource.js';

class FakeRuntimeConfigSource implements RuntimeConfigSource {
  constructor(private readonly document: RuntimeConfigDocument) {}

  public async read(): Promise<RuntimeConfigDocument> {
    return this.document;
  }
}

describe('YamlRuntimeConfigSource.read', () => {
  it('shoud force the format to yaml while preserving content and reference', async () => {
    const source = new YamlRuntimeConfigSource(
      new FakeRuntimeConfigSource({
        content: 'profiles:\n  test: {}',
        format: 'json',
        reference: '/tmp/config.any',
      }),
    );

    await expect(source.read()).resolves.toEqual({
      content: 'profiles:\n  test: {}',
      format: 'yaml',
      reference: '/tmp/config.any',
    });
  });

  it('shoud set yaml format when source format is missing', async () => {
    const source = new YamlRuntimeConfigSource(
      new FakeRuntimeConfigSource({
        content: 'profiles:\n  test: {}',
        reference: 'memory://yaml',
      }),
    );

    await expect(source.read()).resolves.toEqual({
      content: 'profiles:\n  test: {}',
      format: 'yaml',
      reference: 'memory://yaml',
    });
  });
});
