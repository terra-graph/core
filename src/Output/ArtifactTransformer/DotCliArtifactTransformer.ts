import { spawn } from 'node:child_process';
import { RenderArtifact } from '../../Graph/Renderer.js';
import {
  ArtifactTransformInput,
  ArtifactTransformer,
} from '../ArtifactTransformer.js';

export type DotCliRunProcessInput = {
  executable: string;
  args: string[];
  stdin: string;
};

export type DotCliRunProcess = (
  input: DotCliRunProcessInput,
) => Promise<Uint8Array>;

export type DotCliArtifactTransformerOptions = {
  format: string;
  executable?: string;
  dotArgs?: string[];
  runProcess?: DotCliRunProcess;
};

const dotMediaTypeByFormat: Record<string, string> = {
  dot: 'text/vnd.graphviz',
  json: 'application/json',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
};

export class DotCliArtifactTransformer implements ArtifactTransformer {
  private readonly executable: string;
  private readonly runProcess: DotCliRunProcess;

  constructor(private readonly options: DotCliArtifactTransformerOptions) {
    this.executable = options.executable ?? 'dot';
    this.runProcess = options.runProcess ?? this.defaultRunProcess;
  }

  public async transform(
    input: ArtifactTransformInput,
  ): Promise<RenderArtifact> {
    if (!this.isDotArtifact(input.artifact)) {
      throw new Error(
        "DotCliArtifactTransformer can only transform DOT artifacts ('text/vnd.graphviz' or extension 'dot')",
      );
    }

    const args = [`-T${this.options.format}`, ...(this.options.dotArgs ?? [])];
    const stdin = this.toUtf8(input.artifact.content);

    let content: Uint8Array;
    try {
      content = await this.runProcess({
        executable: this.executable,
        args,
        stdin,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `DotCliArtifactTransformer failed for format '${this.options.format}': ${message}`,
      );
    }

    return {
      content,
      mediaType: DotCliArtifactTransformer.resolveMediaType(
        this.options.format,
      ),
      extension: this.options.format,
    };
  }

  private isDotArtifact(artifact: RenderArtifact): boolean {
    return (
      artifact.mediaType === 'text/vnd.graphviz' || artifact.extension === 'dot'
    );
  }

  private toUtf8(content: string | Uint8Array): string {
    if (typeof content === 'string') {
      return content;
    }

    return Buffer.from(content).toString('utf8');
  }

  private static resolveMediaType(format: string): string {
    return dotMediaTypeByFormat[format] ?? 'application/octet-stream';
  }

  private readonly defaultRunProcess: DotCliRunProcess = async (input) => {
    return await new Promise<Uint8Array>((resolve, reject) => {
      const child = spawn(input.executable, input.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      child.on('error', (error) => {
        reject(error);
      });
      child.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(stdoutChunks));
          return;
        }

        const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
        const output = stderr ? `: ${stderr}` : '';
        reject(new Error(`dot exited with code ${String(code)}${output}`));
      });

      child.stdin.end(input.stdin);
    });
  };
}
