import { SupportedAdapterOperationsRegistry } from '../Graph/Serialization/Registry.js';
import { RuntimeCatalog } from './RuntimeCatalog.js';
import { RuntimeCatalogBuilder } from './RuntimeCatalogBuilder.js';
import { RuntimeCatalogFromConfigBuilder } from './RuntimeCatalogBuilder/RuntimeCatalogFromConfigBuilder.js';
import { SerializedRuntimeConfig } from './RuntimeCatalogLoader.js';
import { RuntimeConfigParserRegistry } from './RuntimeConfigParserRegistry.js';
import {
  RuntimeConfigSource,
  inferRuntimeConfigFormatFromReference,
} from './RuntimeConfigSource.js';
import { RuntimeConfigValidator } from './RuntimeConfigValidator.js';
import { ZodRuntimeConfigValidator } from './RuntimeConfigValidator/ZodRuntimeConfigValidator.js';
import { RuntimeProvider } from './RuntimeProvider.js';
import { RuntimeProviderLoader } from './RuntimeProviderLoader.js';
import { ModuleRuntimeProviderLoader } from './RuntimeProviderLoader/ModuleRuntimeProviderLoader.js';

export type RuntimeConfigLoadInput<
  TOptions extends Record<string, unknown> = Record<string, unknown>,
> = {
  source: RuntimeConfigSource;
};

export type RuntimeConfigLoadResult<
  TOptions extends Record<string, unknown> = Record<string, unknown>,
> = {
  catalog: RuntimeCatalog;
  config: SerializedRuntimeConfig<TOptions>;
};

export type RuntimeConfigLoaderDependencies<
  TOptions extends Record<string, unknown> = Record<string, unknown>,
> = {
  parserRegistry?: RuntimeConfigParserRegistry;
  validator?: RuntimeConfigValidator<TOptions>;
  catalogBuilder?: RuntimeCatalogBuilder<TOptions>;
  providerLoader?: RuntimeProviderLoader;
  baseProviders?: RuntimeProvider[];
};

export class RuntimeConfigLoader<
  TOptions extends Record<string, unknown> = Record<string, unknown>,
> {
  private readonly parserRegistry: RuntimeConfigParserRegistry;
  private readonly validator: RuntimeConfigValidator<TOptions>;
  private readonly catalogBuilder: RuntimeCatalogBuilder<TOptions>;
  private readonly providerLoader: RuntimeProviderLoader;
  private readonly baseProviders: readonly RuntimeProvider[];

  constructor(dependencies: RuntimeConfigLoaderDependencies<TOptions> = {}) {
    this.parserRegistry =
      dependencies.parserRegistry ?? RuntimeConfigParserRegistry.defaults();
    this.validator = dependencies.validator ?? new ZodRuntimeConfigValidator();
    this.catalogBuilder =
      dependencies.catalogBuilder ??
      new RuntimeCatalogFromConfigBuilder<TOptions>();
    this.providerLoader =
      dependencies.providerLoader ?? new ModuleRuntimeProviderLoader();
    this.baseProviders = Object.freeze([...(dependencies.baseProviders ?? [])]);
  }

  public async load(
    input: RuntimeConfigLoadInput<TOptions>,
  ): Promise<RuntimeConfigLoadResult<TOptions>> {
    const document = await input.source.read();
    const format =
      document.format ??
      inferRuntimeConfigFormatFromReference(document.reference);

    if (!format) {
      const from = document.reference ? ` from '${document.reference}'` : '';
      throw new Error(`Unable to determine runtime config format${from}`);
    }

    let parsed: unknown;
    try {
      parsed = this.parserRegistry.resolve(format).parse(document.content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to parse runtime config as '${format}': ${message}`,
      );
    }

    let config: SerializedRuntimeConfig<TOptions>;
    try {
      config = this.validator.validate(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Runtime config validation failed: ${message}`);
    }

    const loadedProviders = await this.loadProviders(
      config.providers ?? [],
      document.reference,
    );
    const providers = [...this.baseProviders, ...loadedProviders];
    const supportedAdapterOperationsRegistry =
      this.mergeSupportedAdapterOperationsRegistry([
        ...providers.map(
          (provider) => provider.supportedAdapterOperationsRegistry,
        ),
      ]);

    const catalog = this.catalogBuilder.build({
      providers,
      config,
      supportedAdapterOperationsRegistry,
    });

    return { catalog, config };
  }

  private async loadProviders(
    providerReferences: string[],
    sourceReference?: string,
  ): Promise<RuntimeProvider[]> {
    const uniqueSpecifiers = [...new Set(providerReferences)];
    const loadedProviders: RuntimeProvider[] = [];

    for (const specifier of uniqueSpecifiers) {
      try {
        loadedProviders.push(
          await this.providerLoader.load({
            specifier,
            sourceReference,
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to load runtime provider '${specifier}': ${message}`,
        );
      }
    }

    return loadedProviders;
  }

  private mergeSupportedAdapterOperationsRegistry(
    registries: Array<SupportedAdapterOperationsRegistry | undefined>,
  ): SupportedAdapterOperationsRegistry | undefined {
    const merged = registries.reduce<SupportedAdapterOperationsRegistry>(
      (acc, registry) => {
        if (!registry) {
          return acc;
        }
        return {
          // biome-ignore lint/performance/noAccumulatingSpread: <explanation>
          ...acc,
          ...registry,
        };
      },
      {},
    );

    return Object.keys(merged).length > 0 ? merged : undefined;
  }
}
