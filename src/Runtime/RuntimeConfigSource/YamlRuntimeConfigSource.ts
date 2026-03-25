import {
  RuntimeConfigDocument,
  RuntimeConfigSource,
} from '../RuntimeConfigSource.js';

export class YamlRuntimeConfigSource implements RuntimeConfigSource {
  constructor(private readonly source: RuntimeConfigSource) {}

  public async read(): Promise<RuntimeConfigDocument> {
    const document = await this.source.read();
    return {
      ...document,
      format: 'yaml',
    };
  }
}
