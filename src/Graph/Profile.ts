import {
  GraphPluginRef,
  GraphPluginRegistry,
  SerializedGraphPluginRef,
  resolveGraphPlugins,
} from './GraphPlugin.js';
import { AdapterOperationsConstructor } from './Operations/Operations.js';
import { NamedRuleRegistry } from './Rules/NamedRuleRegistry.js';
import { NamedRuleSetRegistry } from './Rules/NamedRuleSetRegistry.js';
import { BaseRule } from './Rules/Rule.js';
import { SerializedRule } from './Rules/RuleConfig.js';
import {
  NAMED_PHASES,
  NamedPhase,
  PhasePlan,
  PhaseRule,
  SerializedPhasePlan,
  isNamedPhase,
  isNamedRuleRef,
  isNamedRuleSetRef,
} from './Rules/RulePlan.js';
import { SupportedAdapterOperationsRegistry } from './Serialization/Registry.js';

export type ProfileRenderConfig<TOptions = Record<string, unknown>> = {
  renderer?: string;
  options?: TOptions;
};

export type SerializedProfile<TOptions = Record<string, unknown>> = {
  name: string;
  supports?: string;
  render?: ProfileRenderConfig<TOptions>;
  phases?: SerializedPhasePlan;
  plugins?: SerializedGraphPluginRef[];
  usesProfiles?: SerializedProfile<TOptions>[];
};

export type ProfileOptions<TOptions = Record<string, unknown>> = {
  supports?: AdapterOperationsConstructor;
  render?: ProfileRenderConfig<TOptions>;
  phases?: PhasePlan;
  plugins?: GraphPluginRef[];
  usesProfiles?: Profile<TOptions>[];
};

type ResolvedPhaseEntry = {
  phase: NamedPhase;
  rules: BaseRule[];
};

export class Profile<TOptions = Record<string, unknown>> {
  public readonly supports?: AdapterOperationsConstructor;
  private readonly render?: ProfileRenderConfig<TOptions>;
  private readonly phases: PhasePlan;
  private readonly plugins: GraphPluginRef[];
  private readonly usesProfiles: Profile<TOptions>[];

  constructor(
    public readonly name: string,
    options: ProfileOptions<TOptions>,
  ) {
    this.supports = options.supports;
    this.render = options.render;
    this.phases = options.phases ?? [];
    this.plugins = options.plugins ?? [];
    this.usesProfiles = options.usesProfiles ?? [];
  }

  public use(profile: Profile<TOptions>): Profile<TOptions> {
    return new Profile(this.name, {
      supports: this.supports,
      render: this.render,
      phases: this.phases,
      plugins: this.plugins,
      usesProfiles: [...this.usesProfiles, profile],
    });
  }

  public addPhases(phases: PhasePlan): Profile<TOptions> {
    return new Profile(this.name, {
      supports: this.supports,
      render: this.render,
      phases: [...this.phases, ...phases],
      plugins: this.plugins,
      usesProfiles: this.usesProfiles,
    });
  }

  public usePlugin(plugin: string, options?: unknown): Profile<TOptions> {
    return new Profile(this.name, {
      supports: this.supports,
      render: this.render,
      phases: this.phases,
      plugins: [...this.plugins, { plugin, options }],
      usesProfiles: this.usesProfiles,
    });
  }

  public resolvePhases(
    namedRules?: NamedRuleRegistry,
    namedRuleSets?: NamedRuleSetRegistry,
    pluginRegistry?: GraphPluginRegistry,
  ): BaseRule[][] {
    if (this.supports) {
      this.assertCompatibleSupportedAdapterOperations(this.supports);
    }

    const entries = this.resolvePhaseEntries(
      namedRules,
      namedRuleSets,
      pluginRegistry,
    );
    const ordered = this.orderPhaseEntries(entries);
    return ordered.map((entry) => entry.rules);
  }

  public serialize(): SerializedProfile<TOptions> {
    return {
      name: this.name,
      supports: this.supports?.name,
      render: this.render,
      phases: this.serializePhases(this.phases),
      plugins: this.plugins.length > 0 ? [...this.plugins] : undefined,
      usesProfiles: this.usesProfiles.map((profile) => profile.serialize()),
    };
  }

