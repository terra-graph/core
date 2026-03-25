import { RuntimeCatalog } from '../RuntimeCatalog.js';
import {
  RuntimeCatalogBuildInput,
  RuntimeCatalogBuilder,
} from '../RuntimeCatalogBuilder.js';
import { RuntimeCatalogLoader } from '../RuntimeCatalogLoader.js';

export class RuntimeCatalogFromConfigBuilder<
  TOptions extends Record<string, unknown> = Record<string, unknown>,
> implements RuntimeCatalogBuilder<TOptions>
{
  public build(input: RuntimeCatalogBuildInput<TOptions>): RuntimeCatalog {
    return RuntimeCatalogLoader.load(input);
  }
}
