import {
  RuntimeConfigDocument,
  RuntimeConfigSource,
} from '../RuntimeConfigSource.js';

export class InMemoryRuntimeConfigSource implements RuntimeConfigSource {
  constructor(
    private readonly content: string,
    private readonly format = 'json',
    private readonly reference = 'in-memory',
  ) {}

  public async read(): Promise<RuntimeConfigDocument> {
    return {
      content: this.content,
      format: this.format,
      reference: this.reference,
    };
  }
}
