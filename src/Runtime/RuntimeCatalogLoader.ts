import { Profile, SerializedProfile } from '../Graph/Profile.js';
import { ProfileRegistry } from '../Graph/ProfileRegistry.js';
import { NamedRuleRegistry } from '../Graph/Rules/NamedRuleRegistry.js';
import { NamedRuleSetRegistry } from '../Graph/Rules/NamedRuleSetRegistry.js';
import { SerializedRule } from '../Graph/Rules/RuleConfig.js';
import { SerializedRuleSet } from '../Graph/Rules/RuleSet.js';
import { SupportedAdapterOperationsRegistry } from '../Graph/Serialization/Registry.js';
import { RuntimeCatalog, RuntimeCatalogProvider } from './RuntimeCatalog.js';

export type SerializedRuntimeProfile<
  TOptions extends Record<string, unknown> = Record<string, unknown>,
> = Omit<SerializedProfile<TOptions>, 'name' | 'usesProfiles'> & {
  usesProfiles?: string[];
};

export type SerializedRuntimeConfig<
  TOptions extends Record<string, unknown> = Record<string, unknown>,
> = {
  providers?: string[];
  namedRules?: Record<string, SerializedRule>;
  namedRuleSets?: Record<string, SerializedRuleSet>;
  profiles?: Record<string, SerializedRuntimeProfile<TOptions>>;
  run?: {
    profile: string;
    outputs?: Array<{
      renderer?: string;
      options?: TOptions;
      transformers?: string[];
      outWriter?: 'stdout' | 'file';
      outFile?: string;
    }>;
  };
};

export type RuntimeCatalogLoaderInput<
  TOptions extends Record<string, unknown> = Record<string, unknown>,
> = {
  providers?: RuntimeCatalogProvider[];
  config?: SerializedRuntimeConfig<TOptions>;
  supportedAdapterOperationsRegistry?: SupportedAdapterOperationsRegistry;
};

export class RuntimeCatalogLoader<
  TOptions extends Record<string, unknown> = Record<string, unknown>,
> {
  constructor(
    private readonly input: RuntimeCatalogLoaderInput<TOptions> = {},
  ) {}

  public load(config = this.input.config): RuntimeCatalog {
    return RuntimeCatalogLoader.load<TOptions>({
      ...this.input,
      config,
    });
  }

  public fromSerialized(
    config: SerializedRuntimeConfig<TOptions>,
  ): RuntimeCatalog {
    return RuntimeCatalogLoader.fromSerialized<TOptions>(
      config,
      this.input.supportedAdapterOperationsRegistry,
    );
  }

  public static fromSerialized<
    TOptions extends Record<string, unknown> = Record<string, unknown>,
  >(
    config: SerializedRuntimeConfig<TOptions>,
    supportedAdapterOperationsRegistry?: SupportedAdapterOperationsRegistry,
    externalProfiles?: ProfileRegistry,
  ): RuntimeCatalog {
    return new RuntimeCatalog({
      namedRules: new NamedRuleRegistry(config.namedRules ?? {}),
      namedRuleSets: new NamedRuleSetRegistry(config.namedRuleSets ?? {}),
      profiles: RuntimeCatalogLoader.resolveProfilesFromSerialized(
        config.profiles ?? {},
        supportedAdapterOperationsRegistry,
        externalProfiles,
      ),
    });
  }

  public static load<
    TOptions extends Record<string, unknown> = Record<string, unknown>,
  >(input: RuntimeCatalogLoaderInput<TOptions> = {}): RuntimeCatalog {
    const providerCatalog = RuntimeCatalog.from(input.providers ?? []);

    if (!input.config) {
      return providerCatalog;
    }

    return RuntimeCatalog.from([
      providerCatalog,
      RuntimeCatalogLoader.fromSerialized(
        input.config,
        input.supportedAdapterOperationsRegistry,
        providerCatalog.profiles,
      ),
    ]);
  }

  private static resolveProfilesFromSerialized<
    TOptions extends Record<string, unknown> = Record<string, unknown>,
  >(
    profiles: Record<string, SerializedRuntimeProfile<TOptions>>,
    supportedAdapterOperationsRegistry?: SupportedAdapterOperationsRegistry,
    externalProfiles?: ProfileRegistry,
  ): ProfileRegistry {
    const externalNames = new Set(externalProfiles?.names() ?? []);
    const externalSerialized = new Map<
      string,
      SerializedProfile<Record<string, unknown>>
    >();
    const definitions = new Map<
      string,
      {
        profile: SerializedProfile<TOptions>;
        usesProfiles: string[];
      }
    >();

    for (const [name, profile] of Object.entries(profiles)) {
      definitions.set(name, {
        profile: {
          name,
          supports: profile.supports,
          render: profile.render,
          phases: profile.phases,
          plugins: profile.plugins,
        },
        usesProfiles: [...(profile.usesProfiles ?? [])],
      });
    }

    const resolved = new Map<string, SerializedProfile<TOptions>>();
    const resolve = (
      name: string,
      stack: string[] = [],
    ): SerializedProfile<TOptions> => {
      const existing = resolved.get(name);
      if (existing) {
        return existing;
      }

      if (stack.includes(name)) {
        throw new Error(
          `Runtime config profile inheritance cycle detected: ${[...stack, name].join(' -> ')}`,
        );
      }

      const definition = definitions.get(name);
      if (!definition) {
        throw new Error(`Runtime config profile '${name}' is not defined`);
      }

      const usedProfiles = definition.usesProfiles.map((used) => {
        if (!definitions.has(used)) {
          if (externalNames.has(used)) {
            const cached = externalSerialized.get(used);
            if (cached) {
              return RuntimeCatalogLoader.coerceSerializedProfile<TOptions>(
                cached,
              );
            }
            const externalProfile = externalProfiles?.resolve(used);
            if (externalProfile) {
              const serialized = externalProfile.serialize();
              externalSerialized.set(used, serialized);
              return RuntimeCatalogLoader.coerceSerializedProfile<TOptions>(
                serialized,
              );
            }
          }
          throw new Error(
            `Runtime config profile '${name}' uses unknown profile '${used}'`,
          );
        }
        return resolve(used, [...stack, name]);
      });

      const profile = {
        ...definition.profile,
        usesProfiles: usedProfiles,
      };
      resolved.set(name, profile);
      return profile;
    };

    for (const name of definitions.keys()) {
      resolve(name);
    }

    return new ProfileRegistry(
      Object.fromEntries(
        [...resolved.entries()].map(([name, profile]) => [
          name,
          () => Profile.deseriaize(profile, supportedAdapterOperationsRegistry),
        ]),
      ),
    );
  }

  private static coerceSerializedProfile<
    TOptions extends Record<string, unknown> = Record<string, unknown>,
  >(
    profile: SerializedProfile<Record<string, unknown>>,
  ): SerializedProfile<TOptions> {
    return profile as SerializedProfile<TOptions>;
  }
}
