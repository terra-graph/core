import { Profile } from '../Graph/Profile.js';
import { ProfileRegistry } from '../Graph/ProfileRegistry.js';
import { NamedRuleRegistry } from '../Graph/Rules/NamedRuleRegistry.js';
import { NamedRuleSetRegistry } from '../Graph/Rules/NamedRuleSetRegistry.js';
import { RemoveNode } from '../Graph/Rules/Node/RemoveNode.js';
import { RuntimeCatalog } from './RuntimeCatalog.js';
import { RuntimeCatalogLoader } from './RuntimeCatalogLoader.js';

describe('RuntimeCatalogLoader.fromSerialized', () => {
  it('shoud build runtime catalog assets from serialized config', () => {
    const catalog = RuntimeCatalogLoader.fromSerialized({
      namedRules: {
        removeAlways: {
          id: 'RemoveNode',
          config: { node: { any: true } },
        },
      },
      namedRuleSets: {
        wrapper: {
          rules: [{ namedRule: 'removeAlways' }],
        },
      },
      profiles: {
        'custom.profile': {
          phases: [
            {
              phase: 'main',
              rules: [{ namedRuleSet: 'wrapper' }],
            },
          ],
        },
      },
    });

    const phases = catalog.resolveProfilePhases('custom.profile');

    expect(phases).toHaveLength(1);
    expect(phases[0]).toHaveLength(1);
    expect(phases[0][0].serialize()).toEqual({
      id: 'RemoveNode',
      config: { node: { any: true } },
    });
  });

  it('shoud resolve serialized profile inheritance by profile name', () => {
    const catalog = RuntimeCatalogLoader.fromSerialized({
      namedRules: {
        removeBase: {
          id: 'RemoveNode',
          config: { node: { attr: { key: 'label', eq: 'base' } } },
        },
        removeCurrent: {
          id: 'RemoveNode',
          config: { node: { attr: { key: 'label', eq: 'current' } } },
        },
      },
      profiles: {
        base: {
          phases: [{ phase: 'main', rules: [{ namedRule: 'removeBase' }] }],
        },
        current: {
          usesProfiles: ['base'],
          phases: [{ phase: 'main', rules: [{ namedRule: 'removeCurrent' }] }],
        },
      },
    });

    const phases = catalog.resolveProfilePhases('current');

    expect(phases).toHaveLength(2);
    expect(phases[0]).toHaveLength(1);
    expect(phases[1]).toHaveLength(1);
    expect(phases[0][0].serialize()).toEqual({
      id: 'RemoveNode',
      config: { node: { attr: { key: 'label', eq: 'base' } } },
    });
    expect(phases[1][0].serialize()).toEqual({
      id: 'RemoveNode',
      config: { node: { attr: { key: 'label', eq: 'current' } } },
    });
  });

  it('shoud support the instance fromSerialized helper', () => {
    const loader = new RuntimeCatalogLoader();
    const catalog = loader.fromSerialized({
      profiles: {
        profile: {
          phases: [],
        },
      },
    });

    expect(catalog.resolveProfilePhases('profile')).toEqual([]);
  });

  it('shoud surface missing profile definitions during resolution', () => {
    const internal = RuntimeCatalogLoader as unknown as {
      resolveProfilesFromSerialized: (
        profiles: Record<string, { phases?: [] }>,
      ) => unknown;
    };
    const originalGet = Map.prototype.get;
    let callCount = 0;
    const getSpy = jest
      .spyOn(Map.prototype, 'get')
      .mockImplementation(function (this: Map<unknown, unknown>, key) {
        callCount += 1;
        if (callCount === 2) {
          return undefined;
        }
        return originalGet.call(this, key);
      });

    try {
      expect(() =>
        internal.resolveProfilesFromSerialized({
          profile: { phases: [] },
        }),
      ).toThrow("Runtime config profile 'profile' is not defined");
    } finally {
      getSpy.mockRestore();
    }
  });

  it('shoud throw when a serialized profile references an unknown parent profile', () => {
    expect(() =>
      RuntimeCatalogLoader.fromSerialized({
        profiles: {
          current: {
            usesProfiles: ['base'],
            phases: [],
          },
        },
      }),
    ).toThrow("Runtime config profile 'current' uses unknown profile 'base'");
  });

  it('shoud throw when serialized profiles contain inheritance cycles', () => {
    expect(() =>
      RuntimeCatalogLoader.fromSerialized({
        profiles: {
          one: {
            usesProfiles: ['two'],
            phases: [],
          },
          two: {
            usesProfiles: ['one'],
            phases: [],
          },
        },
      }),
    ).toThrow(
      'Runtime config profile inheritance cycle detected: one -> two -> one',
    );
  });
});

