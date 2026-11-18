import {
  GraphPlugin,
  GraphPluginBuildInput,
  type GraphPluginBuildResult,
  GraphPluginRegistry,
  resolveGraphPlugins,
} from './GraphPlugin.js';
import { NamedRuleRegistry } from './Rules/NamedRuleRegistry.js';
import { NamedRuleSetRegistry } from './Rules/NamedRuleSetRegistry.js';
import { RemoveNode } from './Rules/Node/RemoveNode.js';
import { RuleSet } from './Rules/RuleSet.js';

describe('GraphPluginRegistry.resolve', () => {
  it('shoud resolve a named plugin instance', () => {
    class ExamplePlugin extends GraphPlugin {
      constructor() {
        super('example.plugin');
      }

      public build() {
        return {};
      }
    }

    const plugin = new ExamplePlugin();
    const registry = new GraphPluginRegistry({
      'example.plugin': plugin,
    });

    expect(registry.resolve('example.plugin')).toBe(plugin);
  });

  it('shoud resolve a fresh instance each time for a named plugin factory', () => {
    class FactoryPlugin extends GraphPlugin {
      constructor() {
        super('factory.plugin');
      }

      public build() {
        return {};
      }
    }

    const registry = new GraphPluginRegistry({
      'factory.plugin': () => new FactoryPlugin(),
    });

    const first = registry.resolve('factory.plugin');
    const second = registry.resolve('factory.plugin');

    expect(first).not.toBe(second);
    expect(first.name).toBe(second.name);
  });

  it('shoud throw when a named plugin is not registered', () => {
    const registry = new GraphPluginRegistry();

    expect(() => registry.resolve('doesNotExist')).toThrow(
      "GraphPlugin 'doesNotExist' is not registered",
    );
  });

  it('shoud throw when registry key and plugin name do not match', () => {
    class WrongNamePlugin extends GraphPlugin {
      constructor() {
        super('wrong.name');
      }

      public build() {
        return {};
      }
    }

    const registry = new GraphPluginRegistry({
      'expected.name': new WrongNamePlugin(),
    });

    expect(() => registry.resolve('expected.name')).toThrow(
      "GraphPlugin registry key 'expected.name' does not match plugin.name 'wrong.name'",
    );
  });
});

describe('GraphPluginRegistry.register', () => {
  it('shoud return a new registry without mutating the original', () => {
    class OnePlugin extends GraphPlugin {
      constructor() {
        super('one.plugin');
      }

      public build() {
        return {};
      }
    }
    class TwoPlugin extends GraphPlugin {
      constructor() {
        super('two.plugin');
      }

      public build() {
        return {};
      }
    }

    const base = new GraphPluginRegistry({
      'one.plugin': new OnePlugin(),
    });

    const next = base.register('two.plugin', new TwoPlugin());

    expect(base.names()).toEqual(['one.plugin']);
    expect(next.names()).toEqual(['one.plugin', 'two.plugin']);
  });
});

describe('GraphPluginRegistry.registerMany', () => {
  it('shoud return a new registry with merged definitions', () => {
    class OnePlugin extends GraphPlugin {
      constructor() {
        super('one.plugin');
      }

      public build() {
        return {};
      }
    }

    class TwoPlugin extends GraphPlugin {
      constructor() {
        super('two.plugin');
      }

      public build() {
        return {};
      }
    }

    const base = new GraphPluginRegistry({
      'one.plugin': new OnePlugin(),
    });

    const next = base.registerMany({
      'two.plugin': () => new TwoPlugin(),
    });

    expect(base.names()).toEqual(['one.plugin']);
    expect(next.names()).toEqual(['one.plugin', 'two.plugin']);
    expect(next.resolve('two.plugin')).not.toBe(next.resolve('two.plugin'));
  });
});

