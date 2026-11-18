import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ArtifactWriteInput, ArtifactWriter } from '../ArtifactWriter.js';

export type FileArtifactWriterOptions = {
  createDirectories?: boolean;
  target?: string;
};

export class FileArtifactWriter implements ArtifactWriter {
  private readonly createDirectories: boolean;
  private readonly target?: string;

  constructor(options: FileArtifactWriterOptions = {}) {
    this.createDirectories = options.createDirectories ?? true;
    this.target = options.target;
  }

  public async write(input: ArtifactWriteInput): Promise<void> {
    const target = input.target ?? this.target;
    if (!target) {
      throw new Error('FileArtifactWriter requires a target path');
    }

    if (this.createDirectories) {
      await mkdir(dirname(target), { recursive: true });
    }

    if (typeof input.artifact.content === 'string') {
      await writeFile(target, input.artifact.content, 'utf8');
      return;
    }

    await writeFile(target, Buffer.from(input.artifact.content));
  }
}
