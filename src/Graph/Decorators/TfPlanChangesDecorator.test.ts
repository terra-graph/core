import {
  TG_SCHEMA_VERSION,
  TgGraph,
  asEdgeId,
  tgNodeIdFrom,
} from '../TgGraph.js';
import { TfPlanChangesDecorator } from './TfPlanChangesDecorator.js';

const toResourceNodeId = (address: string) => tgNodeIdFrom('resource', address);

const buildGraph = (addresses: string[]): TgGraph => {
  const nodes = Object.fromEntries(
    addresses.map((address) => {
      const id = toResourceNodeId(address);
      return [
        id,
        {
          id,
          terraform: {
            kind: 'resource' as const,
            address,
            resource: address.split('.').slice(-2, -1)[0] ?? 'resource',
            name: address.split('.').at(-1) ?? address,
          },
        },
      ];
    }),
  ) as TgGraph['nodes'];

  return {
    schemaVersion: TG_SCHEMA_VERSION,
    description: {},
    nodes,
    edges: [],
  };
};

describe('TfPlanChangesDecorator.decorate', () => {
  it('shoud attach matched resource_changes as graph-level change evidence', () => {
    const graph = buildGraph(['aws_instance.app']);
    const decorator = new TfPlanChangesDecorator();

    const result = decorator.decorate(graph, {
      resource_changes: [
        {
          address: 'aws_instance.app[0]',
          previous_address: 'aws_instance.old[0]',
          action_reason: 'replace_because_tainted',
          change: {
            actions: ['delete', 'create'],
            replace_paths: [['ami']],
            before_sensitive: {
              tags: {},
            },
            after_sensitive: {
              tags: {},
            },
            after_unknown: {
              id: true,
            },
          },
        },
      ],
    });

    expect(result.nodes).toStrictEqual(graph.nodes);
    expect(result.changes).toStrictEqual({
      source: 'terraform_plan',
      resources: {
        'aws_instance.app[0]': {
          address: 'aws_instance.app[0]',
          nodeId: toResourceNodeId('aws_instance.app'),
          matched: true,
          previousAddress: 'aws_instance.old[0]',
          actions: ['delete', 'create'],
          actionReason: 'replace_because_tainted',
          replacePaths: [['ami']],
          beforeSensitive: {
            tags: {},
          },
          afterSensitive: {
            tags: {},
          },
          afterUnknown: {
            id: true,
          },
        },
      },
    });
  });

  it('shoud keep unmatched delete-only resource_changes outside canonical nodes', () => {
    const graph = buildGraph(['aws_instance.app']);
    const decorator = new TfPlanChangesDecorator();

    const result = decorator.decorate(graph, {
      resource_changes: [
        {
          address: 'aws_s3_bucket.removed',
          change: {
            actions: ['delete'],
          },
        },
      ],
    });

    expect(Object.keys(result.nodes)).toEqual([
      toResourceNodeId('aws_instance.app'),
    ]);
    expect(result.changes).toStrictEqual({
      source: 'terraform_plan',
      resources: {
        'aws_s3_bucket.removed': {
          address: 'aws_s3_bucket.removed',
          matched: false,
          actions: ['delete'],
        },
      },
    });
  });

  it('shoud ignore non-resource canonical nodes when matching changes and preserve edges', () => {
    const graph = buildGraph(['aws_instance.app']);
    const outputId = tgNodeIdFrom('output', 'output.instance_id');
    graph.nodes[outputId] = {
      id: outputId,
      terraform: {
        kind: 'output',
        address: 'output.instance_id',
        resource: 'output',
        name: 'instance_id',
      },
    };
    graph.edges = [
      {
        id: asEdgeId('edge:app-output'),
        from: toResourceNodeId('aws_instance.app'),
        to: outputId,
      },
    ];

    const result = new TfPlanChangesDecorator().decorate(graph, {
      resource_changes: [
        {
          address: 'output.instance_id',
          change: {
            actions: ['update'],
          },
        },
      ],
    });

    expect(result.edges).toStrictEqual(graph.edges);
    expect(result.changes?.resources['output.instance_id']).toStrictEqual({
      address: 'output.instance_id',
      matched: false,
      actions: ['update'],
    });
  });

  it('shoud parse change evidence from a JSON string', () => {
    const graph = buildGraph(['aws_instance.app']);

    const result = new TfPlanChangesDecorator().decorate(
      graph,
      '{"resource_changes":[{"address":"aws_instance.app","change":{"actions":["no-op"]}}]}',
    );

    expect(result.changes?.resources['aws_instance.app']).toStrictEqual({
      address: 'aws_instance.app',
      nodeId: toResourceNodeId('aws_instance.app'),
      matched: true,
      actions: ['no-op'],
    });
  });

  it('shoud throw for malformed json or unsupported plan changes payload', () => {
    const graph = buildGraph(['aws_instance.app']);
    const decorator = new TfPlanChangesDecorator();

    expect(() => decorator.decorate(graph, '{"broken"')).toThrow(
      'TfPlanChangesDecorator expected a valid terraform show -json payload',
    );

    expect(() =>
      decorator.decorate(graph, {
        planned_values: {
          root_module: {
            resources: [],
          },
        },
      } as never),
    ).toThrow(
      'TfPlanChangesDecorator received unsupported Terraform plan changes shape',
    );
  });
});
