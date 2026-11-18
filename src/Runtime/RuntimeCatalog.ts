import { GraphPluginRegistry } from '../Graph/GraphPlugin.js';
import { AdapterOperations } from '../Graph/Operations/Operations.js';
import { Profile } from '../Graph/Profile.js';
import { ProfileRegistry } from '../Graph/ProfileRegistry.js';
import { Renderer } from '../Graph/Renderer.js';
import { RendererRegistry } from '../Graph/Renderers/RendererRegistry.js';
import { NamedRuleRegistry } from '../Graph/Rules/NamedRuleRegistry.js';
import { NamedRuleSetRegistry } from '../Graph/Rules/NamedRuleSetRegistry.js';
import { BaseRule } from '../Graph/Rules/Rule.js';
import { ArtifactWriter } from '../Output/ArtifactWriter.js';
import { WriterRegistry } from '../Output/Writers/WriterRegistry.js';

export type RuntimeCatalogProvider = {
  namedRules?: NamedRuleRegistry;
  namedRuleSets?: NamedRuleSetRegistry;
  profiles?: ProfileRegistry;
  plugins?: GraphPluginRegistry;
  renderers?: RendererRegistry;
  writers?: WriterRegistry;
};

export class RuntimeCatalog {
  public readonly namedRules: NamedRuleRegistry;
  public readonly namedRuleSets: NamedRuleSetRegistry;
  public readonly profiles: ProfileRegistry;
  public readonly plugins: GraphPluginRegistry;
  public readonly renderers: RendererRegistry;
  public readonly writers: WriterRegistry;

  constructor(input: RuntimeCatalogProvider = {}) {
    this.namedRules = input.namedRules ?? new NamedRuleRegistry();
    this.namedRuleSets = input.namedRuleSets ?? new NamedRuleSetRegistry();
    this.profiles = input.profiles ?? new ProfileRegistry();
    this.plugins = input.plugins ?? new GraphPluginRegistry();
    this.renderers = input.renderers ?? new RendererRegistry();
    this.writers = input.writers ?? new WriterRegistry();
  }

  public static from(providers: RuntimeCatalogProvider[]): RuntimeCatalog {
    return providers.reduce<RuntimeCatalog>(
      (combined, provider) => combined.use(provider),
      new RuntimeCatalog(),
    );
  }

  public use(provider: RuntimeCatalogProvider): RuntimeCatalog {
    return new RuntimeCatalog({
      namedRules: provider.namedRules
        ? this.namedRules.use(provider.namedRules)
        : this.namedRules,
      namedRuleSets: provider.namedRuleSets
        ? this.namedRuleSets.use(provider.namedRuleSets)
        : this.namedRuleSets,
      profiles: provider.profiles
        ? this.profiles.use(provider.profiles)
        : this.profiles,
      plugins: provider.plugins
        ? this.plugins.use(provider.plugins)
        : this.plugins,
      renderers: provider.renderers
        ? this.renderers.use(provider.renderers)
        : this.renderers,
      writers: provider.writers
        ? this.writers.use(provider.writers)
        : this.writers,
    });
  }

  public resolveProfile(name: string): Profile {
    return this.profiles.resolve(name);
  }

  public resolveProfilePhases(name: string): BaseRule[][] {
    return this.resolveProfile(name).resolvePhases(
      this.namedRules,
      this.namedRuleSets,
      this.plugins,
    );
  }

  public resolveProfileRendererOptions<TOptions = Record<string, unknown>>(
    name: string,
  ): TOptions | undefined {
    return this.resolveProfile(name).resolveRendererOptions() as
      | TOptions
      | undefined;
  }

  public resolveProfileRenderer(name: string): string | undefined {
    return this.resolveProfile(name).resolveRenderer();
  }

  public resolveProfileMetadata(name: string) {
    return this.resolveProfile(name).resolveMetadata();
  }

  public resolveRenderer(
    name: string,
    adapter: AdapterOperations,
    options?: Record<string, unknown>,
  ): Renderer<AdapterOperations> {
    return this.renderers.resolve(name, adapter, options);
  }

  public resolveWriter(
    name: string,
    options?: Record<string, unknown>,
  ): ArtifactWriter {
    return this.writers.resolve(name, options);
  }
}
