import { DotAdapter } from './Adapters/DotAdapter.js';
import { GraphologyAdapter } from './Adapters/GraphologyAdapter.js';
import { GraphPlugin, GraphPluginRegistry } from './GraphPlugin.js';
import type {
  GraphPluginBuildInput,
  GraphPluginBuildResult,
} from './GraphPlugin.js';
import { NodeQuery } from './Operations/Matchers/NodeQuery/NodeQuery.js';
import { AdapterOperations } from './Operations/Operations.js';
import { Profile, type SerializedProfile } from './Profile.js';
import { NamedRuleRegistry } from './Rules/NamedRuleRegistry.js';
import { NamedRuleSetRegistry } from './Rules/NamedRuleSetRegistry.js';
import { NodeRule } from './Rules/Rule.js';
import { RuleSet } from './Rules/RuleSet.js';
import { NodeId, TgNodeAttributes } from './TgGraph.js';

class AlwaysMatchRule extends NodeRule {
  public override apply(
    nodeId: NodeId,
    _node: TgNodeAttributes,
    graph: AdapterOperations,
  ) {
    return graph.removeNode(nodeId);
  }
}

NodeRule.register(AlwaysMatchRule);

const createAlwaysMatch = (query?: NodeQuery): NodeRule =>
  new AlwaysMatchRule({
    node: (
      query ?? NodeQuery.from({ attr: { key: 'label', exists: true } })
    ).getDsl(),
  });

class RemoveLabelPlugin extends GraphPlugin<{ label: string }> {
  constructor() {
    super('test.remove_label', { label: 'default' });
  }

  public override build({
    options,
  }: GraphPluginBuildInput<{ label: string }>): GraphPluginBuildResult {
    return {
      namedRules: {
        remove_label: createAlwaysMatch(
          NodeQuery.from({ attr: { key: 'label', eq: options.label } }),
        ),
      },
      namedRuleSets: {
        remove_label_set: new RuleSet({
          rules: [{ namedRule: 'remove_label' }],
        }),
      },
      phases: [
        {
          phase: 'main',
          rules: [{ namedRuleSet: 'remove_label_set' }],
        },
      ],
    };
  }
}

const pluginRegistry = new GraphPluginRegistry({
  'test.remove_label': new RemoveLabelPlugin(),
});

describe('Profile.serialize', () => {
  it('shoud serialize rules and operations type', () => {
    const profile = new Profile('my-profile', {
      supports: GraphologyAdapter,
      phases: [
        {
          phase: 'main',
          rules: [
            createAlwaysMatch(
              NodeQuery.from({ attr: { key: 'label', exists: true } }),
            ),
          ],
        },
      ],
    });

    const json = profile.serialize();

    expect(json).toEqual(
      expect.objectContaining({
        name: 'my-profile',
        supports: 'GraphologyAdapter',
        phases: [
          {
            phase: 'main',
            rules: [
              {
                id: 'AlwaysMatchRule',
                config: {
                  node: { attr: { key: 'label', exists: true } },
                },
              },
            ],
          },
        ],
        usesProfiles: [],
      }),
    );
  });

  it('shoud serialize render options', () => {
    const profile = new Profile('my-profile', {
      supports: GraphologyAdapter,
      render: {
        options: {
          graph: {
            rankdir: 'TB',
          },
        },
      },
      phases: [],
    });

    const json = profile.serialize();

    expect(json).toEqual(
      expect.objectContaining({
        name: 'my-profile',
        render: {
          options: {
            graph: {
              rankdir: 'TB',
            },
          },
        },
      }),
    );
  });

  it('shoud serialize render renderer', () => {
    const profile = new Profile('my-profile', {
      render: {
        renderer: 'ui-json',
      },
      phases: [],
    });

    const json = profile.serialize();

    expect(json).toEqual(
      expect.objectContaining({
        name: 'my-profile',
        render: {
          renderer: 'ui-json',
        },
      }),
    );
  });

  it('shoud serialize plugin references but not plugin-resolved phases', () => {
    const profile = new Profile('my-profile', {
      plugins: [
        {
          plugin: 'test.remove_label',
          options: { label: 'plugin' },
        },
      ],
      phases: [],
    });

    const json = profile.serialize();

    expect(json.plugins).toStrictEqual([
      {
        plugin: 'test.remove_label',
        options: { label: 'plugin' },
      },
    ]);
    expect(json.phases).toStrictEqual([]);
  });

  it('shoud serialize named phases', () => {
    const profile = new Profile('my-profile', {
      phases: [
        {
          phase: 'cleanup',
          rules: [
            createAlwaysMatch(
              NodeQuery.from({ attr: { key: 'label', eq: 'cleanup' } }),
            ),
          ],
        },
      ],
    });

    const json = profile.serialize();

    expect(json.phases).toStrictEqual([
      {
        phase: 'cleanup',
        rules: [
          {
            id: 'AlwaysMatchRule',
            config: { node: { attr: { key: 'label', eq: 'cleanup' } } },
          },
        ],
      },
    ]);
  });
});

