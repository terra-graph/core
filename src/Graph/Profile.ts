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
import type { TgGraphMetadata } from './TgGraph.js';

export type ProfileRenderConfig<TOptions = Record<string, unknown>> = {
  renderer?: string;
  options?: TOptions;
};

export type SerializedProfile<TOptions = Record<string, unknown>> = {
  name: string;
  supports?: string;
  render?: ProfileRenderConfig<TOptions>;
  metadata?: TgGraphMetadata;
  phases?: SerializedPhasePlan;
  plugins?: SerializedGraphPluginRef[];
  usesProfiles?: SerializedProfile<TOptions>[];
};

export type ProfileOptions<TOptions = Record<string, unknown>> = {
  supports?: AdapterOperationsConstructor;
  render?: ProfileRenderConfig<TOptions>;
  metadata?: TgGraphMetadata;
  phases?: PhasePlan;
  plugins?: GraphPluginRef[];
  usesProfiles?: Profile<TOptions>[];
};

type ResolvedPhaseEntry = {
  phase: NamedPhase;
  rules: BaseRule[];
};

type ProfileOccurrence<TOptions = Record<string, unknown>> = {
  occurrenceId: number;
  profile: Profile<TOptions>;
};

export class Profile<TOptions = Record<string, unknown>> {
  public readonly supports?: AdapterOperationsConstructor;
  private readonly render?: ProfileRenderConfig<TOptions>;
  private readonly metadata?: TgGraphMetadata;
  private readonly phases: PhasePlan;
  private readonly plugins: GraphPluginRef[];
  private readonly usesProfiles: Profile<TOptions>[];

  constructor(
    public readonly name: string,
    options: ProfileOptions<TOptions>,
  ) {
    this.supports = options.supports;
    this.render = options.render;
    this.metadata = options.metadata;
    this.phases = options.phases ?? [];
    this.plugins = options.plugins ?? [];
    this.usesProfiles = options.usesProfiles ?? [];
  }

  public use(profile: Profile<TOptions>): Profile<TOptions> {
    return new Profile(this.name, {
      supports: this.supports,
      render: this.render,
      metadata: this.metadata,
      phases: this.phases,
      plugins: this.plugins,
      usesProfiles: [...this.usesProfiles, profile],
    });
  }

  public addPhases(phases: PhasePlan): Profile<TOptions> {
    return new Profile(this.name, {
      supports: this.supports,
      render: this.render,
      metadata: this.metadata,
      phases: [...this.phases, ...phases],
      plugins: this.plugins,
      usesProfiles: this.usesProfiles,
    });
  }