describe('GraphPluginRegistry.use', () => {
  it('shoud combine registries immutably', () => {
    class OnePlugin extends GraphPlugin {
      constructor() {
        super('one.plugin');
      }

      public build() {
        return {};
      }
    }
    class TwoPlugin extends GraphPlugin {
      constructor() {
        super('two.plugin');
      }

      public build() {
        return {};
      }
    }

    const one = new GraphPluginRegistry({
      'one.plugin': new OnePlugin(),
    });
    const two = new GraphPluginRegistry({
      'two.plugin': new TwoPlugin(),
    });

    const combined = one.use(two);

    expect(one.names()).toEqual(['one.plugin']);
    expect(two.names()).toEqual(['two.plugin']);
    expect(combined.names()).toEqual(['one.plugin', 'two.plugin']);
  });
});

describe('GraphPluginRegistry.from', () => {
  it('shoud combine an array of registries', () => {
    class OnePlugin extends GraphPlugin {
      constructor() {
        super('one.plugin');
      }

      public build() {
        return {};
      }
    }
    class TwoPlugin extends GraphPlugin {
      constructor() {
        super('two.plugin');
      }

      public build() {
        return {};
      }
    }

    const one = new GraphPluginRegistry({
      'one.plugin': new OnePlugin(),
    });
    const two = new GraphPluginRegistry({
      'two.plugin': new TwoPlugin(),
    });

    const combined = GraphPluginRegistry.from([one, two]);

    expect(combined.names()).toEqual(['one.plugin', 'two.plugin']);
  });
});

