import { RemoveNode } from '../../Graph/Rules/Node/RemoveNode.js';
import { ZodRuntimeConfigValidator } from './ZodRuntimeConfigValidator.js';

describe('ZodRuntimeConfigValidator.validate', () => {
  it('shoud validate and return serialized runtime config', () => {
    const validator = new ZodRuntimeConfigValidator();

    const result = validator.validate({
      providers: ['@acme/terra-provider'],
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
    });

    expect(result.profiles?.profile.phases).toHaveLength(1);
    expect(result.providers).toEqual(['@acme/terra-provider']);
  });

  it('shoud throw when serialized runtime config is invalid', () => {
    const validator = new ZodRuntimeConfigValidator();

    expect(() =>
      validator.validate({
        profiles: {
          profile: {
            phases: [{ phase: 'invalid_phase', rules: [] }],
          },
        },
      }),
    ).toThrow();
  });

  it('shoud allow unknown profile references in usesProfiles', () => {
    const validator = new ZodRuntimeConfigValidator();

    const result = validator.validate({
      profiles: {
        child: {
          usesProfiles: ['missing'],
          phases: [],
        },
      },
    });

    expect(result.profiles?.child.usesProfiles).toEqual(['missing']);
  });

  it('shoud accept profiles that reference known parents', () => {
    const validator = new ZodRuntimeConfigValidator();

    const result = validator.validate({
      profiles: {
        base: {
          phases: [],
        },
        child: {
          usesProfiles: ['base'],
          phases: [],
        },
      },
    });

    expect(result.profiles?.child.usesProfiles).toEqual(['base']);
  });
});
