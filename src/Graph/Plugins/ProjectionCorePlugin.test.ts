import { GraphPluginRegistry } from '../GraphPlugin.js';
import { Profile } from '../Profile.js';
import { ProjectionCorePlugin } from './ProjectionCorePlugin.js';

describe('ProjectionCorePlugin', () => {
  it('should contribute a main phase rule through profile plugin resolution', () => {
    const registry = new GraphPluginRegistry({
      'projection.core': new ProjectionCorePlugin(),
    });
    const profile = new Profile('projection', {
      plugins: [
        {
          plugin: 'projection.core',
          options: {
            strategies: [
              {
                id: 'aws.lambda',
                trigger: {
                  attr: {
                    key: 'terraform.resource',
                    eq: 'aws_lambda_function',
                  },
                },
              },
            ],
          },
        },
      ],
    });

    const phases = profile.resolvePhases(undefined, undefined, registry);

    expect(phases).toHaveLength(1);
    expect(phases[0]).toHaveLength(1);
    expect(phases[0][0]?.serialize()).toEqual({
      id: 'DeriveProjectionGraph',
      config: {
        node: { any: true },
        options: {
          strategies: [
            {
              id: 'aws.lambda',
              trigger: {
                attr: {
                  key: 'terraform.resource',
                  eq: 'aws_lambda_function',
                },
              },
            },
          ],
        },
      },
    });
  });
});