  public usePlugin(
    plugin: string,
    options?: unknown,
    slot?: string,
  ): Profile<TOptions> {
    const pluginRef = slot ? { plugin, options, slot } : { plugin, options };

    return new Profile(this.name, {
      supports: this.supports,
      render: this.render,
      metadata: this.metadata,
      phases: this.phases,
      plugins: [...this.plugins, pluginRef],
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
      metadata: this.metadata,
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
      metadata: json.metadata,
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

  public resolveMetadata(): TgGraphMetadata | undefined {
    const inherited = this.usesProfiles.reduce<TgGraphMetadata | undefined>(
      (acc, profile) => Profile.mergeMetadata(acc, profile.resolveMetadata()),
      undefined,
    );
    return Profile.mergeMetadata(inherited, this.metadata);
  }

  private static mergeMetadata(
    base?: TgGraphMetadata,
    override?: TgGraphMetadata,
  ): TgGraphMetadata | undefined {
    if (!base) {
      return override;
    }
    if (!override) {
      return base;
    }

    const merged: TgGraphMetadata = {};
    Profile.setOptionalRecord(
      merged,
      'version',
      Profile.mergeOptionalRecord(base.version, override.version),
    );
    Profile.setOptionalRecord(
      merged,
      'environment',
      Profile.mergeOptionalRecord(base.environment, override.environment),
    );
    Profile.setOptionalRecord(
      merged,
      'terraform',
      Profile.mergeOptionalRecord(base.terraform, override.terraform),
    );
    Profile.setOptionalRecord(
      merged,
      'source',
      Profile.mergeOptionalRecord(base.source, override.source),
    );
    Profile.setOptionalRecord(
      merged,
      'labels',
      Profile.mergeOptionalRecord(base.labels, override.labels),
    );
    Profile.setOptionalRecord(
      merged,
      'tool',
      Profile.mergeOptionalRecord(base.tool, override.tool),
    );
    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  private static mergeOptionalRecord<T extends object>(
    base?: T,
    override?: T,
  ): T | undefined {
    if (!base && !override) {
      return undefined;
    }
    return {
      ...(base ?? {}),
      ...(override ?? {}),
    } as T;
  }

  private static setOptionalRecord<TKey extends keyof TgGraphMetadata>(
    metadata: TgGraphMetadata,
    key: TKey,
    value: TgGraphMetadata[TKey],
  ): void {
    if (!value || Object.keys(value).length === 0) {
      return;
    }
    metadata[key] = value;
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
    const profileOccurrences = this.collectProfileOccurrences();
    const effectivePlugins =
      this.resolveEffectivePluginsByOccurrence(profileOccurrences);

    return profileOccurrences.flatMap((occurrence) =>
      occurrence.profile.resolveOwnPhaseEntries(
        namedRules,
        namedRuleSets,
        pluginRegistry,
        effectivePlugins.get(occurrence.occurrenceId) ?? [],
      ),
    );
  }

  private resolveOwnPhaseEntries(
    namedRules?: NamedRuleRegistry,
    namedRuleSets?: NamedRuleSetRegistry,
    pluginRegistry?: GraphPluginRegistry,
    plugins: GraphPluginRef[] = this.plugins,
  ): ResolvedPhaseEntry[] {
    const resolvedPlugins = this.resolveOwnPlugins(
      namedRules,
      namedRuleSets,
      pluginRegistry,
      plugins,
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
    plugins: GraphPluginRef[] = this.plugins,
  ): {
    phases: PhasePlan;
    namedRules?: NamedRuleRegistry;
    namedRuleSets?: NamedRuleSetRegistry;
  } {
    if (plugins.length === 0) {
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
      plugins,
      pluginRegistry,
      namedRules,
      namedRuleSets,
    });
  }

  private collectProfileOccurrences(
    counter: { value: number } = { value: 0 },
  ): ProfileOccurrence<TOptions>[] {
    const inherited = this.usesProfiles.flatMap((profile) =>
      profile.collectProfileOccurrences(counter),
    );

    return [
      ...inherited,
      {
        occurrenceId: counter.value++,
        profile: this,
      },
    ];
  }

  private resolveEffectivePluginsByOccurrence(
    occurrences: ProfileOccurrence<TOptions>[],
  ): Map<number, GraphPluginRef[]> {
    const pluginsByOccurrence = new Map<number, Map<number, GraphPluginRef>>();
    const slottedPlugins = new Map<
      string,
      {
        ownerOccurrenceId: number;
        ownerPluginIndex: number;
        pluginRef: GraphPluginRef;
      }
    >();

    for (const occurrence of occurrences) {
      occurrence.profile.plugins.forEach((pluginRef, index) => {
        if (pluginRef.slot) {
          const existing = slottedPlugins.get(pluginRef.slot);
          if (existing) {
            existing.pluginRef = pluginRef;
          } else {
            slottedPlugins.set(pluginRef.slot, {
              ownerOccurrenceId: occurrence.occurrenceId,
              ownerPluginIndex: index,
              pluginRef,
            });
          }
          return;
        }

        const own =
          pluginsByOccurrence.get(occurrence.occurrenceId) ?? new Map();
        own.set(index, pluginRef);
        pluginsByOccurrence.set(occurrence.occurrenceId, own);
      });
    }

    for (const slotEntry of slottedPlugins.values()) {
      const own =
        pluginsByOccurrence.get(slotEntry.ownerOccurrenceId) ?? new Map();
      own.set(slotEntry.ownerPluginIndex, slotEntry.pluginRef);
      pluginsByOccurrence.set(slotEntry.ownerOccurrenceId, own);
    }

    return new Map(
      occurrences.map((occurrence) => {
        const own =
          pluginsByOccurrence.get(occurrence.occurrenceId) ?? new Map();
        const ordered = [...own.entries()]
          .sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex)
          .map(([, pluginRef]) => pluginRef);
        return [occurrence.occurrenceId, ordered];
      }),
    );
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
