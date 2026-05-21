import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DotAdapter } from '../Graph/Adapters/DotAdapter.js';
import { Profile } from '../Graph/Profile.js';
import { ProfileRegistry } from '../Graph/ProfileRegistry.js';
import { JsonRenderer } from '../Graph/Renderers/JsonRenderer.js';
import { RendererRegistry } from '../Graph/Renderers/RendererRegistry.js';
import { NamedRuleRegistry } from '../Graph/Rules/NamedRuleRegistry.js';
import { NamedRuleSetRegistry } from '../Graph/Rules/NamedRuleSetRegistry.js';
import { RemoveNode } from '../Graph/Rules/Node/RemoveNode.js';
import { StdoutArtifactWriter } from '../Output/ArtifactWriter/StdoutArtifactWriter.js';
import { WriterRegistry } from '../Output/Writers/WriterRegistry.js';
import { RuntimeConfigLoader } from './RuntimeConfigLoader.js';
import { RuntimeConfigParser } from './RuntimeConfigParser.js';
import { RuntimeConfigParserRegistry } from './RuntimeConfigParserRegistry.js';
import { FileRuntimeConfigSource } from './RuntimeConfigSource/FileRuntimeConfigSource.js';
import { InMemoryRuntimeConfigSource } from './RuntimeConfigSource/InMemoryRuntimeConfigSource.js';
import { RuntimeProvider } from './RuntimeProvider.js';
import {
  RuntimeProviderLoadInput,
  RuntimeProviderLoader,
} from './RuntimeProviderLoader.js';

describe('RuntimeConfigParserRegistry.resolve', () => {
  it('shoud resolve default json and yaml parsers', () => {
    const registry = RuntimeConfigParserRegistry.defaults();

    expect(registry.resolve('json').parse('{"a":1}')).toEqual({ a: 1 });
    expect(registry.resolve('yaml').parse('value: ok')).toEqual({
      value: 'ok',
    });
  });

  it('shoud throw when no parser is registered for a format', () => {
    const registry = RuntimeConfigParserRegistry.defaults();

    expect(() => registry.resolve('toml')).toThrow(
      "No RuntimeConfigParser registered for format 'toml'",
    );
  });
});

