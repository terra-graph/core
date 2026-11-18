import { RemoveNode } from '../../Graph/Rules/Node/RemoveNode.js';
import { RuntimeCatalogFromConfigBuilder } from './RuntimeCatalogFromConfigBuilder.js';

describe('RuntimeCatalogFromConfigBuilder.build', () => {
  it('shoud build a runtime catalog from serialized runtime config', () => {
    const builder = new RuntimeCatalogFromConfigBuilder();

    const catalog = builder.build({
      config: {
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
      },
    });

    const phases = catalog.resolveProfilePhases('profile');

    expect(phases).toHaveLength(1);
    expect(phases[0]).toHaveLength(1);
    expect(phases[0][0].serialize()).toEqual({
      id: RemoveNode.name,
      config: { node: { any: true } },
    });
  });
});
