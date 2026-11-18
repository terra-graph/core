import { ArtifactTransformer } from './ArtifactTransformer.js';

export type ArtifactTransformerOptionValue = string | string[];

export type ArtifactTransformerOptions = Record<
  string,
  ArtifactTransformerOptionValue
>;

export type ArtifactTransformerFactoryInput = {
  name: string;
  options?: ArtifactTransformerOptions;
};

export interface ArtifactTransformerFactory {
  create(input: ArtifactTransformerFactoryInput): ArtifactTransformer;
}
