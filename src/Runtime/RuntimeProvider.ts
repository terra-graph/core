import { SupportedAdapterOperationsRegistry } from '../Graph/Serialization/Registry.js';
import { RuntimeCatalogProvider } from './RuntimeCatalog.js';

export type RuntimeProvider = RuntimeCatalogProvider & {
  supportedAdapterOperationsRegistry?: SupportedAdapterOperationsRegistry;
};