describe('RuntimeCatalogLoader.load', () => {
  it('shoud merge provider and serialized catalogs with config precedence', () => {
    const providerCatalog = new RuntimeCatalog({
      namedRules: new NamedRuleRegistry({
        shared: new RemoveNode({
          node: { attr: { key: 'label', eq: 'provider' } },
        }),
      }),
      namedRuleSets: new NamedRuleSetRegistry({
        wrapper: {
          rules: [{ namedRule: 'shared' }],
        },
      }),
      profiles: new ProfileRegistry({
        profile: new Profile('profile', {
          phases: [{ phase: 'main', rules: [{ namedRuleSet: 'wrapper' }] }],
        }),
      }),
    });

    const catalog = RuntimeCatalogLoader.load({
      providers: [providerCatalog],
      config: {
        namedRules: {
          shared: {
            id: 'RemoveNode',
            config: { node: { attr: { key: 'label', eq: 'config' } } },
          },
        },
      },
    });

    const phases = catalog.resolveProfilePhases('profile');

    expect(phases[0][0].serialize()).toEqual({
      id: 'RemoveNode',
      config: { node: { attr: { key: 'label', eq: 'config' } } },
    });
  });

  it('shoud resolve profile inheritance from provider profiles', () => {
    const providerCatalog = new RuntimeCatalog({
      namedRules: new NamedRuleRegistry({
        removeBase: new RemoveNode({
          node: { attr: { key: 'label', eq: 'base' } },
        }),
      }),
      profiles: new ProfileRegistry({
        base: new Profile('base', {
          phases: [{ phase: 'main', rules: [{ namedRule: 'removeBase' }] }],
        }),
      }),
    });

    const catalog = RuntimeCatalogLoader.load({
      providers: [providerCatalog],
      config: {
        namedRules: {
          removeCurrent: {
            id: 'RemoveNode',
            config: { node: { attr: { key: 'label', eq: 'current' } } },
          },
        },
        profiles: {
          current: {
            usesProfiles: ['base'],
            phases: [
              { phase: 'main', rules: [{ namedRule: 'removeCurrent' }] },
            ],
          },
        },
      },
    });

    const phases = catalog.resolveProfilePhases('current');

    expect(phases).toHaveLength(2);
    expect(phases[0][0].serialize()).toEqual({
      id: 'RemoveNode',
      config: { node: { attr: { key: 'label', eq: 'base' } } },
    });
    expect(phases[1][0].serialize()).toEqual({
      id: 'RemoveNode',
      config: { node: { attr: { key: 'label', eq: 'current' } } },
    });
  });

  it('shoud return the provider catalog when config is missing', () => {
    const providerCatalog = new RuntimeCatalog({
      namedRules: new NamedRuleRegistry({
        shared: new RemoveNode({
          node: { attr: { key: 'label', eq: 'provider' } },
        }),
      }),
      namedRuleSets: new NamedRuleSetRegistry({
        wrapper: {
          rules: [{ namedRule: 'shared' }],
        },
      }),
      profiles: new ProfileRegistry({
        profile: new Profile('profile', {
          phases: [{ phase: 'main', rules: [{ namedRuleSet: 'wrapper' }] }],
        }),
      }),
    });

    const catalog = RuntimeCatalogLoader.load({
      providers: [providerCatalog],
    });

    const phases = catalog.resolveProfilePhases('profile');

    expect(phases[0][0].serialize()).toEqual({
      id: 'RemoveNode',
      config: { node: { attr: { key: 'label', eq: 'provider' } } },
    });
  });

  it('shoud load serialized config when no providers are supplied', () => {
    const catalog = RuntimeCatalogLoader.load({
      config: {
        profiles: {
          profile: {
            phases: [],
          },
        },
      },
    });

    expect(catalog.resolveProfilePhases('profile')).toEqual([]);
  });

  it('shoud load an empty catalog when no input is provided', () => {
    const catalog = RuntimeCatalogLoader.load();

    expect(catalog).toBeInstanceOf(RuntimeCatalog);
  });

  it('shoud support the instance loader API', () => {
    const loader = new RuntimeCatalogLoader({
      config: {
        namedRules: {
          removeAlways: {
            id: 'RemoveNode',
            config: { node: { any: true } },
          },
        },
        profiles: {
          profile: {
            phases: [{ phase: 'main', rules: [{ namedRule: 'removeAlways' }] }],
          },
        },
      },
    });

    const catalog = loader.load();
    const phases = catalog.resolveProfilePhases('profile');

    expect(phases).toHaveLength(1);
    expect(phases[0]).toHaveLength(1);
    expect(phases[0][0].serialize()).toEqual({
      id: 'RemoveNode',
      config: { node: { any: true } },
    });
  });
});

