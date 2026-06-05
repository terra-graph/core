import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from './Adapters/GraphologyAdapter.js';
import {
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
});