  public static deseriaize<TOptions = Record<string, unknown>>(
    json: SerializedProfile<TOptions>,
    supportedAdpaterOperationsRegistry?: SupportedAdapterOperationsRegistry,
  ): Profile<TOptions> {
    const supports = json.supports
      ? supportedAdpaterOperationsRegistry?.[json.supports]
      : undefined;
    if (json.supports && !supports) {
      throw new Error(
        `Profile.supports ('${json.supports}') is not registered`,
      );
    }

    return new Profile(json.name, {
      supports,
      render: json.render,
      phases: Profile.deserializePhases(json.phases ?? []),
      plugins: [...(json.plugins ?? [])],
      usesProfiles: (json.usesProfiles ?? []).map((profile) =>
        Profile.deseriaize<TOptions>(
          profile,
          supportedAdpaterOperationsRegistry,
        ),
      ),
    });
  }

  public resolveRendererOptions(): TOptions | undefined {
    const inherited = this.usesProfiles.reduce<TOptions | undefined>(
      (_acc, profile) => profile.resolveRendererOptions(),
      undefined,
    );
    return this.render?.options ?? inherited;
  }

  public resolveRenderer(): string | undefined {
    const inherited = this.usesProfiles.reduce<string | undefined>(
      (_acc, profile) => profile.resolveRenderer(),
      undefined,
    );
    return this.render?.renderer ?? inherited;
  }

  private assertCompatibleSupportedAdapterOperations(
    supports: AdapterOperationsConstructor,
  ) {
    const conflicting = this.collectProfiles().filter(
      (profile) => profile.supports && profile.supports !== supports,
    );
    if (conflicting.length > 0) {
      const names = conflicting.map((profile) => profile.name).join(', ');
      throw new Error(
        `Profile.supports conflict for ('${supports.name}') (conflicting profiles: ${names})`,
      );
    }
  }

  private collectProfiles(): Profile<TOptions>[] {
    return [
      this,
      ...this.usesProfiles.flatMap((profile) => profile.collectProfiles()),
    ];
  }

  private resolvePhaseEntries(
    namedRules?: NamedRuleRegistry,
    namedRuleSets?: NamedRuleSetRegistry,
    pluginRegistry?: GraphPluginRegistry,
  ): ResolvedPhaseEntry[] {
    const ownEntries = this.resolveOwnPhaseEntries(
      namedRules,
      namedRuleSets,
      pluginRegistry,
    );
    const inheritedEntries = this.usesProfiles.reduce(
      (acc, profile) => [
        // biome-ignore lint/performance/noAccumulatingSpread: <explanation>
        ...acc,
        ...profile.resolvePhaseEntries(
          namedRules,
          namedRuleSets,
          pluginRegistry,
        ),
      ],
      [] as ResolvedPhaseEntry[],
    );

    return [...inheritedEntries, ...ownEntries];
  }

  private resolveOwnPhaseEntries(
    namedRules?: NamedRuleRegistry,
    namedRuleSets?: NamedRuleSetRegistry,
    pluginRegistry?: GraphPluginRegistry,
  ): ResolvedPhaseEntry[] {
    const resolvedPlugins = this.resolveOwnPlugins(
      namedRules,
      namedRuleSets,
      pluginRegistry,
    );

    const pluginEntries = this.resolvePhasePlan(
      resolvedPlugins.phases,
      resolvedPlugins.namedRules,
      resolvedPlugins.namedRuleSets,
    );
    const ownEntries = this.resolvePhasePlan(
      this.phases,
      resolvedPlugins.namedRules,
      resolvedPlugins.namedRuleSets,
    );

    return [...pluginEntries, ...ownEntries];
  }

  private resolvePhasePlan(
    phases: PhasePlan,
    namedRules?: NamedRuleRegistry,
    namedRuleSets?: NamedRuleSetRegistry,
  ): ResolvedPhaseEntry[] {
    return phases.map((phase) => {
      if (!isNamedPhase(phase.phase)) {
        throw new Error(
          `Profile '${this.name}' contains unsupported phase '${String(phase.phase)}'`,
        );
      }

      return {
        phase: phase.phase,
        rules: phase.rules.flatMap((rule) =>
          this.resolveRule(rule, namedRules, namedRuleSets),
        ),
      };
    });
  }

