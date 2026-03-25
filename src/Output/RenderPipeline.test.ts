import { RenderArtifact } from '../Graph/Renderer.js';
import { ArtifactTransformer } from './ArtifactTransformer.js';
import { ArtifactWriteInput, ArtifactWriter } from './ArtifactWriter.js';
import { RenderPipeline } from './RenderPipeline.js';

class AppendSuffixTransformer implements ArtifactTransformer {
  constructor(private readonly suffix: string) {}

  public async transform(input: { artifact: RenderArtifact }) {
    if (typeof input.artifact.content !== 'string') {
      throw new Error('Expected text artifact');
    }

    return {
      ...input.artifact,
      content: `${input.artifact.content}${this.suffix}`,
    };
  }
}

class CaptureWriter implements ArtifactWriter {
  public lastInput?: ArtifactWriteInput;

  public async write(input: ArtifactWriteInput): Promise<void> {
    this.lastInput = input;
  }
}

describe('RenderPipeline.execute', () => {
  it('shoud apply transformers in order and pass the final artifact to writer', async () => {
    const pipeline = new RenderPipeline();
    const writer = new CaptureWriter();

    const result = await pipeline.execute({
      artifact: {
        content: 'base',
        mediaType: 'text/plain',
      },
      transformers: [
        new AppendSuffixTransformer('-one'),
        new AppendSuffixTransformer('-two'),
      ],
      writer,
      write: {
        target: '/tmp/out.txt',
      },
    });

    expect(result).toEqual({
      content: 'base-one-two',
      mediaType: 'text/plain',
    });
    expect(writer.lastInput).toEqual({
      target: '/tmp/out.txt',
      artifact: {
        content: 'base-one-two',
        mediaType: 'text/plain',
      },
    });
  });

  it('shoud write the original artifact when no transformers are provided', async () => {
    const pipeline = new RenderPipeline();
    const writer = new CaptureWriter();

    const result = await pipeline.execute({
      artifact: {
        content: 'base',
        mediaType: 'text/plain',
      },
      writer,
      write: {
        target: '/tmp/out.txt',
      },
    });

    expect(result).toEqual({
      content: 'base',
      mediaType: 'text/plain',
    });
    expect(writer.lastInput).toEqual({
      target: '/tmp/out.txt',
      artifact: {
        content: 'base',
        mediaType: 'text/plain',
      },
    });
  });
});
