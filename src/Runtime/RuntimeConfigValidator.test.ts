import { RuntimeConfigValidator } from './RuntimeConfigValidator.js';

describe('RuntimeConfigValidator.validate', () => {
  it('shoud allow implementations to return serialized runtime config', () => {
    class PassthroughValidator implements RuntimeConfigValidator {
      public validate(input: unknown) {
        return input as {
          profiles: {
            profile: {
              phases: [];
            };
          };
        };
      }
    }

    const validator = new PassthroughValidator();
    const input = {
      profiles: {
        profile: {
          phases: [],
        },
      },
    };

    expect(validator.validate(input)).toEqual(input);
  });

  it('shoud allow implementations to throw validation errors', () => {
    class ThrowingValidator implements RuntimeConfigValidator {
      public validate(_input: unknown) {
        throw new Error('invalid-runtime-config');
        // Unreachable return keeps the method aligned with the contract type.
        // biome-ignore lint/correctness/noUnreachable: <explanation>
        return {
          profiles: {},
        };
      }
    }

    const validator = new ThrowingValidator();

    expect(() =>
      validator.validate({
        profiles: {
          profile: {
            phases: [],
          },
        },
      }),
    ).toThrow('invalid-runtime-config');
  });
});