describe('Profile.deserialize', () => {
  it('shoud deserialize rules', () => {
    const profile = new Profile('my-profile', {
      supports: GraphologyAdapter,
      phases: [
        {
          phase: 'main',
          rules: [
            createAlwaysMatch(
              NodeQuery.from({ attr: { key: 'label', exists: true } }),
            ),
          ],
        },
      ],
    });

    const json = profile.serialize();

    const restored = Profile.deseriaize(json, {
      GraphologyAdapter,
    });

    expect(restored.serialize()).toStrictEqual(json);
    expect(restored.resolvePhases()).toHaveLength(1);
    expect(restored.resolvePhases()[0]).toHaveLength(1);
  });

  it('shoud deserialize plugin references', () => {
    const profile = new Profile('my-profile', {
      plugins: [
        {
          plugin: 'test.remove_label',
          options: { label: 'plugin' },
        },
      ],
    });
    const json = profile.serialize();
    const restored = Profile.deseriaize(json);

    expect(restored.serialize().plugins).toStrictEqual([
      {
        plugin: 'test.remove_label',
        options: { label: 'plugin' },
      },
    ]);
  });

  it('shoud deserialize named phases', () => {
    const profile = new Profile('my-profile', {
      phases: [
        {
          phase: 'cleanup',
          rules: [
            createAlwaysMatch(
              NodeQuery.from({ attr: { key: 'label', eq: 'cleanup' } }),
            ),
          ],
        },
      ],
    });
    const json = profile.serialize();
    const restored = Profile.deseriaize(json);

    expect(restored.serialize().phases).toStrictEqual(json.phases);
  });

  it('shoud throw when deserializing unsupported phase names', () => {
    expect(() =>
      Profile.deseriaize({
        name: 'invalid-profile',
        phases: [
          {
            phase: 'invalid',
            rules: [],
          },
        ],
      } as unknown as SerializedProfile),
    ).toThrow("Profile.phases contains unsupported phase 'invalid'");
  });

  it('shoud throw when supports is not registered during deserialize', () => {
    expect(() =>
      Profile.deseriaize({
        name: 'unsupported-profile',
        supports: 'MissingAdapter',
      } as unknown as SerializedProfile),
    ).toThrow("Profile.supports ('MissingAdapter') is not registered");
  });

  it('shoud default missing phases and used profiles during deserialize', () => {
    const restored = Profile.deseriaize({
      name: 'empty-profile',
    });

    expect(restored.serialize().phases).toEqual([]);
    expect(restored.serialize().usesProfiles).toEqual([]);
  });
});

