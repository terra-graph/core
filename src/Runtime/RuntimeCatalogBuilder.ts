import { SupportedAdapterOperationsRegistry } from '../Graph/Serialization/Registry.js';
import { RuntimeCatalog, RuntimeCatalogProvider } from './RuntimeCatalog.js';
import { SerializedRuntimeConfig } from './RuntimeCatalogLoader.js';

export type RuntimeCatalogBuildInput<
  TOptions extends Record<string, unknown> = Record<string, unknown>,
> = {
  providers?: RuntimeCatalogProvider[];
  config: SerializedRuntimeConfig<TOptions>;
  supportedAdapterOperationsRegistry?: SupportedAdapterOperationsRegistry;
};

export interface RuntimeCatalogBuilder<
  TOptions extends Record<string, unknown> = Record<string, unknown>,
> {
  build(input: RuntimeCatalogBuildInput<TOptions>): RuntimeCatalog;
}
