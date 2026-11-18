import { once } from 'node:events';
import { ArtifactWriteInput, ArtifactWriter } from '../ArtifactWriter.js';

export class StdoutArtifactWriter implements ArtifactWriter {
  constructor(
    private readonly stream: NodeJS.WritableStream = process.stdout,
  ) {}

  public async write(input: ArtifactWriteInput): Promise<void> {
    const wasWritten = this.stream.write(input.artifact.content);
    if (!wasWritten) {
      await once(this.stream, 'drain');
    }
  }
}
