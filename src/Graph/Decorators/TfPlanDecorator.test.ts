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
  const emptyPackagePlan = (): TerraformPlanShowJson => ({
    complete: true,
    planned_values: { root_module: {} },
    configuration: {
      root_module: {
        module_calls: {
          package: {
            module: { resources: [{ address: 'aws_lambda_function.this' }] },
          },
        },
      },
    },
  });
  const packageAddress = 'module.package.aws_lambda_function.this';
  const packageNodeId = toResourceNodeId(packageAddress);

  it('shoud annotate declared resources with confirmed zero instances without mutating the graph', () => {
    const graph = buildGraph([
      packageAddress,
      'aws_s3_bucket.not_in_configuration',
    ]);
    const result = new TfPlanDecorator().decorate(graph, emptyPackagePlan());

    expect(result.nodes[packageNodeId].terraform?.state).toEqual({
      source: 'plan_show',
      effective: null,
      instances: [],
    });
    expect(graph.nodes[packageNodeId].terraform?.state).toBeUndefined();
    expect(
      result.nodes[toResourceNodeId('aws_s3_bucket.not_in_configuration')]
        .terraform?.state,
    ).toBeUndefined();
    expect(result.edges).toEqual(graph.edges);
  });

  it.each([
    { complete: undefined },
    { complete: false },
    { errored: true },
    { deferred_changes: [{ reason: 'instance_count_unknown' }] },
  ])(
    'shoud preserve unknown instance presence for non-authoritative plans %j',
    (overrides) => {
      const result = new TfPlanDecorator().decorate(
        buildGraph([packageAddress]),
        {
          ...emptyPackagePlan(),
          ...overrides,
        },
      );

      expect(result.nodes[packageNodeId].terraform?.state).toBeUndefined();
    },
  );

  it.each([
    { resource_changes: [{ address: `${packageAddress}[0]` }] },
    {
      resource_changes: [
        {
          address: 'aws_lambda_function.renamed',
          previous_address: `${packageAddress}[0]`,
        },
      ],
    },
    {
      prior_state: {
        values: {
          root_module: {
            child_modules: [
              { resources: [{ address: `${packageAddress}[0]` }] },
            ],
          },
        },
      },
    },
  ])('shoud preserve prior and changed resource families %j', (evidence) => {
    const result = new TfPlanDecorator().decorate(
      buildGraph([packageAddress]),
      {
        ...emptyPackagePlan(),
        ...evidence,
      },
    );

    expect(result.nodes[packageNodeId].terraform?.state).toBeUndefined();
  });

  it('shoud preserve existing state and planned instances within indexed modules', () => {
    const graph = buildGraph([packageAddress]);
    const instance = { address: `${packageAddress}[0]`, values: {} };
    graph.nodes[packageNodeId].terraform = {
      ...graph.nodes[packageNodeId].terraform,
      state: { source: 'state_show', effective: instance, instances: [] },
    };
    expect(
      new TfPlanDecorator().decorate(graph, emptyPackagePlan()).nodes[
        packageNodeId
      ].terraform?.state,
    ).toEqual(graph.nodes[packageNodeId].terraform?.state);

    const plan = emptyPackagePlan();
    plan.planned_values.root_module.child_modules = [
      {
        resources: [
          {
            address: 'module.package["blue"].aws_lambda_function.this[0]',
            values: {},
          },
        ],
      },
    ];
    const result = new TfPlanDecorator().decorate(
      buildGraph([packageAddress]),
      plan,
    );

    expect(
      result.nodes[packageNodeId].terraform?.state?.instances,
    ).toHaveLength(1);
  });

  it('shoud preserve existing instance lists when an absent plan node has no effective state', () => {
    const graph = buildGraph([packageAddress]);
    graph.nodes[packageNodeId].terraform = {
      ...graph.nodes[packageNodeId].terraform,
      state: {
        source: 'state_show',
        effective: null,
        instances: [{ address: `${packageAddress}[0]`, values: {} }],
      },
    };

    expect(
      new TfPlanDecorator().decorate(graph, emptyPackagePlan()).nodes[
        packageNodeId
      ].terraform?.state?.source,
    ).toBe('state_show');
  });

  it('shoud annotate only addressable resource nodes', () => {
    const graph = buildGraph([packageAddress]);
    const dataId = asNodeId('data');
    const orphanId = asNodeId('orphan');
    const noAddressId = asNodeId('no-address');
    graph.nodes[dataId] = {
      id: dataId,
      terraform: { kind: 'data', address: 'data.aws_caller_identity.current' },
    };
    graph.nodes[orphanId] = { id: orphanId };
    graph.nodes[noAddressId] = {
      id: noAddressId,
      terraform: { kind: 'resource' },
    };
    const plan = {
      ...emptyPackagePlan(),
      errored: false,
      deferred_changes: [],
      prior_state: { values: {} },
      resource_changes: [],
    };
    const result = new TfPlanDecorator().decorate(graph, plan);

    for (const id of [dataId, orphanId, noAddressId]) {
      expect(result.nodes[id].terraform?.state).toBeUndefined();
    }
    expect(result.nodes[packageNodeId].terraform?.state?.instances).toEqual([]);
  });

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

  it('shoud add missing dependency edges from plan configuration references', () => {
    const graph = {
      ...buildGraph([
        'aws_lambda_event_source_mapping.bucket_events_to_lambda',
        'aws_sqs_queue.bucket_events',
        'module.lambda.output.lambda_function_arn',
      ]),
      edges: [],
    } satisfies TgGraph;
    const decorator = new TfPlanDecorator();

    const result = decorator.decorate(graph, {
      planned_values: {
        root_module: {
          resources: [],
        },
      },
      configuration: {
        root_module: {
          resources: [
            {
              address:
                'aws_lambda_event_source_mapping.bucket_events_to_lambda',
              expressions: {
                event_source_arn: {
                  references: [
                    'aws_sqs_queue.bucket_events.arn',
                    'aws_sqs_queue.bucket_events',
                  ],
                },
                function_name: {
                  references: [
                    'module.lambda.lambda_function_arn',
                    'module.lambda',
                  ],
                },
              },
            },
          ],
        },
      },
    });

    expect(
      result.edges.find(
        (edge) =>
          edge.from ===
            toResourceNodeId(
              'aws_lambda_event_source_mapping.bucket_events_to_lambda',
            ) && edge.to === toResourceNodeId('aws_sqs_queue.bucket_events'),
      ),
    ).toBeDefined();
    expect(
      result.edges.find(
        (edge) =>
          edge.from ===
            toResourceNodeId(
              'aws_lambda_event_source_mapping.bucket_events_to_lambda',
            ) &&
          edge.to ===
            toResourceNodeId('module.lambda.output.lambda_function_arn'),
      ),
    ).toBeDefined();
  });

  it('shoud add missing dependency edges for module-local configuration references', () => {
    const graph = {
      ...buildGraph([
        'module.copy_to_ifr.aws_pipes_pipe.event_pipe',
        'module.copy_to_ifr.aws_sqs_queue.event_queue',
        'module.copy_to_ifr.aws_sfn_state_machine.state_machine',
      ]),
      edges: [],
    } satisfies TgGraph;
    const decorator = new TfPlanDecorator();

    const result = decorator.decorate(graph, {
      planned_values: {
        root_module: {
          resources: [],
        },
      },
      configuration: {
        root_module: {
          module_calls: {
            copy_to_ifr: {
              module: {
                resources: [
                  {
                    address: 'aws_pipes_pipe.event_pipe',
                    expressions: {
                      source: {
                        references: [
                          'aws_sqs_queue.event_queue.arn',
                          'aws_sqs_queue.event_queue',
                        ],
                      },
                      target: {
                        references: [
                          'aws_sfn_state_machine.state_machine.arn',
                          'aws_sfn_state_machine.state_machine',
                        ],
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    });

    expect(
      result.edges.find(
        (edge) =>
          edge.from ===
            toResourceNodeId('module.copy_to_ifr.aws_pipes_pipe.event_pipe') &&
          edge.to ===
            toResourceNodeId('module.copy_to_ifr.aws_sqs_queue.event_queue'),
      ),
    ).toBeDefined();
    expect(
      result.edges.find(
        (edge) =>
          edge.from ===
            toResourceNodeId('module.copy_to_ifr.aws_pipes_pipe.event_pipe') &&
          edge.to ===
            toResourceNodeId(
              'module.copy_to_ifr.aws_sfn_state_machine.state_machine',
            ),
      ),
    ).toBeDefined();
  });

  it('shoud support root resources referencing module outputs and module resources referencing nested module outputs', () => {
    const graph = {
      ...buildGraph([
        'aws_cloudwatch_event_target.copy_to_ifr',
        'module.copy_to_ifr.output.event_queue_arn',
        'module.copy_to_ifr.aws_pipes_pipe.event_pipe',
        'module.copy_to_ifr.module.tags.output.queue_arn',
      ]),
      edges: [],
    } satisfies TgGraph;
    const decorator = new TfPlanDecorator();

    const result = decorator.decorate(graph, {
      planned_values: {
        root_module: {
          resources: [],
        },
      },
      configuration: {
        root_module: {
          resources: [
            {
              address: 'aws_cloudwatch_event_target.copy_to_ifr',
              expressions: {
                arn: {
                  references: [
                    'module.copy_to_ifr.event_queue_arn',
                    'module.copy_to_ifr',
                  ],
                },
              },
            },
          ],
          module_calls: {
            copy_to_ifr: {
              module: {
                resources: [
                  {
                    address: 'aws_pipes_pipe.event_pipe',
                    expressions: {
                      queue_output: {
                        references: ['module.tags.queue_arn', 'module.tags'],
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    });

    expect(
      result.edges.find(
        (edge) =>
          edge.from ===
            toResourceNodeId('aws_cloudwatch_event_target.copy_to_ifr') &&
          edge.to ===
            toResourceNodeId('module.copy_to_ifr.output.event_queue_arn'),
      ),
    ).toBeDefined();
    expect(
      result.edges.find(
        (edge) =>
          edge.from ===
            toResourceNodeId('module.copy_to_ifr.aws_pipes_pipe.event_pipe') &&
          edge.to ===
            toResourceNodeId('module.copy_to_ifr.module.tags.output.queue_arn'),
      ),
    ).toBeDefined();
  });

  it('should preserve root-scope references and skip unmatched configuration resources', () => {
    const missingKeyNodeId = asNodeId('graph-key-does-not-match-node-id');
    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: { source: 'test' },
      nodes: {
        [missingKeyNodeId]: {
          id: toResourceNodeId('aws_lambda_function.real_id'),
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.real_id',
            resource: 'aws_lambda_function',
            name: 'real_id',
          },
        },
        [toResourceNodeId('aws_lambda_function.target')]: {
          id: toResourceNodeId('aws_lambda_function.target'),
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.target',
            resource: 'aws_lambda_function',
            name: 'target',
          },
        },
        [asNodeId('module-node')]: {
          id: asNodeId('module-node'),
          terraform: {
            kind: 'module',
            address: 'module.ignored',
            resource: 'module',
            name: 'ignored',
          } as never,
        },
      },
      edges: [
        {
          id: asEdgeId('existing'),
          from: toResourceNodeId('aws_lambda_function.real_id'),
          to: toResourceNodeId('aws_lambda_function.target'),
        },
      ],
    };
    const decorator = new TfPlanDecorator();

    const result = decorator.decorate(graph, {
      planned_values: {
        root_module: {
          resources: [],
        },
      },
      configuration: {
        root_module: {
          resources: [
            {
              address: 'aws_lambda_function.unmatched',
            },
            {
              address: 'aws_lambda_function.real_id',
              expressions: {
                passthrough: {
                  references: ['var.shared', 'aws_lambda_function.target'],
                },
              },
            },
          ],
          module_calls: {
            skipped: {},
          },
        },
      },
    });

    expect(
      result.nodes[missingKeyNodeId]?.terraform?.configuration?.expressions,
    ).toBeUndefined();
    expect(
      result.edges.filter(
        (edge) =>
          edge.from === toResourceNodeId('aws_lambda_function.real_id') &&
          edge.to === toResourceNodeId('aws_lambda_function.target'),
      ),
    ).toHaveLength(1);
  });

  it('should preserve root-scope references in stored configuration expressions', () => {
    const graph = buildGraph([
      'aws_lambda_function.source',
      'aws_lambda_function.target',
      'module.nested.aws_lambda_function.worker',
    ]);
    const decorator = new TfPlanDecorator();

    const result = decorator.decorate(graph, {
      planned_values: {
        root_module: {
          resources: [],
        },
      },
      configuration: {
        root_module: {
          resources: [
            {
              address: 'aws_lambda_function.source',
              expressions: {
                passthrough: {
                  references: ['var.shared', 'aws_lambda_function.target'],
                },
              },
            },
          ],
          module_calls: {
            nested: {
              module: {
                resources: [
                  {
                    address: 'aws_lambda_function.worker',
                    expressions: {
                      passthrough: {
                        references: ['var.shared'],
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    });

    expect(
      result.nodes[toResourceNodeId('aws_lambda_function.source')].terraform
        ?.configuration?.expressions,
    ).toEqual({
      passthrough: {
        references: ['var.shared', 'aws_lambda_function.target'],
      },
    });
    expect(
      result.nodes[toResourceNodeId('module.nested.aws_lambda_function.worker')]
        .terraform?.configuration?.expressions,
    ).toEqual({
      passthrough: {
        references: ['var.shared'],
      },
    });
  });
});
