import { readFile } from 'node:fs/promises';
import {
  RuntimeConfigDocument,
  RuntimeConfigSource,
  inferRuntimeConfigFormatFromReference,
} from '../RuntimeConfigSource.js';

export class FileRuntimeConfigSource implements RuntimeConfigSource {
  constructor(
    public readonly filePath: string,
    private readonly format?: string,
  ) {}

  public async read(): Promise<RuntimeConfigDocument> {
    return {
      content: await readFile(this.filePath, 'utf8'),
      format:
        this.format ?? inferRuntimeConfigFormatFromReference(this.filePath),
      reference: this.filePath,
    };
  }
}
