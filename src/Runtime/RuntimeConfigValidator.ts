import { SerializedRuntimeConfig } from './RuntimeCatalogLoader.js';

export interface RuntimeConfigValidator<
  TOptions extends Record<string, unknown> = Record<string, unknown>,
> {
  validate(input: unknown): SerializedRuntimeConfig<TOptions>;
}