describe('Profile.resolveRendererOptions', () => {
  it('shoud return undefined when no renderer options are set', () => {
    const profile = new Profile('empty', {});

    expect(profile.resolveRendererOptions()).toBeUndefined();
  });

  it('shoud return own renderer options when set', () => {
    const profile = new Profile('my-profile', {
      render: {
        options: {
          graph: {
            rankdir: 'LR',
          },
        },
      },
    });

    expect(profile.resolveRendererOptions()).toEqual({
      graph: {
        rankdir: 'LR',
      },
    });
  });

  it('shoud resolve renderer options from used profiles', () => {
    const child = new Profile('child', {
      render: {
        options: {
          graph: {
            rankdir: 'TB',
          },
        },
      },
    });
    const parent = new Profile('parent', {}).use(child);

    expect(parent.resolveRendererOptions()).toEqual({
      graph: {
        rankdir: 'TB',
      },
    });
  });

  it('shoud prefer own renderer options over inherited ones', () => {
    const child = new Profile('child', {
      render: {
        options: {
          graph: {
            rankdir: 'TB',
          },
        },
      },
    });
    const parent = new Profile('parent', {
      render: {
        options: {
          graph: {
            rankdir: 'LR',
          },
        },
      },
    }).use(child);

    expect(parent.resolveRendererOptions()).toEqual({
      graph: {
        rankdir: 'LR',
      },
    });
  });
});

describe('Profile.resolveRenderer', () => {
  it('shoud return undefined when no renderer is set', () => {
    const profile = new Profile('empty', {});

    expect(profile.resolveRenderer()).toBeUndefined();
  });

  it('shoud return own renderer when set', () => {
    const profile = new Profile('my-profile', {
      render: {
        renderer: 'ui-json',
      },
    });

    expect(profile.resolveRenderer()).toBe('ui-json');
  });

  it('shoud resolve renderer from used profiles', () => {
    const child = new Profile('child', {
      render: {
        renderer: 'dot',
      },
    });
    const parent = new Profile('parent', {}).use(child);

    expect(parent.resolveRenderer()).toBe('dot');
  });

  it('shoud prefer own renderer over inherited ones', () => {
    const child = new Profile('child', {
      render: {
        renderer: 'dot',
      },
    });
    const parent = new Profile('parent', {
      render: {
        renderer: 'ui-json',
      },
    }).use(child);

    expect(parent.resolveRenderer()).toBe('ui-json');
  });
});