describe('RuntimeCatalogLoader.resolveProfilesFromSerialized (external profiles)', () => {
  it('shoud resolve external profiles referenced by name', () => {
    const providerCatalog = new RuntimeCatalog({
      namedRules: new NamedRuleRegistry({
        removeBase: new RemoveNode({
          node: { attr: { key: 'label', eq: 'base' } },
        }),
      }),
      profiles: new ProfileRegistry({
        base: new Profile('base', {
          phases: [{ phase: 'main', rules: [{ namedRule: 'removeBase' }] }],
        }),
      }),
    });

    const catalog = RuntimeCatalogLoader.load({
      providers: [providerCatalog],
      config: {
        profiles: {
          current: {
            usesProfiles: ['base'],
            phases: [],
          },
        },
      },
    });

    const phases = catalog.resolveProfilePhases('current');

    expect(phases).toHaveLength(1);
    expect(phases[0][0].serialize()).toEqual({
      id: 'RemoveNode',
      config: { node: { attr: { key: 'label', eq: 'base' } } },
    });
  });

  it('shoud reuse cached external profiles across multiple definitions', () => {
    const providerCatalog = new RuntimeCatalog({
      namedRules: new NamedRuleRegistry({
        removeBase: new RemoveNode({
          node: { attr: { key: 'label', eq: 'base' } },
        }),
      }),
      profiles: new ProfileRegistry({
        base: new Profile('base', {
          phases: [{ phase: 'main', rules: [{ namedRule: 'removeBase' }] }],
        }),
      }),
    });

    const catalog = RuntimeCatalogLoader.load({
      providers: [providerCatalog],
      config: {
        profiles: {
          currentA: {
            usesProfiles: ['base'],
            phases: [],
          },
          currentB: {
            usesProfiles: ['base'],
            phases: [],
          },
        },
      },
    });

    expect(catalog.resolveProfilePhases('currentA')).toHaveLength(1);
    expect(catalog.resolveProfilePhases('currentB')).toHaveLength(1);
  });

  it('shoud resolve external profiles via registry resolve', () => {
    const externalProfiles = new ProfileRegistry({
      base: new Profile('base', {
        phases: [],
      }),
    });
    const resolveSpy = jest.spyOn(externalProfiles, 'resolve');

    const catalog = RuntimeCatalogLoader.fromSerialized(
      {
        profiles: {
          current: {
            usesProfiles: ['base'],
            phases: [],
          },
        },
      },
      undefined,
      externalProfiles,
    );

    catalog.resolveProfilePhases('current');

    expect(resolveSpy).toHaveBeenCalledWith('base');
  });

  it('shoud serialize external profiles when resolving', () => {
    const externalProfiles = new ProfileRegistry({
      base: new Profile('base', {
        phases: [],
      }),
    });
    const resolveSpy = jest.spyOn(externalProfiles, 'resolve');
    const serializeSpy = jest.spyOn(Profile.prototype, 'serialize');

    const catalog = RuntimeCatalogLoader.fromSerialized(
      {
        profiles: {
          current: {
            usesProfiles: ['base'],
            phases: [],
          },
        },
      },
      undefined,
      externalProfiles,
    );

    catalog.resolveProfilePhases('current');

    expect(resolveSpy).toHaveBeenCalledWith('base');
    expect(serializeSpy).toHaveBeenCalled();

    resolveSpy.mockRestore();
    serializeSpy.mockRestore();
  });
});

