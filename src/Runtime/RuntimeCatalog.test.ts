import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from '../Graph/Adapters/GraphologyAdapter.js';
import { GraphPlugin, GraphPluginRegistry } from '../Graph/GraphPlugin.js';
import { Profile } from '../Graph/Profile.js';
import { ProfileRegistry } from '../Graph/ProfileRegistry.js';
import { JsonRenderer } from '../Graph/Renderers/JsonRenderer.js';
import { RendererRegistry } from '../Graph/Renderers/RendererRegistry.js';
import { NamedRuleRegistry } from '../Graph/Rules/NamedRuleRegistry.js';
import { NamedRuleSetRegistry } from '../Graph/Rules/NamedRuleSetRegistry.js';
import { RemoveNode } from '../Graph/Rules/Node/RemoveNode.js';
import { StdoutArtifactWriter } from '../Output/ArtifactWriter/StdoutArtifactWriter.js';
import { WriterRegistry } from '../Output/Writers/WriterRegistry.js';
import { RuntimeCatalog } from './RuntimeCatalog.js';

describe('RuntimeCatalog.from', () => {
  it('shoud combine providers into one runtime catalog', () => {
    const namedRules = new NamedRuleRegistry({
      ruleOne: new RemoveNode({
        node: { any: true },
      }),
    });
    const namedRuleSets = new NamedRuleSetRegistry({
      setOne: {
        rules: [{ namedRule: 'ruleOne' }],
      },
    });
    const profiles = new ProfileRegistry({
      'example.profile': new Profile('example.profile', {}),
    });

    class ExamplePlugin extends GraphPlugin {
      constructor() {
        super('example.plugin');
      }

      public override build() {
        return {};
      }
    }
    const plugins = new GraphPluginRegistry({
      'example.plugin': new ExamplePlugin(),
    });
    const renderers = new RendererRegistry({
      json: () => new JsonRenderer(),
    });
    const writers = new WriterRegistry({
      stdout: () => new StdoutArtifactWriter(),
    });

    const catalog = RuntimeCatalog.from([
      { namedRules },
      { namedRuleSets },
      { profiles },
      { plugins },
      { renderers },
      { writers },
    ]);

    expect(catalog.namedRules.names()).toEqual(['ruleOne']);
    expect(catalog.namedRuleSets.names()).toEqual(['setOne']);
    expect(catalog.profiles.names()).toEqual(['example.profile']);
    expect(catalog.plugins.names()).toEqual(['example.plugin']);
    expect(catalog.renderers.list()).toEqual(['json']);
    expect(catalog.writers.list()).toEqual(['stdout']);
  });

  it('shoud prefer later providers when names collide', () => {
    const first = RuntimeCatalog.from([
      {
        namedRules: new NamedRuleRegistry({
          shared: new RemoveNode({
            node: { attr: { key: 'label', eq: 'first' } },
          }),
        }),
      },
    ]);
    const second = {
      namedRules: new NamedRuleRegistry({
        shared: new RemoveNode({
          node: { attr: { key: 'label', eq: 'second' } },
        }),
      }),
    };

    const combined = first.use(second);
    const resolved = combined.namedRules.resolve('shared');

    expect(resolved.serialize()).toEqual({
      id: 'RemoveNode',
      config: { node: { attr: { key: 'label', eq: 'second' } } },
    });
  });
});

describe('RuntimeCatalog.resolveProfile', () => {
  it('shoud resolve a profile by name', () => {
    const profile = new Profile('example.profile', {});
    const catalog = new RuntimeCatalog({
      profiles: new ProfileRegistry({
        'example.profile': profile,
      }),
    });

    expect(catalog.resolveProfile('example.profile')).toBe(profile);
  });
});

describe('RuntimeCatalog.resolveProfilePhases', () => {
  it('shoud resolve phases using catalog registries', () => {
    const profile = new Profile('example.profile', {
      phases: [
        {
          phase: 'main',
          rules: [{ namedRuleSet: 'wrapper' }],
        },
      ],
    });
    const catalog = new RuntimeCatalog({
      profiles: new ProfileRegistry({
        'example.profile': profile,
      }),
      namedRules: new NamedRuleRegistry({
        removeAlways: new RemoveNode({
          node: { any: true },
        }),
      }),
      namedRuleSets: new NamedRuleSetRegistry({
        wrapper: {
          rules: [{ namedRule: 'removeAlways' }],
        },
      }),
    });

    const phases = catalog.resolveProfilePhases('example.profile');

    expect(phases).toHaveLength(1);
    expect(phases[0]).toHaveLength(1);
    expect(phases[0][0].serialize()).toEqual({
      id: 'RemoveNode',
      config: { node: { any: true } },
    });
  });
});

