import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from './Adapters/GraphologyAdapter.js';
import {
  type SemanticReferenceCandidate,
  type SemanticReferenceHeuristic,
  collectTerraformConfigurationReferences,
  findTerraformNodesWithinScopePrefix,
  resolveSemanticReferenceCandidates,
  selectBestSemanticReferenceCandidate,
} from './SemanticReferenceResolution.js';
import {
  TG_SCHEMA_VERSION,
  TgGraph,
  asNodeId,
  tgNodeIdFrom,
} from './TgGraph.js';

describe('collectTerraformConfigurationReferences', () => {
  it('should collect nested unique references from a Terraform expression tree', () => {
    expect(
      collectTerraformConfigurationReferences({
        target: [
          {
            arn: {
              references: [
                'module.gemini_bulk_request',
                'each.value.lambda_key',
              ],
            },
            input: {
              references: ['aws_sqs_queue.example', 'each.key'],
            },
          },
        ],
      }),
    ).toStrictEqual([
      'module.gemini_bulk_request',
      'each.value.lambda_key',
      'aws_sqs_queue.example',
      'each.key',
    ]);
  });

  it('should ignore blank and non-string references', () => {
    expect(
      collectTerraformConfigurationReferences({
        references: ['aws_sqs_queue.example', '', '   ', 1, null],
      }),
    ).toStrictEqual(['aws_sqs_queue.example']);
  });
});

