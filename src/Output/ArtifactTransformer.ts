import { RenderArtifact } from '../Graph/Renderer.js';

export type ArtifactTransformInput = {
  artifact: RenderArtifact;
};

export interface ArtifactTransformer {
  transform(input: ArtifactTransformInput): Promise<RenderArtifact>;
}