describe('resolveGraphPlugins', () => {
  it('shoud resolve plugin named rules, named rule sets and prefixed phases', () => {
    class PluginOne extends GraphPlugin<{ marker?: string }> {
      constructor() {
        super('test.plugin', { marker: 'default' });
      }

      public override build({
        options,
      }: GraphPluginBuildInput<{ marker?: string }>): GraphPluginBuildResult {
        return {
          namedRules: {
            remove: new RemoveNode({
              node: {
                attr: {
                  key: 'label',
                  eq: options.marker ?? 'default',
                },
              },
            }),
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

    const pluginRegistry = new GraphPluginRegistry({
      'test.plugin': new PluginOne(),
    });

    const result = resolveGraphPlugins({
      plugins: [{ plugin: 'test.plugin', options: { marker: 'plugin' } }],
      pluginRegistry,
    });

    expect(result.namedRules.names()).toEqual(['test.plugin.remove']);
    expect(result.namedRuleSets.names()).toEqual(['test.plugin.wrapper']);
    expect(result.phases).toEqual([
      {
        phase: 'main',
        rules: [{ namedRuleSet: 'test.plugin.wrapper' }],
      },
    ]);

    const resolved = result.namedRuleSets
      .resolve('test.plugin.wrapper')
      .resolvePhases(result.namedRules, result.namedRuleSets);
    expect(resolved[0][0].serialize()).toEqual({
      id: 'RemoveNode',
      config: {
        node: { attr: { key: 'label', eq: 'plugin' } },
      },
    });
  });

  it('shoud resolve and prefix named phases', () => {
    class PluginWithCleanupContribution extends GraphPlugin<{
      marker?: string;
    }> {
      constructor() {
        super('test.phase_contrib', { marker: 'default' });
      }

      public override build({
        options,
      }: GraphPluginBuildInput<{ marker?: string }>): GraphPluginBuildResult {
        return {
          namedRules: {
            remove: new RemoveNode({
              node: {
                attr: {
                  key: 'label',
                  eq: options.marker ?? 'default',
                },
              },
            }),
          },
          namedRuleSets: {
            wrapper: new RuleSet({
              rules: [{ namedRule: 'remove' }],
            }),
          },
          phases: [
            {
              phase: 'final',
              rules: [{ namedRuleSet: 'wrapper' }],
            },
          ],
        };
      }
    }

    const pluginRegistry = new GraphPluginRegistry({
      'test.phase_contrib': new PluginWithCleanupContribution(),
    });

    const result = resolveGraphPlugins({
      plugins: [
        { plugin: 'test.phase_contrib', options: { marker: 'plugin' } },
      ],
      pluginRegistry,
    });

    expect(result.phases).toEqual([
      {
        phase: 'final',
        rules: [{ namedRuleSet: 'test.phase_contrib.wrapper' }],
      },
    ]);
  });

  it('shoud merge plugin defaults with provided options', () => {
    class CapturePlugin extends GraphPlugin<{ one?: string; two?: string }> {
      public captured?: { one?: string; two?: string };

      constructor() {
        super('test.capture', { one: 'default-one', two: 'default-two' });
      }

      public override build({
        options,
      }: GraphPluginBuildInput<{ one?: string; two?: string }>) {
        this.captured = options;
        return {};
      }
    }

    const plugin = new CapturePlugin();
    const pluginRegistry = new GraphPluginRegistry({
      'test.capture': plugin,
    });

    resolveGraphPlugins({
      plugins: [{ plugin: 'test.capture', options: { one: 'override' } }],
      pluginRegistry,
    });

    expect(plugin.captured).toEqual({
      one: 'override',
      two: 'default-two',
    });
  });

  it('shoud pass an empty object when no defaults and no options are provided', () => {
    class EmptyOptionsPlugin extends GraphPlugin {
      public captured?: Record<string, unknown>;

      constructor() {
        super('test.empty');
      }

      public override build({
        options,
      }: GraphPluginBuildInput<Record<string, unknown>>) {
        this.captured = options;
        return {};
      }
    }

    const plugin = new EmptyOptionsPlugin();
    const pluginRegistry = new GraphPluginRegistry({
      'test.empty': plugin,
    });

    resolveGraphPlugins({
      plugins: [{ plugin: 'test.empty' }],
      pluginRegistry,
    });

    expect(plugin.captured).toEqual({});
  });

  it('shoud throw when plugin local names collide after prefixing', () => {
    class CollisionPlugin extends GraphPlugin {
      constructor() {
        super('test.collision');
      }

      public override build(): GraphPluginBuildResult {
        return {
          namedRules: {
            one: new RemoveNode({ node: { any: true } }),
            'test.collision.one': new RemoveNode({ node: { any: true } }),
          },
        };
      }
    }

    const pluginRegistry = new GraphPluginRegistry({
      'test.collision': new CollisionPlugin(),
    });

    expect(() =>
      resolveGraphPlugins({
        plugins: [{ plugin: 'test.collision' }],
        pluginRegistry,
      }),
    ).toThrow(
      "GraphPlugin 'test.collision' has colliding named rule names after prefixing ('test.collision.one' -> 'test.collision.one')",
    );
  });

  it('shoud throw when plugin prefixed names collide with existing registries', () => {
    class CollisionPlugin extends GraphPlugin {
      constructor() {
        super('test.collision');
      }

      public override build(): GraphPluginBuildResult {
        return {
          namedRules: {
            one: new RemoveNode({ node: { any: true } }),
          },
        };
      }
    }

    const pluginRegistry = new GraphPluginRegistry({
      'test.collision': new CollisionPlugin(),
    });
    const namedRules = new NamedRuleRegistry({
      'test.collision.one': new RemoveNode({ node: { any: true } }),
    });

    expect(() =>
      resolveGraphPlugins({
        plugins: [{ plugin: 'test.collision' }],
        pluginRegistry,
        namedRules,
      }),
    ).toThrow(
      "GraphPlugin 'test.collision' named rule 'test.collision.one' collides with an existing named rule",
    );
  });

  it('shoud not double prefix already prefixed names', () => {
    class PrefixedPlugin extends GraphPlugin {
      constructor() {
        super('test.prefixed');
      }

      public override build(): GraphPluginBuildResult {
        return {
          namedRules: {
            'test.prefixed.rule': new RemoveNode({ node: { any: true } }),
          },
          phases: [
            {
              phase: 'main',
              rules: [{ namedRule: 'test.prefixed.rule' }],
            },
          ],
        };
      }
    }

    const pluginRegistry = new GraphPluginRegistry({
      'test.prefixed': new PrefixedPlugin(),
    });

    const result = resolveGraphPlugins({
      plugins: [{ plugin: 'test.prefixed' }],
      pluginRegistry,
    });

    expect(result.namedRules.names()).toEqual(['test.prefixed.rule']);
    expect(result.phases).toEqual([
      {
        phase: 'main',
        rules: [{ namedRule: 'test.prefixed.rule' }],
      },
    ]);
  });

  it('shoud retain external named rule references without remapping', () => {
    class ExternalRefPlugin extends GraphPlugin {
      constructor() {
        super('test.external');
      }

      public override build(): GraphPluginBuildResult {
        return {
          phases: [
            {
              phase: 'main',
              rules: [{ namedRule: 'shared.rule' }],
            },
          ],
        };
      }
    }

    const pluginRegistry = new GraphPluginRegistry({
      'test.external': new ExternalRefPlugin(),
    });
    const namedRules = new NamedRuleRegistry({
      'shared.rule': new RemoveNode({ node: { any: true } }),
    });

    const result = resolveGraphPlugins({
      plugins: [{ plugin: 'test.external' }],
      pluginRegistry,
      namedRules,
    });

    expect(result.phases).toEqual([
      {
        phase: 'main',
        rules: [{ namedRule: 'shared.rule' }],
      },
    ]);
  });

  it('shoud retain external named rule set references without remapping', () => {
    class ExternalRuleSetPlugin extends GraphPlugin {
      constructor() {
        super('test.external_set');
      }

      public override build(): GraphPluginBuildResult {
        return {
          phases: [
            {
              phase: 'main',
              rules: [{ namedRuleSet: 'shared.set' }],
            },
          ],
        };
      }
    }

    const pluginRegistry = new GraphPluginRegistry({
      'test.external_set': new ExternalRuleSetPlugin(),
    });
    const namedRuleSets = new NamedRuleSetRegistry({
      'shared.set': new RuleSet({
        rules: [{ namedRule: 'shared.rule' }],
      }),
    });

    const result = resolveGraphPlugins({
      plugins: [{ plugin: 'test.external_set' }],
      pluginRegistry,
      namedRuleSets,
    });

    expect(result.phases).toEqual([
      {
        phase: 'main',
        rules: [{ namedRuleSet: 'shared.set' }],
      },
    ]);
  });

  it('shoud rewrite named rule set factories with prefixed references', () => {
    class RuleSetFactoryPlugin extends GraphPlugin<{ label: string }> {
      constructor() {
        super('test.factory', { label: 'default' });
      }

      public override build({
        options,
      }: GraphPluginBuildInput<{ label: string }>): GraphPluginBuildResult {
        return {
          namedRules: {
            remove: new RemoveNode({
              node: { attr: { key: 'label', eq: options.label } },
            }),
          },
          namedRuleSets: {
            wrapper: () =>
              new RuleSet({
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

    const pluginRegistry = new GraphPluginRegistry({
      'test.factory': new RuleSetFactoryPlugin(),
    });

    const result = resolveGraphPlugins({
      plugins: [{ plugin: 'test.factory', options: { label: 'plugin' } }],
      pluginRegistry,
    });

    const resolved = result.namedRuleSets
      .resolve('test.factory.wrapper')
      .resolvePhases(result.namedRules, result.namedRuleSets);

    expect(resolved[0][0].serialize()).toEqual({
      id: 'RemoveNode',
      config: { node: { attr: { key: 'label', eq: 'plugin' } } },
    });
  });

  it('shoud rewrite serialized named rule set definitions with prefixed rules', () => {
    class SerializedRuleSetPlugin extends GraphPlugin {
      constructor() {
        super('test.serialized_set');
      }

      public override build(): GraphPluginBuildResult {
        return {
          namedRules: {
            remove: new RemoveNode({ node: { any: true } }),
          },
          namedRuleSets: {
            wrapper: {
              rules: [{ namedRule: 'remove' }],
            },
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

    const pluginRegistry = new GraphPluginRegistry({
      'test.serialized_set': new SerializedRuleSetPlugin(),
    });

    const result = resolveGraphPlugins({
      plugins: [{ plugin: 'test.serialized_set' }],
      pluginRegistry,
    });

    const serialized = result.namedRuleSets
      .resolve('test.serialized_set.wrapper')
      .serialize();

    expect(serialized.rules).toEqual([
      { namedRule: 'test.serialized_set.remove' },
    ]);
  });

  it('shoud keep unmapped references inside serialized rule sets', () => {
    class ExternalRefsRuleSetPlugin extends GraphPlugin {
      constructor() {
        super('test.external_ruleset');
      }

      public override build(): GraphPluginBuildResult {
        return {
          namedRuleSets: {
            wrapper: {
              rules: [
                { namedRule: 'shared.rule' },
                { namedRuleSet: 'shared.set' },
                {
                  id: 'RemoveNode',
                  config: { node: { any: true } },
                },
              ],
            },
          },
        };
      }
    }

    const pluginRegistry = new GraphPluginRegistry({
      'test.external_ruleset': new ExternalRefsRuleSetPlugin(),
    });

    const result = resolveGraphPlugins({
      plugins: [{ plugin: 'test.external_ruleset' }],
      pluginRegistry,
    });

    const serialized = result.namedRuleSets
      .resolve('test.external_ruleset.wrapper')
      .serialize();

    expect(serialized.rules).toEqual([
      { namedRule: 'shared.rule' },
      { namedRuleSet: 'shared.set' },
      {
        id: 'RemoveNode',
        config: { node: { any: true } },
      },
    ]);
  });

  it('shoud prefix named rule set references inside serialized rule sets', () => {
    class NestedRuleSetPlugin extends GraphPlugin {
      constructor() {
        super('test.nested_ruleset');
      }

      public override build(): GraphPluginBuildResult {
        return {
          namedRuleSets: {
            inner: {
              rules: [],
            },
            outer: {
              rules: [{ namedRuleSet: 'inner' }],
            },
          },
        };
      }
    }

    const pluginRegistry = new GraphPluginRegistry({
      'test.nested_ruleset': new NestedRuleSetPlugin(),
    });

    const result = resolveGraphPlugins({
      plugins: [{ plugin: 'test.nested_ruleset' }],
      pluginRegistry,
    });

    const serialized = result.namedRuleSets
      .resolve('test.nested_ruleset.outer')
      .serialize();

    expect(serialized.rules).toEqual([
      { namedRuleSet: 'test.nested_ruleset.inner' },
    ]);
  });

  it('shoud fall back to unprefixed named rules when map misses entries', () => {
    const originalGet = Map.prototype.get;
    Map.prototype.get = function (key) {
      if (key === 'fallback-rule') {
        return undefined;
      }
      return originalGet.call(this, key);
    };

    try {
      class FallbackRulePlugin extends GraphPlugin {
        constructor() {
          super('test.fallback_rule');
        }

        public override build(): GraphPluginBuildResult {
          return {
            namedRules: {
              'fallback-rule': new RemoveNode({ node: { any: true } }),
            },
          };
        }
      }

      const pluginRegistry = new GraphPluginRegistry({
        'test.fallback_rule': new FallbackRulePlugin(),
      });

      const result = resolveGraphPlugins({
        plugins: [{ plugin: 'test.fallback_rule' }],
        pluginRegistry,
      });

      expect(result.namedRules.names()).toEqual(['fallback-rule']);
    } finally {
      Map.prototype.get = originalGet;
    }
  });

  it('shoud fall back to unprefixed named rule sets when map misses entries', () => {
    const originalGet = Map.prototype.get;
    Map.prototype.get = function (key) {
      if (key === 'fallback-set') {
        return undefined;
      }
      return originalGet.call(this, key);
    };

    try {
      class FallbackRuleSetPlugin extends GraphPlugin {
        constructor() {
          super('test.fallback_set');
        }

        public override build(): GraphPluginBuildResult {
          return {
            namedRuleSets: {
              'fallback-set': new RuleSet(),
            },
          };
        }
      }

      const pluginRegistry = new GraphPluginRegistry({
        'test.fallback_set': new FallbackRuleSetPlugin(),
      });

      const result = resolveGraphPlugins({
        plugins: [{ plugin: 'test.fallback_set' }],
        pluginRegistry,
      });

      expect(result.namedRuleSets.names()).toEqual(['fallback-set']);
    } finally {
      Map.prototype.get = originalGet;
    }
  });

  it('shoud allow serialized rule sets without rules', () => {
    class EmptyRuleSetPlugin extends GraphPlugin {
      constructor() {
        super('test.empty_ruleset');
      }

      public override build(): GraphPluginBuildResult {
        return {
          namedRuleSets: {
            empty: {},
          },
        };
      }
    }

    const pluginRegistry = new GraphPluginRegistry({
      'test.empty_ruleset': new EmptyRuleSetPlugin(),
    });

    const result = resolveGraphPlugins({
      plugins: [{ plugin: 'test.empty_ruleset' }],
      pluginRegistry,
    });

    const serialized = result.namedRuleSets
      .resolve('test.empty_ruleset.empty')
      .serialize();

    expect(serialized.rules).toEqual([]);
  });

  it('shoud pass through serialized phase rules unchanged', () => {
    class SerializedPhasePlugin extends GraphPlugin {
      constructor() {
        super('test.serial_phase');
      }

      public override build(): GraphPluginBuildResult {
        return {
          phases: [
            {
              phase: 'main',
              rules: [
                {
                  id: 'RemoveNode',
                  config: { node: { any: true } },
                },
              ],
            },
          ],
        };
      }
    }

    const pluginRegistry = new GraphPluginRegistry({
      'test.serial_phase': new SerializedPhasePlugin(),
    });

    const result = resolveGraphPlugins({
      plugins: [{ plugin: 'test.serial_phase' }],
      pluginRegistry,
    });

    expect(result.phases).toEqual([
      {
        phase: 'main',
        rules: [
          {
            id: 'RemoveNode',
            config: { node: { any: true } },
          },
        ],
      },
    ]);
  });

  it('shoud throw when plugin phases include unsupported names', () => {
    class InvalidPhasePlugin extends GraphPlugin {
      constructor() {
        super('test.invalid_phase');
      }

      public override build(): GraphPluginBuildResult {
        const invalidPhase = {
          phase: 'invalid',
          rules: [],
        } as unknown as { phase: 'main'; rules: [] };

        return {
          phases: [invalidPhase],
        };
      }
    }

    const pluginRegistry = new GraphPluginRegistry({
      'test.invalid_phase': new InvalidPhasePlugin(),
    });

    expect(() =>
      resolveGraphPlugins({
        plugins: [{ plugin: 'test.invalid_phase' }],
        pluginRegistry,
      }),
    ).toThrow("GraphPlugin phases contains unsupported phase 'invalid'");
  });

  it('shoud throw when plugin reference is not registered', () => {
    const pluginRegistry = new GraphPluginRegistry();

    expect(() =>
      resolveGraphPlugins({
        plugins: [{ plugin: 'unknown.plugin' }],
        pluginRegistry,
      }),
    ).toThrow("GraphPlugin 'unknown.plugin' is not registered");
  });

  it('shoud pass through non-object options to plugin build', () => {
    class ObjectlessPlugin extends GraphPlugin<Record<string, unknown>> {
      public captured?: unknown;

      public constructor() {
        super('test.objectless');
      }

      public override build({
        options,
      }: GraphPluginBuildInput<Record<string, unknown>>) {
        this.captured = options;
        return {};
      }
    }

    const pluginRegistry = new GraphPluginRegistry({
      'test.objectless': new ObjectlessPlugin(),
    });

    resolveGraphPlugins({
      plugins: [{ plugin: 'test.objectless', options: 'raw' as unknown }],
      pluginRegistry,
    });

    const resolved = pluginRegistry.resolve('test.objectless');
    expect((resolved as ObjectlessPlugin).captured).toBe('raw');
  });

  it('shoud pass through non-object plugin defaults when no options are provided', () => {
    class DefaultPlugin extends GraphPlugin<Record<string, unknown>> {
      public captured?: unknown;

      constructor() {
        // biome-ignore lint/suspicious/noExplicitAny: test setup for branch coverage
        super('test.string_default', 'default' as any);
      }

      public override build({
        options,
      }: GraphPluginBuildInput<Record<string, unknown>>) {
        this.captured = options as unknown;
        return {};
      }
    }

    const pluginRegistry = new GraphPluginRegistry({
      'test.string_default': new DefaultPlugin(),
    });

    resolveGraphPlugins({
      plugins: [{ plugin: 'test.string_default' }],
      pluginRegistry,
    });

    const resolved = pluginRegistry.resolve('test.string_default');
    expect((resolved as DefaultPlugin).captured).toBe('default');
  });
});