describe('resolveSemanticReferenceCandidates', () => {
  const scheduleNodeId = tgNodeIdFrom(
    'resource',
    'aws_scheduler_schedule.gemini_bulk_requests["abi-afternoon"]',
  );
  const lambdaNodeId = tgNodeIdFrom(
    'resource',
    'module.gemini_bulk_request["abi"].aws_lambda_function.this',
  );
  const queueNodeId = tgNodeIdFrom('resource', 'aws_sqs_queue.example');

  const graph: TgGraph = {
    schemaVersion: TG_SCHEMA_VERSION,
    description: {},
    nodes: {
      [scheduleNodeId]: {
        id: scheduleNodeId,
        terraform: {
          address:
            'aws_scheduler_schedule.gemini_bulk_requests["abi-afternoon"]',
          state: {
            source: 'plan_show',
            effective: {
              address:
                'aws_scheduler_schedule.gemini_bulk_requests["abi-afternoon"]',
              index: 'abi-afternoon',
              values: null,
            },
            instances: [],
          },
        },
      },
      [lambdaNodeId]: {
        id: lambdaNodeId,
        terraform: {
          address: 'module.gemini_bulk_request["abi"].aws_lambda_function.this',
        },
      },
      [queueNodeId]: {
        id: queueNodeId,
        terraform: {
          address: 'aws_sqs_queue.example',
        },
      },
    },
    edges: [],
  };

  it('should resolve exact Terraform resource references by stripping attribute suffixes', () => {
    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      graph,
    );
    const sourceNode = adapter.getNodeAttributes(scheduleNodeId);

    if (!sourceNode) {
      throw new Error('expected sourceNode to be defined');
    }

    const candidates = resolveSemanticReferenceCandidates({
      graph: adapter,
      sourceNodeId: scheduleNodeId,
      sourceNode,
      reference: 'aws_sqs_queue.example.arn',
    });

    expect(candidates[0]).toMatchObject({
      kind: 'node',
      confidence: 'exact',
      nodeId: queueNodeId,
      address: 'aws_sqs_queue.example',
    });
  });

  it('should keep exact-reference reasons when no attribute suffix is removed', () => {
    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      graph,
    );
    const sourceNode = adapter.getNodeAttributes(scheduleNodeId);

    if (!sourceNode) {
      throw new Error('expected sourceNode to be defined');
    }

    expect(
      resolveSemanticReferenceCandidates({
        graph: adapter,
        sourceNodeId: scheduleNodeId,
        sourceNode,
        reference: 'aws_sqs_queue.example',
      })[0],
    ).toMatchObject({
      reason: 'reference matched terraform.address exactly',
    });
  });

  it('should preserve bracketed segments and tolerate malformed scope candidates', () => {
    const indexedQueueId = tgNodeIdFrom(
      'resource',
      'aws_sqs_queue.example["a.b"]',
    );

    const malformedGraph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [scheduleNodeId]: graph.nodes[scheduleNodeId],
        [indexedQueueId]: {
          id: indexedQueueId,
          terraform: {
            address: 'aws_sqs_queue.example["a.b"]',
          },
        },
        [asNodeId('broken-module')]: {
          id: asNodeId('broken-module'),
          terraform: {
            address: 'module.gemini_broken["oops".aws_lambda_function.handler',
          },
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      malformedGraph,
    );
    const sourceNode = adapter.getNodeAttributes(scheduleNodeId);
    if (!sourceNode) {
      throw new Error('expected sourceNode to be defined');
    }

    expect(
      resolveSemanticReferenceCandidates({
        graph: adapter,
        sourceNodeId: scheduleNodeId,
        sourceNode,
        reference: 'aws_sqs_queue.example["a.b"].arn',
      })[0],
    ).toMatchObject({
      kind: 'node',
      nodeId: indexedQueueId,
      address: 'aws_sqs_queue.example["a.b"]',
    });

    expect(
      resolveSemanticReferenceCandidates({
        graph: adapter,
        sourceNodeId: scheduleNodeId,
        sourceNode,
        reference: 'module.gemini_broken',
      }),
    ).toEqual([]);
  });

  it('should produce a scored scope candidate for bare module references using source index tokens', () => {
    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      graph,
    );
    const sourceNode = adapter.getNodeAttributes(scheduleNodeId);

    if (!sourceNode) {
      throw new Error('expected sourceNode to be defined');
    }

    const candidates = resolveSemanticReferenceCandidates({
      graph: adapter,
      sourceNodeId: scheduleNodeId,
      sourceNode,
      reference: 'module.gemini_bulk_request',
    });

    expect(candidates[0]).toMatchObject({
      kind: 'scope',
      confidence: 'heuristic',
      addressPrefix: 'module.gemini_bulk_request["abi"]',
    });
    expect(selectBestSemanticReferenceCandidate(candidates)).toStrictEqual(
      candidates[0],
    );
  });

  it('should resolve indexed scope candidates from all terraform state instance addresses when node addresses are collapsed', () => {
    const collapsedLambdaNodeId = tgNodeIdFrom(
      'resource',
      'module.gemini_bulk_request.aws_lambda_function.this',
    );

    const collapsedGraph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [scheduleNodeId]: graph.nodes[scheduleNodeId],
        [collapsedLambdaNodeId]: {
          id: collapsedLambdaNodeId,
          terraform: {
            address: 'module.gemini_bulk_request.aws_lambda_function.this',
            state: {
              source: 'plan_show',
              effective: {
                address:
                  'module.gemini_bulk_request["abi"].aws_lambda_function.this[0]',
                index: 0,
                values: null,
              },
              instances: [
                {
                  address:
                    'module.gemini_bulk_request["abi"].aws_lambda_function.this[0]',
                  index: 0,
                  values: null,
                },
                {
                  address:
                    'module.gemini_bulk_request["mei"].aws_lambda_function.this[0]',
                  index: 0,
                  values: null,
                },
                {
                  address:
                    'module.gemini_bulk_request["mti"].aws_lambda_function.this[0]',
                  index: 0,
                  values: null,
                },
              ],
            },
          },
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      collapsedGraph,
    );
    const sourceNode = adapter.getNodeAttributes(scheduleNodeId);

    if (!sourceNode) {
      throw new Error('expected sourceNode to be defined');
    }

    const candidates = resolveSemanticReferenceCandidates({
      graph: adapter,
      sourceNodeId: scheduleNodeId,
      sourceNode,
      reference: 'module.gemini_bulk_request',
    });

    expect(candidates[0]).toMatchObject({
      kind: 'scope',
      addressPrefix: 'module.gemini_bulk_request["abi"]',
    });

    const scoped = findTerraformNodesWithinScopePrefix(
      adapter,
      'module.gemini_bulk_request["abi"]',
    );
    expect(scoped.map((entry) => entry.nodeId)).toStrictEqual([
      collapsedLambdaNodeId,
    ]);

    const meiCandidates = resolveSemanticReferenceCandidates({
      graph: adapter,
      sourceNodeId: scheduleNodeId,
      sourceNode,
      sourceIndex: 'mei-morning',
      reference: 'module.gemini_bulk_request',
    });

    expect(
      meiCandidates.find(
        (candidate) =>
          candidate.kind === 'scope' &&
          candidate.addressPrefix === 'module.gemini_bulk_request["mei"]',
      ),
    ).toBeDefined();

    const mtiCandidates = resolveSemanticReferenceCandidates({
      graph: adapter,
      sourceNodeId: scheduleNodeId,
      sourceNode,
      sourceIndex: 'mti-morning',
      reference: 'module.gemini_bulk_request',
    });

    expect(
      mtiCandidates.find(
        (candidate) =>
          candidate.kind === 'scope' &&
          candidate.addressPrefix === 'module.gemini_bulk_request["mti"]',
      ),
    ).toBeDefined();
  });

  it('should discard scope heuristics when the source index or instance key cannot tokenize', () => {
    const sourceNodeId = asNodeId('source');
    const emptyKeyNodeId = asNodeId('empty-key');
    const tokenlessNodeId = asNodeId('tokenless');
    const withoutTerraformId = asNodeId('without-terraform');

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [sourceNodeId]: {
          id: sourceNodeId,
          terraform: {
            address: 'aws_scheduler_schedule.example["---"]',
            state: {
              source: 'plan_show',
              effective: {
                address: 'aws_scheduler_schedule.example["---"]',
                index: '---',
                values: null,
              },
              instances: [],
            },
          },
        },
        [emptyKeyNodeId]: {
          id: emptyKeyNodeId,
          terraform: {
            address: 'module.empty_scope[""].aws_lambda_function.handler',
          },
        },
        [tokenlessNodeId]: {
          id: tokenlessNodeId,
          terraform: {
            address: 'module.tokenless["---"].aws_lambda_function.handler',
          },
        },
        [withoutTerraformId]: {
          id: withoutTerraformId,
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      graph,
    );
    const sourceNode = adapter.getNodeAttributes(sourceNodeId);
    if (!sourceNode) {
      throw new Error('expected sourceNode to be defined');
    }

    expect(
      resolveSemanticReferenceCandidates({
        graph: adapter,
        sourceNodeId,
        sourceNode,
        reference: 'module.empty_scope',
        sourceIndex: 'alpha',
      }),
    ).toEqual([]);

    expect(
      resolveSemanticReferenceCandidates({
        graph: adapter,
        sourceNodeId,
        sourceNode,
        reference: 'module.tokenless',
        sourceIndex: 'alpha',
      }),
    ).toEqual([]);

    expect(
      resolveSemanticReferenceCandidates({
        graph: adapter,
        sourceNodeId,
        sourceNode,
        reference: 'module.empty_scope',
        sourceIndex: '---',
      }),
    ).toEqual([]);
  });

  it('should score shared-token module matches even when the source index does not start with the key', () => {
    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      graph,
    );
    const sourceNode = adapter.getNodeAttributes(scheduleNodeId);
    if (!sourceNode) {
      throw new Error('expected sourceNode to be defined');
    }

    expect(
      resolveSemanticReferenceCandidates({
        graph: adapter,
        sourceNodeId: scheduleNodeId,
        sourceNode,
        reference: 'module.gemini_bulk_request',
        sourceIndex: 'morning-abi',
      })[0],
    ).toMatchObject({
      kind: 'scope',
      score: 30,
      reason:
        "state index 'morning-abi' shares tokens with module instance key 'abi'",
    });
  });

  it('should sort and deduplicate heuristic candidates', () => {
    const heuristic: SemanticReferenceHeuristic = {
      name: 'custom',
      resolve: () =>
        [
          {
            kind: 'scope' as const,
            reference: 'module.example',
            confidence: 'heuristic' as const,
            score: 10,
            reason: 'duplicate-scope',
            addressPrefix: 'module.example["a"]',
          },
          {
            kind: 'node' as const,
            reference: 'module.example',
            confidence: 'heuristic' as const,
            score: 40,
            reason: 'best',
            nodeId: asNodeId('node-a'),
            address: 'aws_lambda_function.a',
          },
          {
            kind: 'node' as const,
            reference: 'module.example',
            confidence: 'heuristic' as const,
            score: 40,
            reason: 'best',
            nodeId: asNodeId('node-a'),
            address: 'aws_lambda_function.a',
          },
        ] satisfies SemanticReferenceCandidate[],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      graph,
    );
    const sourceNode = adapter.getNodeAttributes(scheduleNodeId);
    if (!sourceNode) {
      throw new Error('expected sourceNode to be defined');
    }

    const candidates = resolveSemanticReferenceCandidates({
      graph: adapter,
      sourceNodeId: scheduleNodeId,
      sourceNode,
      reference: 'module.example',
      heuristics: [heuristic],
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.kind).toBe('node');
    expect(candidates[1]?.kind).toBe('scope');
  });
});