describe('RuntimeCatalogLoader.resolveProfilesFromSerialized (external profile instances)', () => {
  it('shoud use resolved external profile definitions', () => {
    const externalProfiles = new ProfileRegistry({
      base: new Profile('base', {
        phases: [
          {
            phase: 'main',
            rules: [
              new RemoveNode({
                node: { any: true },
              }),
            ],
          },
        ],
      }),
    });
    const resolveSpy = jest.spyOn(externalProfiles, 'resolve');

    const catalog = RuntimeCatalogLoader.fromSerialized(
      {
        profiles: {
          current: {
            usesProfiles: ['base'],
            phases: [],
          },
        },
      },
      undefined,
      externalProfiles,
    );

    const phases = catalog.resolveProfilePhases('current');

    expect(resolveSpy).toHaveBeenCalledWith('base');
    expect(phases).toHaveLength(1);
    expect(phases[0][0].serialize()).toEqual({
      id: 'RemoveNode',
      config: { node: { any: true } },
    });
  });
});

describe('RuntimeCatalogLoader.resolveProfilesFromSerialized (external profile branch)', () => {
  it('shoud hit the externalProfile branch when resolve returns a profile', () => {
    const externalProfile = new Profile('base', {
      phases: [],
    });
    const externalProfiles = {
      names: () => ['base'],
      resolve: jest.fn(() => externalProfile),
    } as unknown as ProfileRegistry;

    const internal = RuntimeCatalogLoader as unknown as {
      resolveProfilesFromSerialized: (
        profiles: Record<string, { usesProfiles?: string[]; phases?: [] }>,
        supported?: unknown,
        external?: ProfileRegistry,
      ) => ProfileRegistry;
    };

    const registry = internal.resolveProfilesFromSerialized(
      {
        current: {
          usesProfiles: ['base'],
          phases: [],
        },
      },
      undefined,
      externalProfiles,
    );

    registry.resolve('current');

    expect(externalProfiles.resolve).toHaveBeenCalledWith('base');
  });

  it('shoud throw when external profile name exists but resolve returns undefined', () => {
    const externalProfiles = {
      names: () => ['base'],
      resolve: jest.fn(() => undefined),
    } as unknown as ProfileRegistry;

    const internal = RuntimeCatalogLoader as unknown as {
      resolveProfilesFromSerialized: (
        profiles: Record<string, { usesProfiles?: string[]; phases?: [] }>,
        supported?: unknown,
        external?: ProfileRegistry,
      ) => ProfileRegistry;
    };

    expect(() =>
      internal.resolveProfilesFromSerialized(
        {
          current: {
            usesProfiles: ['base'],
            phases: [],
          },
        },
        undefined,
        externalProfiles,
      ),
    ).toThrow(`Runtime config profile 'current' uses unknown profile 'base'`);
  });
});
