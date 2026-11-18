import { RenderArtifact } from '../Graph/Renderer.js';

export type ArtifactWriteInput = {
  artifact: RenderArtifact;
  target?: string;
};

export interface ArtifactWriter<
  TInput extends ArtifactWriteInput = ArtifactWriteInput,
> {
  write(input: TInput): Promise<void>;
}