describe('findTerraformNodesWithinScopePrefix', () => {
  it('should return Terraform nodes scoped under the requested module instance', () => {
    const scheduleNodeId = asNodeId('schedule');
    const lambdaNodeId = asNodeId('lambda');
    const roleNodeId = asNodeId('role');

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [scheduleNodeId]: {
          id: scheduleNodeId,
          terraform: {
            address: 'aws_scheduler_schedule.example["abi-afternoon"]',
          },
        },
        [lambdaNodeId]: {
          id: lambdaNodeId,
          terraform: {
            address:
              'module.gemini_bulk_request["abi"].aws_lambda_function.this',
          },
        },
        [roleNodeId]: {
          id: roleNodeId,
          terraform: {
            address: 'module.gemini_bulk_request["abi"].aws_iam_role.lambda',
          },
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      graph,
    );

    const scoped = findTerraformNodesWithinScopePrefix(
      adapter,
      'module.gemini_bulk_request["abi"]',
    );

    expect(scoped.map((entry) => entry.address).sort()).toStrictEqual([
      'module.gemini_bulk_request["abi"].aws_iam_role.lambda',
      'module.gemini_bulk_request["abi"].aws_lambda_function.this',
    ]);
  });

  it('should return an empty result when no nodes fall under the scope prefix', () => {
    const nodeId = asNodeId('node');
    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeId]: {
          id: nodeId,
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      graph,
    );

    expect(
      findTerraformNodesWithinScopePrefix(adapter, 'module.missing["blue"]'),
    ).toEqual([]);
  });

  it('should resolve scope prefixes from effective and instance addresses even without terraform.address', () => {
    const nodeId = asNodeId('collapsed');
    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeId]: {
          id: nodeId,
          terraform: {
            state: {
              source: 'plan_show',
              effective: {
                address: 'module.scope["blue"].aws_lambda_function.handler',
                values: null,
              },
              instances: [
                {
                  address:
                    'module.scope["blue"].aws_lambda_function.handler[0]',
                  values: null,
                },
                {
                  values: null,
                } as never,
              ],
            },
          },
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      graph,
    );

    expect(
      findTerraformNodesWithinScopePrefix(adapter, 'module.scope["blue"]'),
    ).toEqual([
      {
        nodeId,
        node: graph.nodes[nodeId],
        address: 'module.scope["blue"].aws_lambda_function.handler',
      },
    ]);
  });
});

describe('selectBestSemanticReferenceCandidate', () => {
  it('should return undefined when candidates are empty or tied', () => {
    expect(selectBestSemanticReferenceCandidate([])).toBeUndefined();
    expect(
      selectBestSemanticReferenceCandidate([
        {
          kind: 'node',
          reference: 'aws_lambda_function.a',
          confidence: 'heuristic',
          score: 20,
          reason: 'first',
          nodeId: asNodeId('node-a'),
          address: 'aws_lambda_function.a',
        },
        {
          kind: 'scope',
          reference: 'module.example',
          confidence: 'heuristic',
          score: 20,
          reason: 'second',
          addressPrefix: 'module.example["a"]',
        },
      ]),
    ).toBeUndefined();
  });
});
