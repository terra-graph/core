import {
  DefaultEdgeSemanticRoles,
  TG_SCHEMA_VERSION,
  TgGraph,
  asEdgeId,
  asNodeId,
  tgNodeIdFrom,
} from '../TgGraph.js';
import {
  type TerraformPlanShowJson,
  TfPlanDecorator,
} from './TfPlanDecorator.js';
import {
  type TerraformStateShowJson,
  TfStateDecorator,
} from './TfStateDecorator.js';

const toResourceNodeId = (address: string) => tgNodeIdFrom('resource', address);
const customSemantic = (semantic: string) => ({
  semantic,
  role: DefaultEdgeSemanticRoles.Primary,
});

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
    description: { source: 'test' },
    nodes,
    edges:
      addresses.length >= 2
        ? [
            {
              id: asEdgeId(`edge:${addresses[0]}->${addresses[1]}`),
              from: toResourceNodeId(addresses[0]),
              to: toResourceNodeId(addresses[1]),
            },
          ]
        : [],
  };
};

describe('TfStateDecorator.decorate', () => {
  it('shoud set terraform.state from terraform show state resources', () => {
    const graph = buildGraph([
      'aws_instance.app',
      'module.network.aws_security_group.sg',
      'aws_s3_bucket.ignored',
    ]);

    graph.nodes[toResourceNodeId('aws_s3_bucket.ignored')].terraform = {
      ...graph.nodes[toResourceNodeId('aws_s3_bucket.ignored')].terraform,
      state: {
        source: 'plan_show',
        effective: {
          address: 'aws_s3_bucket.ignored',
          values: { name: 'kept' },
        },
        instances: [
          {
            address: 'aws_s3_bucket.ignored',
            values: { name: 'kept' },
          },
        ],
      },
    };

    const decorator = new TfStateDecorator();
    const result = decorator.decorate(graph, {
      values: {
        root_module: {
          resources: [
            {
              address: 'aws_instance.app',
              mode: 'managed',
              type: 'aws_instance',
              name: 'app',
              provider_name: 'registry.terraform.io/hashicorp/aws',
              values: { ami: 'ami-123' },
            },
            {
              address: 'aws_instance.app[0]',
              mode: 'managed',
              type: 'aws_instance',
              name: 'app',
              index: 0,
              values: { ami: 'ami-idx-0' },
            },
            {
              address: 'aws_instance.unmatched',
              mode: 'managed',
              type: 'aws_instance',
              name: 'unmatched',
              values: { ami: 'ami-000' },
            },
          ],
          child_modules: [
            {
              resources: [
                {
                  address: 'module.network.aws_security_group.sg',
                  module_address: 'module.network',
                  mode: 'managed',
                  type: 'aws_security_group',
                  name: 'sg',
                  values: { description: 'from-state' },
                },
              ],
            },
          ],
        },
      },
    });

    expect(result).not.toBe(graph);
    expect(result.nodes).not.toBe(graph.nodes);
    expect(result.edges).not.toBe(graph.edges);
    expect(result.description).not.toBe(graph.description);

    expect(
      result.nodes[toResourceNodeId('aws_instance.app')].terraform?.state,
    ).toEqual({
      source: 'state_show',
      effective: {
        address: 'aws_instance.app',
        mode: 'managed',
        type: 'aws_instance',
        name: 'app',
        provider_name: 'registry.terraform.io/hashicorp/aws',
        values: { ami: 'ami-123' },
      },
      instances: [
        {
          address: 'aws_instance.app',
          mode: 'managed',
          type: 'aws_instance',
          name: 'app',
          provider_name: 'registry.terraform.io/hashicorp/aws',
          values: { ami: 'ami-123' },
        },
        {
          address: 'aws_instance.app[0]',
          mode: 'managed',
          type: 'aws_instance',
          name: 'app',
          index: 0,
          values: { ami: 'ami-idx-0' },
        },
      ],
    });

    expect(
      result.nodes[toResourceNodeId('module.network.aws_security_group.sg')]
        .terraform?.state,
    ).toEqual({
      source: 'state_show',
      effective: {
        address: 'module.network.aws_security_group.sg',
        module_address: 'module.network',
        mode: 'managed',
        type: 'aws_security_group',
        name: 'sg',
        values: { description: 'from-state' },
      },
      instances: [
        {
          address: 'module.network.aws_security_group.sg',
          module_address: 'module.network',
          mode: 'managed',
          type: 'aws_security_group',
          name: 'sg',
          values: { description: 'from-state' },
        },
      ],
    });

    expect(
      result.nodes[toResourceNodeId('aws_s3_bucket.ignored')].terraform?.state,
    ).toEqual({
      source: 'plan_show',
      effective: {
        address: 'aws_s3_bucket.ignored',
        values: { name: 'kept' },
      },
      instances: [
        {
          address: 'aws_s3_bucket.ignored',
          values: { name: 'kept' },
        },
      ],
    });

    expect(
      graph.nodes[toResourceNodeId('aws_instance.app')].terraform?.state,
    ).toBeUndefined();
  });

  it('shoud throw for malformed json or unsupported state payload', () => {
    const graph = buildGraph(['aws_instance.app']);
    const decorator = new TfStateDecorator();

    expect(() => decorator.decorate(graph, '{"broken"')).toThrow(
      'TfStateDecorator expected a valid terraform show -json payload',
    );

    expect(() =>
      decorator.decorate(graph, {} as unknown as TerraformStateShowJson),
    ).toThrow(
      'TfStateDecorator received unsupported Terraform state show shape',
    );
  });

  it('shoud keep nodes without terraform.address untouched and copy edge attributes', () => {
    const graph = buildGraph(['aws_instance.app', 'aws_s3_bucket.other']);
    const orphanId = asNodeId('orphan');
    graph.nodes[orphanId] = { id: orphanId };
    graph.edges[0].attributes = {
      hints: { semantic: customSemantic('dependency') },
    };

    const decorator = new TfStateDecorator();
    const result = decorator.decorate(graph, {
      values: {
        root_module: {
          resources: [
            {
              address: 'aws_instance.app',
              mode: 'managed',
              type: 'aws_instance',
              name: 'app',
              values: { ami: 'ami-123' },
            },
          ],
        },
      },
    });

    expect(result.nodes[orphanId]).toEqual({ id: orphanId });
    expect(result.edges[0].attributes).toEqual({
      hints: { semantic: customSemantic('dependency') },
    });
    expect(result.edges[0].attributes).not.toBe(graph.edges[0].attributes);
  });
});

