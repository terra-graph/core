import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ArtifactWriteInput, ArtifactWriter } from '../ArtifactWriter.js';

export type FileArtifactWriterOptions = {
  createDirectories?: boolean;
};

export class FileArtifactWriter implements ArtifactWriter {
  private readonly createDirectories: boolean;

  constructor(options: FileArtifactWriterOptions = {}) {
    this.createDirectories = options.createDirectories ?? true;
  }

  public async write(input: ArtifactWriteInput): Promise<void> {
    if (!input.target) {
      throw new Error('FileArtifactWriter requires a target path');
    }

    if (this.createDirectories) {
      await mkdir(dirname(input.target), { recursive: true });
    }

    if (typeof input.artifact.content === 'string') {
      await writeFile(input.target, input.artifact.content, 'utf8');
      return;
    }

    await writeFile(input.target, Buffer.from(input.artifact.content));
  }
}