describe('FileRuntimeConfigSource.read', () => {
  it('shoud read file contents and infer format from file extension', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runtime-config-loader-'));
    const filePath = join(dir, 'runtime.json');
    await writeFile(filePath, '{"profiles":{}}', 'utf8');

    try {
      const source = new FileRuntimeConfigSource(filePath);
      const doc = await source.read();

      expect(doc.content).toBe('{"profiles":{}}');
      expect(doc.format).toBe('json');
      expect(doc.reference).toBe(filePath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('RuntimeConfigLoader.load', () => {
  it('shoud load a runtime catalog from in-memory json config', async () => {
    const source = new InMemoryRuntimeConfigSource(
      JSON.stringify({
        namedRules: {
          removeAlways: {
            id: RemoveNode.name,
            config: { node: { any: true } },
          },
        },
        profiles: {
          profile: {
            phases: [{ phase: 'main', rules: [{ namedRule: 'removeAlways' }] }],
          },
        },
      }),
    );
    const loader = new RuntimeConfigLoader();

    const loaded = await loader.load({ source });
    const phases = loaded.catalog.resolveProfilePhases('profile');

    expect(phases).toHaveLength(1);
    expect(phases[0]).toHaveLength(1);
    expect(phases[0][0].serialize()).toEqual({
      id: 'RemoveNode',
      config: { node: { any: true } },
    });
  });

  it('shoud load a runtime catalog from in-memory yaml config', async () => {
    const source = new InMemoryRuntimeConfigSource(
      `
namedRules:
  removeAlways:
    id: RemoveNode
    config:
      node:
        any: true
profiles:
  profile:
    phases:
      - phase: main
        rules:
          - namedRule: removeAlways
`,
      'yaml',
    );
    const loader = new RuntimeConfigLoader();

    const loaded = await loader.load({ source });
    const phases = loaded.catalog.resolveProfilePhases('profile');

    expect(phases).toHaveLength(1);
    expect(phases[0]).toHaveLength(1);
    expect(phases[0][0].serialize()).toEqual({
      id: 'RemoveNode',
      config: { node: { any: true } },
    });
  });

  it('shoud fail when runtime config schema validation fails', async () => {
    const source = new InMemoryRuntimeConfigSource(
      JSON.stringify({
        profiles: {
          profile: {
            phases: [{ phase: 'invalid_phase', rules: [] }],
          },
        },
      }),
    );
    const loader = new RuntimeConfigLoader();

    await expect(loader.load({ source })).rejects.toThrow(
      /Runtime config validation failed:/,
    );
  });

  it('shoud support custom parsers via dependency injection', async () => {
    class FakeYamlParser implements RuntimeConfigParser {
      public supports(format: string): boolean {
        return format === 'yaml';
      }

      public parse(_content: string): unknown {
        return {
          namedRules: {
            removeAlways: {
              id: RemoveNode.name,
              config: { node: { any: true } },
            },
          },
          profiles: {
            profile: {
              phases: [
                { phase: 'main', rules: [{ namedRule: 'removeAlways' }] },
              ],
            },
          },
        };
      }
    }

    const parserRegistry = new RuntimeConfigParserRegistry([
      new FakeYamlParser(),
    ]);
    const loader = new RuntimeConfigLoader({ parserRegistry });
    const source = new InMemoryRuntimeConfigSource(
      'profiles:\n  profile: {}',
      'yaml',
    );

    const loaded = await loader.load({ source });
    const phases = loaded.catalog.resolveProfilePhases('profile');

    expect(phases).toHaveLength(1);
    expect(phases[0]).toHaveLength(1);
    expect(phases[0][0].serialize()).toEqual({
      id: 'RemoveNode',
      config: { node: { any: true } },
    });
  });

  it('shoud infer the config format from the source reference', async () => {
    class ReferencedSource {
      public async read(): Promise<{
        content: string;
        format?: string;
        reference?: string;
      }> {
        return {
          content: JSON.stringify({
            profiles: {
              profile: { phases: [] },
            },
          }),
          reference: '/tmp/runtime.json',
        };
      }
    }

    const loader = new RuntimeConfigLoader();
    const loaded = await loader.load({ source: new ReferencedSource() });

    expect(loaded.catalog.resolveProfilePhases('profile')).toEqual([]);
  });

  it('shoud fail when source format is unknown', async () => {
    const source = new InMemoryRuntimeConfigSource('{}', 'custom');
    const loader = new RuntimeConfigLoader();

    await expect(loader.load({ source })).rejects.toThrow(
      "Failed to parse runtime config as 'custom': No RuntimeConfigParser registered for format 'custom'",
    );
  });

  it('shoud fail when runtime config format cannot be inferred', async () => {
    class UnknownFormatSource {
      public async read(): Promise<{
        content: string;
        format?: string;
        reference?: string;
      }> {
        return { content: '{}' };
      }
    }

    const source = new UnknownFormatSource();
    const loader = new RuntimeConfigLoader();

    await expect(loader.load({ source })).rejects.toThrow(
      'Unable to determine runtime config format',
    );
  });

  it('shoud include the source reference when format inference fails', async () => {
    class UnknownReferencedSource {
      public async read(): Promise<{
        content: string;
        format?: string;
        reference?: string;
      }> {
        return { content: '{}', reference: '/tmp/runtime.unknown' };
      }
    }

    const loader = new RuntimeConfigLoader();

    await expect(
      loader.load({ source: new UnknownReferencedSource() }),
    ).rejects.toThrow(
      "Unable to determine runtime config format from '/tmp/runtime.unknown'",
    );
  });

  it('shoud surface non-error parser failures', async () => {
    class ThrowingParser implements RuntimeConfigParser {
      public supports(format: string): boolean {
        return format === 'json';
      }

      public parse(_content: string): unknown {
        throw 'parser-failed';
      }
    }

    const parserRegistry = new RuntimeConfigParserRegistry([
      new ThrowingParser(),
    ]);
    const loader = new RuntimeConfigLoader({ parserRegistry });
    const source = new InMemoryRuntimeConfigSource('{}', 'json');

    await expect(loader.load({ source })).rejects.toThrow(
      "Failed to parse runtime config as 'json': parser-failed",
    );
  });

  it('shoud surface non-error validation failures', async () => {
    const validator = {
      validate(_input: unknown) {
        throw 'validation-failed';
      },
    };
    const loader = new RuntimeConfigLoader({ validator });
    const source = new InMemoryRuntimeConfigSource('{}', 'json');

    await expect(loader.load({ source })).rejects.toThrow(
      'Runtime config validation failed: validation-failed',
    );
  });

  it('shoud surface non-error provider load failures', async () => {
    class ThrowingProviderLoader implements RuntimeProviderLoader {
      public async load(
        _input: RuntimeProviderLoadInput,
      ): Promise<RuntimeProvider> {
        throw 'provider-failed';
      }
    }

    const loader = new RuntimeConfigLoader({
      providerLoader: new ThrowingProviderLoader(),
    });
    const source = new InMemoryRuntimeConfigSource(
      JSON.stringify({
        providers: ['@example/runtime-provider'],
        profiles: {
          profile: {
            phases: [],
          },
        },
      }),
      'json',
    );

    await expect(loader.load({ source })).rejects.toThrow(
      "Failed to load runtime provider '@example/runtime-provider': provider-failed",
    );
  });

  it('shoud return validated config alongside catalog with load', async () => {
    const source = new InMemoryRuntimeConfigSource(
      JSON.stringify({
        profiles: {
          profile: {
            phases: [],
          },
        },
        run: {
          profile: 'profile',
        },
      }),
    );
    const loader = new RuntimeConfigLoader();

    const loaded = await loader.load({ source });

    expect(loaded.config.run?.profile).toBe('profile');
    expect(loaded.catalog.resolveProfilePhases('profile')).toEqual([]);
  });

  it('shoud load runtime providers declared in config and merge adapter support registries', async () => {
    class FakeRuntimeProviderLoader implements RuntimeProviderLoader {
      public async load(
        _input: RuntimeProviderLoadInput,
      ): Promise<RuntimeProvider> {
        return {
          supportedAdapterOperationsRegistry: {
            ExternalDotAdapter: DotAdapter,
          },
        };
      }
    }

    const source = new InMemoryRuntimeConfigSource(
      JSON.stringify({
        providers: ['@example/runtime-provider'],
        profiles: {
          profile: {
            supports: 'ExternalDotAdapter',
            phases: [],
          },
        },
      }),
      'json',
      '/tmp/runtime.json',
    );

    const loader = new RuntimeConfigLoader({
      providerLoader: new FakeRuntimeProviderLoader(),
    });
    const loaded = await loader.load({ source });
    const profile = loaded.catalog.resolveProfile('profile');

    expect(profile.supports).toBe(DotAdapter);
  });

  it('shoud merge base provider adapter support registries configured on the loader', async () => {
    const source = new InMemoryRuntimeConfigSource(
      JSON.stringify({
        profiles: {
          profile: {
            supports: 'ExternalDotAdapter',
            phases: [],
          },
        },
      }),
      'json',
      '/tmp/runtime.json',
    );

    const loader = new RuntimeConfigLoader({
      baseProviders: [
        {
          supportedAdapterOperationsRegistry: {
            ExternalDotAdapter: DotAdapter,
          },
        },
      ],
    });
    const loaded = await loader.load({ source });
    const profile = loaded.catalog.resolveProfile('profile');

    expect(profile.supports).toBe(DotAdapter);
  });

  it('shoud merge provider catalog contributions declared in config', async () => {
    class FakeRuntimeProviderLoader implements RuntimeProviderLoader {
      public async load(
        _input: RuntimeProviderLoadInput,
      ): Promise<RuntimeProvider> {
        return {
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
          profiles: new ProfileRegistry({
            'provider.profile': new Profile('provider.profile', {
              phases: [{ phase: 'main', rules: [{ namedRuleSet: 'wrapper' }] }],
            }),
          }),
        };
      }
    }

    const source = new InMemoryRuntimeConfigSource(
      JSON.stringify({
        providers: ['@example/runtime-provider'],
      }),
      'json',
      '/tmp/runtime.json',
    );
    const loader = new RuntimeConfigLoader({
      providerLoader: new FakeRuntimeProviderLoader(),
    });
    const loaded = await loader.load({ source });
    const phases = loaded.catalog.resolveProfilePhases('provider.profile');

    expect(phases).toHaveLength(1);
    expect(phases[0]).toHaveLength(1);
    expect(phases[0][0].serialize()).toEqual({
      id: 'RemoveNode',
      config: { node: { any: true } },
    });
  });

  it('shoud merge renderer and writer registries declared by runtime providers', async () => {
    class FakeRuntimeProviderLoader implements RuntimeProviderLoader {
      public async load(
        _input: RuntimeProviderLoadInput,
      ): Promise<RuntimeProvider> {
        return {
          renderers: new RendererRegistry({
            json: () => new JsonRenderer(),
          }),
          writers: new WriterRegistry({
            stdout: () => new StdoutArtifactWriter(),
          }),
        };
      }
    }

    const source = new InMemoryRuntimeConfigSource(
      JSON.stringify({
        providers: ['@example/runtime-provider'],
        profiles: {
          profile: {
            phases: [],
          },
        },
      }),
      'json',
      '/tmp/runtime.json',
    );
    const loader = new RuntimeConfigLoader({
      providerLoader: new FakeRuntimeProviderLoader(),
    });

    const loaded = await loader.load({ source });

    expect(loaded.catalog.renderers.list()).toEqual(['json']);
    expect(loaded.catalog.writers.list()).toEqual(['stdout']);
  });

  it('shoud throw a contextual error when loading a runtime provider fails', async () => {
    class ThrowingRuntimeProviderLoader implements RuntimeProviderLoader {
      public async load(
        _input: RuntimeProviderLoadInput,
      ): Promise<RuntimeProvider> {
        throw new Error('boom');
      }
    }

    const source = new InMemoryRuntimeConfigSource(
      JSON.stringify({
        providers: ['@example/broken-provider'],
      }),
      'json',
      '/tmp/runtime.json',
    );
    const loader = new RuntimeConfigLoader({
      providerLoader: new ThrowingRuntimeProviderLoader(),
    });

    await expect(loader.load({ source })).rejects.toThrow(
      "Failed to load runtime provider '@example/broken-provider': boom",
    );
  });
});