describe('Profile.resolvePhases', () => {
  it('shoud accept compatible supports declarations', () => {
    const profile = new Profile('supported', {
      supports: GraphologyAdapter,
      phases: [],
    });

    expect(profile.resolvePhases()).toEqual([]);
  });

  it('shoud resolve plugin phases at runtime', () => {
    const profile = new Profile('plugin-profile', {
      plugins: [
        {
          plugin: 'test.remove_label',
          options: { label: 'plugin' },
        },
      ],
    });

    const phases = profile.resolvePhases(undefined, undefined, pluginRegistry);

    expect(phases).toHaveLength(1);
    expect(phases[0]).toHaveLength(1);
    expect(phases[0][0].serialize()).toEqual({
      id: 'AlwaysMatchRule',
      config: { node: { attr: { key: 'label', eq: 'plugin' } } },
    });
  });

  it('shoud auto-prefix plugin named rules and named rule sets', () => {
    class PrefixRulePlugin extends GraphPlugin {
      constructor() {
        super('plugin.prefix');
      }

      public override build(): GraphPluginBuildResult {
        return {
          namedRules: {
            remove: {
              id: 'AlwaysMatchRule',
              config: {
                node: { attr: { key: 'label', eq: 'prefixed' } },
              },
            },
          },
          namedRuleSets: {
            wrapper: new RuleSet({
              rules: [{ namedRule: 'remove' }],
            }),
          },
          phases: [
            {
              phase: 'main',
              rules: [{ namedRuleSet: 'wrapper' }],
            },
          ],
        };
      }
    }

    const registry = new GraphPluginRegistry({
      'plugin.prefix': new PrefixRulePlugin(),
    });
    const profile = new Profile('plugin-profile', {
      plugins: [{ plugin: 'plugin.prefix' }],
    });

    const phases = profile.resolvePhases(undefined, undefined, registry);

    expect(phases).toHaveLength(1);
    expect(phases[0]).toHaveLength(1);
    expect(phases[0][0].serialize()).toEqual({
      id: 'AlwaysMatchRule',
      config: { node: { attr: { key: 'label', eq: 'prefixed' } } },
    });
  });

  it('shoud resolve plugin phases by named phase order', () => {
    class CleanupPlugin extends GraphPlugin {
      constructor() {
        super('plugin.cleanup');
      }

      public override build(): GraphPluginBuildResult {
        return {
          namedRules: {
            cleanup: {
              id: 'AlwaysMatchRule',
              config: {
                node: { attr: { key: 'label', eq: 'plugin-cleanup' } },
              },
            },
          },
          phases: [
            {
              phase: 'cleanup',
              rules: [{ namedRule: 'cleanup' }],
            },
          ],
        };
      }
    }

    const registry = new GraphPluginRegistry({
      'plugin.cleanup': new CleanupPlugin(),
    });
    const profile = new Profile('plugin-profile', {
      plugins: [{ plugin: 'plugin.cleanup' }],
      phases: [
        {
          phase: 'main',
          rules: [
            createAlwaysMatch(
              NodeQuery.from({ attr: { key: 'label', eq: 'profile-main' } }),
            ),
          ],
        },
      ],
    });

    const phases = profile.resolvePhases(undefined, undefined, registry);

    expect(phases).toHaveLength(2);
    expect(phases[0][0].serialize()).toEqual({
      id: 'AlwaysMatchRule',
      config: { node: { attr: { key: 'label', eq: 'profile-main' } } },
    });
    expect(phases[1][0].serialize()).toEqual({
      id: 'AlwaysMatchRule',
      config: { node: { attr: { key: 'label', eq: 'plugin-cleanup' } } },
    });
  });

  it('shoud throw when plugins are used without a plugin registry', () => {
    const profile = new Profile('plugin-profile', {
      plugins: [{ plugin: 'test.remove_label' }],
    });

    expect(() => profile.resolvePhases()).toThrow(
      "Profile 'plugin-profile' contains plugins but no GraphPluginRegistry was provided",
    );
  });

  it('shoud throw when plugin prefixed names collide', () => {
    const profile = new Profile('plugin-profile', {
      plugins: [{ plugin: 'test.remove_label' }],
    });
    const namedRules = new NamedRuleRegistry({
      'test.remove_label.remove_label': {
        id: 'AlwaysMatchRule',
        config: { node: { any: true } },
      },
    });

    expect(() =>
      profile.resolvePhases(namedRules, undefined, pluginRegistry),
    ).toThrow(
      "GraphPlugin 'test.remove_label' named rule 'test.remove_label.remove_label' collides with an existing named rule",
    );
  });

  it('shoud throw when a phase contains an unsupported phase name', () => {
    const profile = new Profile('phase-profile', {
      phases: [
        {
          phase: 'invalid',
          rules: [],
        } as unknown as { phase: 'main'; rules: [] },
      ],
    });

    expect(() => profile.resolvePhases()).toThrow(
      "Profile 'phase-profile' contains unsupported phase 'invalid'",
    );
  });

  it('shoud throw when supports is incompatible across used profiles', () => {
    const used = new Profile('used', {
      supports: DotAdapter,
    });
    const profile = new Profile('current', {
      supports: GraphologyAdapter,
    }).use(used);

    expect(() => profile.resolvePhases()).toThrow(
      "Profile.supports conflict for ('GraphologyAdapter') (conflicting profiles: used)",
    );
  });

  it('shoud resolve named rules when a registry is provided', () => {
    const registry = new NamedRuleRegistry({
      removeAlways: {
        id: 'AlwaysMatchRule',
        config: { node: { any: true } },
      },
    });
    const profile = new Profile('named-profile', {
      phases: [{ phase: 'main', rules: [{ namedRule: 'removeAlways' }] }],
    });

    const phases = profile.resolvePhases(registry);

    expect(phases).toHaveLength(1);
    expect(phases[0]).toHaveLength(1);
    expect(phases[0][0].serialize()).toEqual({
      id: 'AlwaysMatchRule',
      config: { node: { any: true } },
    });
  });

  it('shoud throw when named rules are used without a registry', () => {
    const profile = new Profile('named-profile', {
      phases: [{ phase: 'main', rules: [{ namedRule: 'removeAlways' }] }],
    });

    expect(() => profile.resolvePhases()).toThrow(
      "Profile 'named-profile' contains named rules but no NamedRuleRegistry was provided",
    );
  });

  it('shoud use current named rule definitions after deserialize', () => {
    const profile = new Profile('named-profile', {
      phases: [{ phase: 'main', rules: [{ namedRule: 'removeAlways' }] }],
    });

    const serialized = profile.serialize();
    const restored = Profile.deseriaize(serialized);
    const updatedRegistry = new NamedRuleRegistry({
      removeAlways: {
        id: 'AlwaysMatchRule',
        config: {
          node: { attr: { key: 'label', startsWith: 'data.' } },
        },
      },
    });

    const phases = restored.resolvePhases(updatedRegistry);

    expect(phases[0][0].serialize()).toEqual({
      id: 'AlwaysMatchRule',
      config: { node: { attr: { key: 'label', startsWith: 'data.' } } },
    });
  });

  it('shoud append own phases after used profile phases', () => {
    const used = new Profile('used', {
      phases: [
        {
          phase: 'main',
          rules: [
            createAlwaysMatch(
              NodeQuery.from({ attr: { key: 'label', eq: 'used' } }),
            ),
          ],
        },
      ],
    });
    const current = new Profile('current', {
      usesProfiles: [used],
      phases: [
        {
          phase: 'main',
          rules: [
            createAlwaysMatch(
              NodeQuery.from({ attr: { key: 'label', eq: 'current' } }),
            ),
          ],
        },
      ],
    });

    const phases = current.resolvePhases();

    expect(phases).toHaveLength(2);
    expect(phases[0][0].serialize()).toEqual({
      id: 'AlwaysMatchRule',
      config: { node: { attr: { key: 'label', eq: 'used' } } },
    });
    expect(phases[1][0].serialize()).toEqual({
      id: 'AlwaysMatchRule',
      config: { node: { attr: { key: 'label', eq: 'current' } } },
    });
  });

  it('shoud resolve named rule sets when a rule set registry is provided', () => {
    const namedRules = new NamedRuleRegistry({
      removeUsed: {
        id: 'AlwaysMatchRule',
        config: { node: { attr: { key: 'label', eq: 'used' } } },
      },
      removeCurrent: {
        id: 'AlwaysMatchRule',
        config: { node: { attr: { key: 'label', eq: 'current' } } },
      },
    });
    const namedRuleSets = new NamedRuleSetRegistry({
      baseSet: new RuleSet({
        rules: [{ namedRule: 'removeUsed' }],
      }),
    });
    const profile = new Profile('named-set-profile', {
      phases: [
        {
          phase: 'main',
          rules: [{ namedRuleSet: 'baseSet' }, { namedRule: 'removeCurrent' }],
        },
      ],
    });

    const phases = profile.resolvePhases(namedRules, namedRuleSets);

    expect(phases).toHaveLength(1);
    expect(phases[0]).toHaveLength(2);
    expect(phases[0][0].serialize()).toEqual({
      id: 'AlwaysMatchRule',
      config: { node: { attr: { key: 'label', eq: 'used' } } },
    });
    expect(phases[0][1].serialize()).toEqual({
      id: 'AlwaysMatchRule',
      config: { node: { attr: { key: 'label', eq: 'current' } } },
    });
  });

  it('shoud resolve serialized rule entries', () => {
    const profile = new Profile('serialized-profile', {
      phases: [
        {
          phase: 'main',
          rules: [
            {
              id: 'AlwaysMatchRule',
              config: { node: { any: true } },
            },
          ],
        },
      ],
    });

    const phases = profile.resolvePhases();

    expect(phases).toHaveLength(1);
    expect(phases[0][0].serialize()).toEqual({
      id: 'AlwaysMatchRule',
      config: { node: { any: true } },
    });
  });

  it('shoud throw when ordering phases with unsupported entries', () => {
    const profile = new Profile('phase-profile', {});

    expect(() =>
      (
        profile as unknown as {
          orderPhaseEntries: (
            entries: { phase: string; rules: NodeRule[] }[],
          ) => unknown;
        }
      ).orderPhaseEntries([{ phase: 'invalid', rules: [] }]),
    ).toThrow("Profile 'phase-profile' contains unsupported phase 'invalid'");
  });

  it('shoud throw when named rule sets resolve multiple phases', () => {
    const profile = new Profile('multi-set-profile', {
      phases: [{ phase: 'main', rules: [{ namedRuleSet: 'multi' }] }],
    });

    const namedRuleSets = {
      resolve: () => ({
        resolvePhases: () => [[], []],
      }),
    } as unknown as NamedRuleSetRegistry;

    expect(() => profile.resolvePhases(undefined, namedRuleSets)).toThrow(
      "Profile 'multi-set-profile' references namedRuleSet 'multi' with multiple phases, which cannot be inlined in a single phase",
    );
  });

  it('shoud return empty rules when named rule sets resolve no phases', () => {
    const profile = new Profile('empty-set-profile', {
      phases: [{ phase: 'main', rules: [{ namedRuleSet: 'empty' }] }],
    });

    const namedRuleSets = {
      resolve: () => ({
        resolvePhases: () => [],
      }),
    } as unknown as NamedRuleSetRegistry;

    const phases = profile.resolvePhases(undefined, namedRuleSets);

    expect(phases).toEqual([[]]);
  });

  it('shoud handle missing phase buckets during ordering', () => {
    const profile = new Profile('phase-profile', {});
    const originalGet = Map.prototype.get;

    Map.prototype.get = function (key) {
      if (key === 'pre') {
        return undefined;
      }
      return originalGet.call(this, key);
    };

    try {
      const ordered = (
        profile as unknown as {
          orderPhaseEntries: (
            entries: { phase: string; rules: NodeRule[] }[],
          ) => unknown[];
        }
      ).orderPhaseEntries([]);
      expect(ordered).toEqual([]);
    } finally {
      Map.prototype.get = originalGet;
    }
  });

  it('shoud throw when named rule sets are used without a rule set registry', () => {
    const profile = new Profile('named-set-profile', {
      phases: [{ phase: 'main', rules: [{ namedRuleSet: 'baseSet' }] }],
    });

    expect(() => profile.resolvePhases()).toThrow(
      "Profile 'named-set-profile' contains named rule sets but no NamedRuleSetRegistry was provided",
    );
  });

  it('shoud resolve nested named rule sets', () => {
    const namedRules = new NamedRuleRegistry({
      removeUsed: {
        id: 'AlwaysMatchRule',
        config: { node: { attr: { key: 'label', eq: 'used' } } },
      },
      removeCurrent: {
        id: 'AlwaysMatchRule',
        config: { node: { attr: { key: 'label', eq: 'current' } } },
      },
    });
    const namedRuleSets = new NamedRuleSetRegistry({
      baseSet: new RuleSet({
        rules: [{ namedRule: 'removeUsed' }],
      }),
      wrapperSet: new RuleSet({
        rules: [{ namedRuleSet: 'baseSet' }, { namedRule: 'removeCurrent' }],
      }),
    });
    const profile = new Profile('named-set-profile', {
      phases: [{ phase: 'main', rules: [{ namedRuleSet: 'wrapperSet' }] }],
    });

    const phases = profile.resolvePhases(namedRules, namedRuleSets);

    expect(phases).toHaveLength(1);
    expect(phases[0]).toHaveLength(2);
    expect(phases[0][0].serialize()).toEqual({
      id: 'AlwaysMatchRule',
      config: { node: { attr: { key: 'label', eq: 'used' } } },
    });
    expect(phases[0][1].serialize()).toEqual({
      id: 'AlwaysMatchRule',
      config: { node: { attr: { key: 'label', eq: 'current' } } },
    });
  });

  it('shoud order phases by named phase sequence', () => {
    const profile = new Profile('phase-profile', {
      phases: [
        {
          phase: 'cleanup',
          rules: [
            createAlwaysMatch(
              NodeQuery.from({ attr: { key: 'label', eq: 'cleanup' } }),
            ),
          ],
        },
        {
          phase: 'normalize',
          rules: [
            createAlwaysMatch(
              NodeQuery.from({ attr: { key: 'label', eq: 'normalize' } }),
            ),
          ],
        },
        {
          phase: 'main',
          rules: [
            createAlwaysMatch(
              NodeQuery.from({ attr: { key: 'label', eq: 'main' } }),
            ),
          ],
        },
      ],
    });

    const phases = profile.resolvePhases();

    expect(phases).toHaveLength(3);
    expect(phases[0][0].serialize()).toEqual({
      id: 'AlwaysMatchRule',
      config: { node: { attr: { key: 'label', eq: 'normalize' } } },
    });
    expect(phases[1][0].serialize()).toEqual({
      id: 'AlwaysMatchRule',
      config: { node: { attr: { key: 'label', eq: 'main' } } },
    });
    expect(phases[2][0].serialize()).toEqual({
      id: 'AlwaysMatchRule',
      config: { node: { attr: { key: 'label', eq: 'cleanup' } } },
    });
  });

  it('shoud run inherited cleanup phases after main phases', () => {
    const used = new Profile('used', {
      phases: [
        {
          phase: 'cleanup',
          rules: [
            createAlwaysMatch(
              NodeQuery.from({ attr: { key: 'label', eq: 'used-cleanup' } }),
            ),
          ],
        },
      ],
    });
    const current = new Profile('current', {
      usesProfiles: [used],
      phases: [
        {
          phase: 'main',
          rules: [
            createAlwaysMatch(
              NodeQuery.from({ attr: { key: 'label', eq: 'current-main' } }),
            ),
          ],
        },
      ],
    });

    const phases = current.resolvePhases();

    expect(phases).toHaveLength(2);
    expect(phases[0][0].serialize()).toEqual({
      id: 'AlwaysMatchRule',
      config: { node: { attr: { key: 'label', eq: 'current-main' } } },
    });
    expect(phases[1][0].serialize()).toEqual({
      id: 'AlwaysMatchRule',
      config: { node: { attr: { key: 'label', eq: 'used-cleanup' } } },
    });
  });
});

