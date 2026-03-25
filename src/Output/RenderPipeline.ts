import { RenderArtifact } from '../Graph/Renderer.js';
import { ArtifactTransformer } from './ArtifactTransformer.js';
import { ArtifactWriteInput, ArtifactWriter } from './ArtifactWriter.js';

export type RenderPipelineExecuteInput<
  TWriteInput extends ArtifactWriteInput = ArtifactWriteInput,
> = {
  artifact: RenderArtifact;
  writer: ArtifactWriter<TWriteInput>;
  write: Omit<TWriteInput, 'artifact'>;
  transformers?: ArtifactTransformer[];
};

export class RenderPipeline {
  public async execute<
    TWriteInput extends ArtifactWriteInput = ArtifactWriteInput,
  >(input: RenderPipelineExecuteInput<TWriteInput>): Promise<RenderArtifact> {
    let artifact = input.artifact;
    for (const transformer of input.transformers ?? []) {
      artifact = await transformer.transform({ artifact });
    }

    await input.writer.write({
      ...input.write,
      artifact,
    } as TWriteInput);

    return artifact;
  }
}