describe('RuntimeCatalog.resolveProfileRendererOptions', () => {
  it('shoud resolve renderer options through the profile registry', () => {
    const profile = new Profile<{ graph: { rankdir: string } }>(
      'example.profile',
      {
        render: {
          options: {
            graph: { rankdir: 'LR' },
          },
        },
      },
    );
    const catalog = new RuntimeCatalog({
      profiles: new ProfileRegistry({
        'example.profile': profile,
      }),
    });

    const options = catalog.resolveProfileRendererOptions<{
      graph: { rankdir: string };
    }>('example.profile');

    expect(options).toEqual({
      graph: { rankdir: 'LR' },
    });
  });
});

describe('RuntimeCatalog.resolveProfileRenderer', () => {
  it('shoud resolve renderer by name through the profile registry', () => {
    const profile = new Profile('example.profile', {
      render: { renderer: 'dot' },
    });
    const catalog = new RuntimeCatalog({
      profiles: new ProfileRegistry({
        'example.profile': profile,
      }),
    });

    expect(catalog.resolveProfileRenderer('example.profile')).toBe('dot');
  });
});

describe('RuntimeCatalog.resolveProfileMetadata', () => {
  it('shoud resolve metadata through the profile registry', () => {
    const profile = new Profile('example.profile', {
      metadata: {
        environment: {
          name: 'prod',
        },
      },
    });
    const catalog = new RuntimeCatalog({
      profiles: new ProfileRegistry({
        'example.profile': profile,
      }),
    });

    expect(catalog.resolveProfileMetadata('example.profile')).toEqual({
      environment: {
        name: 'prod',
      },
    });
  });
});

describe('RuntimeCatalog.use', () => {
  it('shoud preserve existing registries when provider omits them', () => {
    const base = new RuntimeCatalog({
      namedRules: new NamedRuleRegistry({
        baseRule: new RemoveNode({ node: { any: true } }),
      }),
    });

    const updated = base.use({
      profiles: new ProfileRegistry({
        'example.profile': new Profile('example.profile', {}),
      }),
    });

    expect(updated.namedRules.names()).toEqual(['baseRule']);
    expect(updated.profiles.names()).toEqual(['example.profile']);
  });

  it('shoud preserve renderer and writer registries when provider omits them', () => {
    const base = new RuntimeCatalog({
      renderers: new RendererRegistry({
        json: () => new JsonRenderer(),
      }),
      writers: new WriterRegistry({
        stdout: () => new StdoutArtifactWriter(),
      }),
    });

    const updated = base.use({
      profiles: new ProfileRegistry({
        'example.profile': new Profile('example.profile', {}),
      }),
    });

    expect(updated.renderers.list()).toEqual(['json']);
    expect(updated.writers.list()).toEqual(['stdout']);
  });
});

describe('RuntimeCatalog.resolveRenderer', () => {
  it('shoud resolve renderers through the renderer registry', () => {
    const factory = jest.fn(() => new JsonRenderer());
    const catalog = new RuntimeCatalog({
      renderers: new RendererRegistry({
        json: factory,
      }),
    });
    const adapter = new GraphologyAdapter(new DirectedGraph());

    const renderer = catalog.resolveRenderer('json', adapter, { pretty: true });

    expect(factory).toHaveBeenCalledWith({
      adapter,
      options: { pretty: true },
    });
    expect(renderer).toBeInstanceOf(JsonRenderer);
  });
});

describe('RuntimeCatalog.resolveWriter', () => {
  it('shoud resolve writers through the writer registry', () => {
    const factory = jest.fn(() => new StdoutArtifactWriter());
    const catalog = new RuntimeCatalog({
      writers: new WriterRegistry({
        stdout: factory,
      }),
    });

    const writer = catalog.resolveWriter('stdout', { flush: true });

    expect(factory).toHaveBeenCalledWith({
      options: { flush: true },
    });
    expect(writer).toBeInstanceOf(StdoutArtifactWriter);
  });
});
