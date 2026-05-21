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

  it('shoud validate run.outputs', () => {
    const validator = new ZodRuntimeConfigValidator();

    const result = validator.validate({
      profiles: {
        base: {
          phases: [],
        },
      },
      run: {
        profile: 'base',
        outputs: [
          {
            renderer: 'dot',
            transformers: ['dotcli'],
            writer: 'file',
            writerOptions: {
              target: './diagram.png',
            },
            options: {
              graph: {
                ranksep: 6,
              },
            },
          },
          {
            renderer: 'json',
            writer: 'file',
            writerOptions: {
              target: './diagram.json',
            },
          },
        ],
      },
    });

    expect(result.run?.outputs).toHaveLength(2);
    expect(result.run?.outputs?.[0]?.renderer).toBe('dot');
    expect(result.run?.outputs?.[1]?.renderer).toBe('json');
  });

  it('shoud allow non-file writers without writerOptions.target', () => {
    const validator = new ZodRuntimeConfigValidator();

    const result = validator.validate({
      profiles: {
        base: {
          phases: [],
        },
      },
      run: {
        profile: 'base',
        outputs: [
          {
            renderer: 'json',
            writer: 'stdout',
          },
        ],
      },
    });

    expect(result.run?.outputs?.[0]?.writer).toBe('stdout');
  });

  it("shoud require writerOptions.target when writer is 'file'", () => {
    const validator = new ZodRuntimeConfigValidator();

    expect(() =>
      validator.validate({
        profiles: {
          base: {
            phases: [],
          },
        },
        run: {
          profile: 'base',
          outputs: [
            {
              renderer: 'json',
              writer: 'file',
            },
          ],
        },
      }),
    ).toThrow(
      "run.outputs[].writerOptions.target is required when writer is 'file'",
    );
  });

  it('shoud reject legacy outWriter and outFile fields', () => {
    const validator = new ZodRuntimeConfigValidator();

    expect(() =>
      validator.validate({
        profiles: {
          base: {
            phases: [],
          },
        },
        run: {
          profile: 'base',
          outputs: [
            {
              renderer: 'json',
              outWriter: 'file',
              outFile: './diagram.json',
            },
          ],
        },
      }),
    ).toThrow();
  });

  it('shoud validate plugin refs with slot keys', () => {
    const validator = new ZodRuntimeConfigValidator();

    const result = validator.validate({
      profiles: {
        base: {
          plugins: [
            {
              plugin: 'aws.AwsApiGateway',
              slot: 'api.gateway',
              options: { mode: 'minimal' },
            },
          ],
          phases: [],
        },
      },
    });

    expect(result.profiles?.base.plugins?.[0]).toEqual({
      plugin: 'aws.AwsApiGateway',
      slot: 'api.gateway',
      options: { mode: 'minimal' },
    });
  });

  it('shoud reject legacy run.render', () => {
    const validator = new ZodRuntimeConfigValidator();

    expect(() =>
      validator.validate({
        profiles: {
          base: {
            phases: [],
          },
        },
        run: {
          profile: 'base',
          render: {
            renderer: 'dot',
          },
        },
      }),
    ).toThrow();
  });
});