describe('TfPlanDecorator.decorate', () => {
  it('shoud set terraform.state from terraform show plan planned_values', () => {
    const graph = buildGraph(['aws_instance.app', 'aws_s3_bucket.other']);

    graph.nodes[toResourceNodeId('aws_instance.app')].terraform = {
      ...graph.nodes[toResourceNodeId('aws_instance.app')].terraform,
      state: {
        source: 'state_show',
        effective: {
          address: 'aws_instance.app',
          values: { ami: 'ami-before' },
        },
        instances: [
          {
            address: 'aws_instance.app',
            values: { ami: 'ami-before' },
          },
        ],
      },
    };

    const decorator = new TfPlanDecorator();
    const result = decorator.decorate(graph, {
      planned_values: {
        root_module: {
          resources: [
            {
              address: 'aws_instance.app[0]',
              mode: 'managed',
              type: 'aws_instance',
              name: 'app',
              index: 0,
              provider_name: 'registry.terraform.io/hashicorp/aws',
              values: { id: 'new-0' },
            },
            {
              address: 'aws_instance.app[1]',
              mode: 'managed',
              type: 'aws_instance',
              name: 'app',
              index: 1,
              provider_name: 'registry.terraform.io/hashicorp/aws',
              values: { id: 'new-1' },
            },
            {
              address: 'aws_instance.not_in_graph',
              mode: 'managed',
              type: 'aws_instance',
              name: 'not_in_graph',
              values: { id: 'new' },
            },
          ],
        },
      },
    });

    expect(result).not.toBe(graph);
    expect(result.nodes).not.toBe(graph.nodes);
    expect(result.edges).not.toBe(graph.edges);

    expect(
      result.nodes[toResourceNodeId('aws_instance.app')].terraform?.state,
    ).toEqual({
      source: 'plan_show',
      effective: {
        address: 'aws_instance.app[0]',
        mode: 'managed',
        type: 'aws_instance',
        name: 'app',
        index: 0,
        provider_name: 'registry.terraform.io/hashicorp/aws',
        values: { id: 'new-0' },
      },
      instances: [
        {
          address: 'aws_instance.app[0]',
          mode: 'managed',
          type: 'aws_instance',
          name: 'app',
          index: 0,
          provider_name: 'registry.terraform.io/hashicorp/aws',
          values: { id: 'new-0' },
        },
        {
          address: 'aws_instance.app[1]',
          mode: 'managed',
          type: 'aws_instance',
          name: 'app',
          index: 1,
          provider_name: 'registry.terraform.io/hashicorp/aws',
          values: { id: 'new-1' },
        },
      ],
    });

    expect(
      result.nodes[toResourceNodeId('aws_s3_bucket.other')].terraform?.state,
    ).toBeUndefined();

    expect(
      graph.nodes[toResourceNodeId('aws_instance.app')].terraform?.state,
    ).toEqual({
      source: 'state_show',
      effective: {
        address: 'aws_instance.app',
        values: { ami: 'ami-before' },
      },
      instances: [
        {
          address: 'aws_instance.app',
          values: { ami: 'ami-before' },
        },
      ],
    });
  });

  it('shoud throw for malformed json or unsupported plan payload', () => {
    const graph = buildGraph(['aws_instance.app']);
    const decorator = new TfPlanDecorator();

    expect(() => decorator.decorate(graph, '{"broken"')).toThrow(
      'TfPlanDecorator expected a valid terraform show -json payload',
    );

    expect(() =>
      decorator.decorate(graph, {
        resource_changes: [],
      } as unknown as TerraformPlanShowJson),
    ).toThrow('TfPlanDecorator received unsupported Terraform plan show shape');
  });

  it('shoud ignore resources whose normalized address is empty and preserve optional fields', () => {
    const graph = buildGraph(['aws_instance.app']);
    const decorator = new TfPlanDecorator();

    const result = decorator.decorate(graph, {
      planned_values: {
        root_module: {
          resources: [
            {
              address: '["skip"]',
              values: { ignored: true },
            },
            {
              address: 'aws_instance.app["blue"]',
              module_address: 'module.app',
              mode: 'managed',
              type: 'aws_instance',
              name: 'app',
              index: 'blue',
              provider_name: 'registry.terraform.io/hashicorp/aws',
              deposed: 'deposed-key',
              previous_address: 'aws_instance.app["green"]',
              values: { id: 'i-blue' },
            },
          ],
        },
      },
    });

    expect(
      result.nodes[toResourceNodeId('aws_instance.app')].terraform?.state,
    ).toEqual({
      source: 'plan_show',
      effective: {
        address: 'aws_instance.app["blue"]',
        module_address: 'module.app',
        mode: 'managed',
        type: 'aws_instance',
        name: 'app',
        index: 'blue',
        provider_name: 'registry.terraform.io/hashicorp/aws',
        deposed: 'deposed-key',
        previous_address: 'aws_instance.app["green"]',
        values: { id: 'i-blue' },
      },
      instances: [
        {
          address: 'aws_instance.app["blue"]',
          module_address: 'module.app',
          mode: 'managed',
          type: 'aws_instance',
          name: 'app',
          index: 'blue',
          provider_name: 'registry.terraform.io/hashicorp/aws',
          deposed: 'deposed-key',
          previous_address: 'aws_instance.app["green"]',
          values: { id: 'i-blue' },
        },
      ],
    });
  });

  it('shoud support minimal child-module resources and preserve unmatched null effective state', () => {
    const graph = buildGraph(['aws_instance.app', 'aws_s3_bucket.other']);
    graph.nodes[toResourceNodeId('aws_instance.app')].terraform = {
      ...graph.nodes[toResourceNodeId('aws_instance.app')].terraform,
      state: {
        source: 'state_show',
        effective: null,
        instances: [
          {
            address: 'aws_instance.app',
          } as unknown as {
            address: string;
            values: unknown | null;
          },
        ],
      },
    };

    const decorator = new TfStateDecorator();
    const result = decorator.decorate(graph, {
      values: {
        root_module: {
          child_modules: [
            {
              resources: [
                {
                  address: 'aws_s3_bucket.other',
                },
              ],
            },
          ],
        },
      },
    });

    expect(
      result.nodes[toResourceNodeId('aws_s3_bucket.other')].terraform?.state,
    ).toEqual({
      source: 'state_show',
      effective: {
        address: 'aws_s3_bucket.other',
        values: null,
      },
      instances: [
        {
          address: 'aws_s3_bucket.other',
          values: null,
        },
      ],
    });

    expect(
      result.nodes[toResourceNodeId('aws_instance.app')].terraform?.state,
    ).toEqual({
      source: 'state_show',
      effective: null,
      instances: [
        {
          address: 'aws_instance.app',
          values: null,
        },
      ],
    });
  });
});