  private orderPhaseEntries(
    entries: ResolvedPhaseEntry[],
  ): ResolvedPhaseEntry[] {
    const buckets = new Map<NamedPhase, ResolvedPhaseEntry[]>();
    for (const namedPhase of NAMED_PHASES) {
      buckets.set(namedPhase, []);
    }

    for (const entry of entries) {
      const bucket = buckets.get(entry.phase);
      if (!bucket) {
        throw new Error(
          `Profile '${this.name}' contains unsupported phase '${String(entry.phase)}'`,
        );
      }
      bucket.push(entry);
    }

    return NAMED_PHASES.flatMap((phase) => buckets.get(phase) ?? []);
  }

  private resolveOwnPlugins(
    namedRules?: NamedRuleRegistry,
    namedRuleSets?: NamedRuleSetRegistry,
    pluginRegistry?: GraphPluginRegistry,
  ): {
    phases: PhasePlan;
    namedRules?: NamedRuleRegistry;
    namedRuleSets?: NamedRuleSetRegistry;
  } {
    if (this.plugins.length === 0) {
      return {
        phases: [],
        namedRules,
        namedRuleSets,
      };
    }

    if (!pluginRegistry) {
      throw new Error(
        `Profile '${this.name}' contains plugins but no GraphPluginRegistry was provided`,
      );
    }

    return resolveGraphPlugins({
      plugins: this.plugins,
      pluginRegistry,
      namedRules,
      namedRuleSets,
    });
  }

  private resolveRule(
    rule: PhaseRule,
    namedRules?: NamedRuleRegistry,
    namedRuleSets?: NamedRuleSetRegistry,
  ): BaseRule[] {
    if (Profile.isRuleInstance(rule)) {
      return [Profile.deserializeRule(rule.serialize())];
    }

    if (isNamedRuleRef(rule)) {
      if (!namedRules) {
        throw new Error(
          `Profile '${this.name}' contains named rules but no NamedRuleRegistry was provided`,
        );
      }
      return [namedRules.resolve(rule.namedRule)];
    }

    if (isNamedRuleSetRef(rule)) {
      if (!namedRuleSets) {
        throw new Error(
          `Profile '${this.name}' contains named rule sets but no NamedRuleSetRegistry was provided`,
        );
      }
      const resolved = namedRuleSets
        .resolve(rule.namedRuleSet)
        .resolvePhases(namedRules, namedRuleSets);
      if (resolved.length > 1) {
        throw new Error(
          `Profile '${this.name}' references namedRuleSet '${rule.namedRuleSet}' with multiple phases, which cannot be inlined in a single phase`,
        );
      }
      return resolved[0] ?? [];
    }

    return [Profile.deserializeRule(rule)];
  }

  private static isRuleInstance(rule: PhaseRule): rule is BaseRule {
    if (rule instanceof BaseRule) {
      return true;
    }

    if (isNamedRuleRef(rule) || isNamedRuleSetRef(rule)) {
      return false;
    }

    return (
      typeof rule === 'object' &&
      rule !== null &&
      'serialize' in rule &&
      typeof (rule as { serialize?: unknown }).serialize === 'function'
    );
  }

  private serializePhases(phases: PhasePlan): SerializedPhasePlan {
    return phases.map((phase) => ({
      phase: phase.phase,
      rules: phase.rules.map((rule) => {
        if (rule instanceof BaseRule) {
          return rule.serialize();
        }
        return rule;
      }),
    }));
  }

  private static deserializePhases(phases: SerializedPhasePlan): PhasePlan {
    return phases.map((phase) => {
      if (!isNamedPhase(phase.phase)) {
        throw new Error(
          `Profile.phases contains unsupported phase '${String(phase.phase)}'`,
        );
      }

      return {
        phase: phase.phase,
        rules: phase.rules.map((rule) => rule),
      };
    });
  }

  private static deserializeRule<ReturnedRuleType = BaseRule>(
    rule: SerializedRule,
  ): ReturnedRuleType {
    return BaseRule.fromSerialized(rule) as ReturnedRuleType;
  }
}