describe('Profile.usePlugin', () => {
  it('shoud append plugin references immutably', () => {
    const base = new Profile('plugin-profile', {});
    const updated = base.usePlugin('test.remove_label', { label: 'plugin' });

    expect(base.serialize().plugins ?? []).toHaveLength(0);
    expect(updated.serialize().plugins).toStrictEqual([
      { plugin: 'test.remove_label', options: { label: 'plugin' } },
    ]);
  });
});

describe('Profile.addPhases', () => {
  it('shoud append phases immutably', () => {
    const base = new Profile('base', {
      phases: [{ phase: 'main', rules: [] }],
    });

    const updated = base.addPhases([{ phase: 'cleanup', rules: [] }]);

    expect(base.serialize().phases).toHaveLength(1);
    expect(updated.serialize().phases).toHaveLength(2);
  });
});

describe('Profile.use', () => {
  it('shoud append used profiles immutably', () => {
    const base = new Profile('base', {});
    const used = new Profile('used', {});

    const updated = base.use(used);

    expect(base.serialize().usesProfiles).toHaveLength(0);
    expect(updated.serialize().usesProfiles).toHaveLength(1);
  });
});

describe('Profile.serialize (plugins)', () => {
  it('shoud omit plugins when none are configured', () => {
    const profile = new Profile('empty', {});

    expect(profile.serialize().plugins).toBeUndefined();
  });
});

describe('Profile.resolvePhases (rule-like entries)', () => {
  it('shoud resolve rules that provide a serialize function', () => {
    const ruleLike = {
      serialize: () => ({
        id: 'AlwaysMatchRule',
        config: { node: { any: true } },
      }),
    } as unknown as NodeRule;

    const profile = new Profile('rule-like', {
      phases: [{ phase: 'main', rules: [ruleLike] }],
    });

    const phases = profile.resolvePhases();

    expect(phases).toHaveLength(1);
    expect(phases[0]).toHaveLength(1);
    expect(phases[0][0].serialize()).toEqual({
      id: 'AlwaysMatchRule',
      config: { node: { any: true } },
    });
  });
});
