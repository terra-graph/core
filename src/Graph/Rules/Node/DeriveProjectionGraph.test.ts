import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from '../../Adapters/GraphologyAdapter.js';
import { GraphResolver } from '../../GraphResolver.js';
import { AdapterOperations } from '../../Operations/Operations.js';
import {
  DefaultProjectionAnchorRoles,
  DefaultProjectionLayers,
  DefaultProjectionMembershipRelations,
  NodeId,
  TG_SCHEMA_VERSION,
  TgGraph,
  TgNodeAttributes,
  TgNodeProjectionAnchor,
  asNodeId,
  tgNodeIdFrom,
  tgProjectionNodeIdFrom,
} from '../../TgGraph.js';
import { DeriveProjectionGraph } from './DeriveProjectionGraph.js';

type TestResolvedProjection = {
  name: string;
  layer: string;
  membership: {
    maxDepth: number;
    includeResources: string[];
    excludeResources: string[];
    stopAtOtherRootNodes: boolean;
  };
  relationships: {
    maxDepth: number;
    minEvidence: number;
  };
};

type RelationshipEvidence = {
  evidenceCount: number;
  shortestPathLength?: number;
  viaResourceTypes: string[];
  evidenceKeys: Set<string>;
};

type ParseOptionsResult = {
  projections: Array<{
    name: string;
    layer?: string;
    rootNode: unknown;
    membership?: {
      maxDepth?: number;
      includeResources?: string[];
      excludeResources?: string[];
      stopAtOtherRootNodes?: boolean;
    };
    relationships?: {
      maxDepth?: number;
      minEvidence?: number;
    };
  }>;
};

type DeriveProjectionGraphTestHarness = {
  resolveProjections(): TestResolvedProjection[];
  neighborIds(nodeId: NodeId, graph: AdapterOperations): NodeId[];
  expandMembership(
    projection: TestResolvedProjection,
    rootNodeId: NodeId,
    nodeMap: Map<NodeId, TgNodeAttributes | undefined>,
    graph: AdapterOperations,
    allRootNodeIds: Set<NodeId>,
  ): Set<NodeId>;
  shouldIncludeMember(
    node: TgNodeAttributes | undefined,
    membership: TestResolvedProjection['membership'],
  ): boolean;
  buildProjectionPairKey(from: NodeId, to: NodeId): string;
  parseProjectionPairKey(key: string): [NodeId, NodeId];
  logicalProjectionName(rootNodeId: NodeId, rootNode: TgNodeAttributes): string;
  resolveProjectionAddresses(
    projection: TestResolvedProjection,
    rootNodeIds: NodeId[],
    nodeMap: Map<NodeId, TgNodeAttributes | undefined>,
  ): Map<NodeId, string>;
  resolveProjectionLabels(
    projection: TestResolvedProjection,
    rootNodeIds: NodeId[],
    nodeMap: Map<NodeId, TgNodeAttributes | undefined>,
    resolvedAddresses: Map<NodeId, string> | undefined,
  ): Map<NodeId, string>;
  buildProjectionAddress(
    projection: TestResolvedProjection,
    rootNodeId: NodeId,
    resolvedAddresses: Map<NodeId, string> | undefined,
  ): string;
  buildProjectionLabel(
    projection: TestResolvedProjection,
    rootNodeId: NodeId,
    resolvedLabels: Map<NodeId, string> | undefined,
  ): string;
  mergeProjectionAnchors(
    existing: TgNodeProjectionAnchor[] | undefined,
    next: TgNodeProjectionAnchor,
  ): TgNodeProjectionAnchor[];
  inferAdjacencies(
    projectionDefinitions: Map<NodeId, TestResolvedProjection>,
    projectionRootNodes: Map<NodeId, NodeId>,
    rootToProjections: Map<NodeId, Set<NodeId>>,
    graph: AdapterOperations,
  ): Map<string, RelationshipEvidence & { minEvidence: number }>;
};

const asHarness = (
  rule: DeriveProjectionGraph,
): DeriveProjectionGraphTestHarness =>
  rule as unknown as DeriveProjectionGraphTestHarness;

const parseOptions = (input: unknown): ParseOptionsResult =>
  (
    DeriveProjectionGraph as unknown as {
      parseOptions(inputValue: unknown): ParseOptionsResult;
    }
  ).parseOptions(input);

describe('DeriveProjectionGraph', () => {
  const createRule = (options: unknown = { projections: [] }) =>
    new DeriveProjectionGraph({
      options: options as never,
    });

  describe('constructor', () => {
    it('should require options', () => {
      expect(() => new DeriveProjectionGraph({} as never)).toThrow(
        `Rule 'DeriveProjectionGraph' requires options in config`,
      );
    });

    it('should require options.projections', () => {
      expect(() =>
        createRule({
          projection: [],
        }),
      ).toThrow(`Rule 'DeriveProjectionGraph' requires options.projections`);
    });

    it('should require each projection to have a name', () => {
      expect(() =>
        createRule({
          projections: [{ rootNode: { any: true } }],
        }),
      ).toThrow(
        `Rule 'DeriveProjectionGraph' projection at index 0 requires a name`,
      );
    });

    it('should require each projection to have a rootNode query', () => {
      expect(() =>
        createRule({
          projections: [{ name: 'aws.lambda' }],
        }),
      ).toThrow(
        `Rule 'DeriveProjectionGraph' projection 'aws.lambda' requires a rootNode query`,
      );
    });
  });

  it('should derive projection nodes, membership edges, and inferred projection edges', () => {
    const api = tgNodeIdFrom('resource', 'aws_apigatewayv2_api.public');
    const integration = tgNodeIdFrom(
      'resource',
      'aws_apigatewayv2_integration.public_lambda',
    );
    const lambda = tgNodeIdFrom('resource', 'aws_lambda_function.handler');

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [api]: {
          id: api,
          terraform: {
            kind: 'resource',
            address: 'aws_apigatewayv2_api.public',
            resource: 'aws_apigatewayv2_api',
            name: 'public',
          },
        },
        [integration]: {
          id: integration,
          terraform: {
            kind: 'resource',
            address: 'aws_apigatewayv2_integration.public_lambda',
            resource: 'aws_apigatewayv2_integration',
            name: 'public_lambda',
          },
        },
        [lambda]: {
          id: lambda,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.handler',
            resource: 'aws_lambda_function',
            name: 'handler',
          },
        },
      },
      edges: [
        {
          id: 'edge-api-integration' as never,
          from: api,
          to: integration,
        },
        {
          id: 'edge-integration-lambda' as never,
          from: integration,
          to: lambda,
        },
      ],
    };

    const rule = new DeriveProjectionGraph({
      options: {
        projections: [
          {
            name: 'aws.api_gateway',
            rootNode: {
              attr: { key: 'terraform.resource', eq: 'aws_apigatewayv2_api' },
            },
            membership: {
              maxDepth: 1,
              includeResources: ['aws_apigatewayv2_integration'],
            },
            relationships: {
              maxDepth: 2,
            },
          },
          {
            name: 'aws.lambda',
            rootNode: {
              attr: { key: 'terraform.resource', eq: 'aws_lambda_function' },
            },
            relationships: {
              maxDepth: 2,
            },
          },
        ],
      },
    });

    const resolver = new GraphResolver(
      new GraphologyAdapter(new DirectedGraph()),
    );
    const result = resolver.resolve({ graph, phases: [[rule]] }).toTgGraph();

    const apiProjectionId = tgProjectionNodeIdFrom(
      DefaultProjectionLayers.Core,
      'aws.api_gateway:public',
    );
    const lambdaProjectionId = tgProjectionNodeIdFrom(
      DefaultProjectionLayers.Core,
      'aws.lambda:handler',
    );

    expect(result.nodes[apiProjectionId]?.projection).toEqual({
      layer: 'core',
      address: 'aws.api_gateway:public',
      label: 'public',
      derivation: {
        source: 'plugin',
        projectionName: 'aws.api_gateway',
        groupKey: 'aws.api_gateway:public',
        rootNodeId: api,
        anchors: [
          {
            nodeId: api,
            address: 'aws_apigatewayv2_api.public',
            role: DefaultProjectionAnchorRoles.RootNode,
          },
        ],
      },
    });
    expect(result.nodes[lambdaProjectionId]?.projection).toEqual({
      layer: 'core',
      address: 'aws.lambda:handler',
      label: 'handler',
      derivation: {
        source: 'plugin',
        projectionName: 'aws.lambda',
        groupKey: 'aws.lambda:handler',
        rootNodeId: lambda,
        anchors: [
          {
            nodeId: lambda,
            address: 'aws_lambda_function.handler',
            role: DefaultProjectionAnchorRoles.RootNode,
          },
        ],
      },
    });

    const realizesEdge = result.edges.find(
      (edge) => edge.from === api && edge.to === apiProjectionId,
    );
    expect(realizesEdge?.attributes?.projection?.membership?.relation).toBe(
      DefaultProjectionMembershipRelations.Realizes,
    );

    const contributesToEdge = result.edges.find(
      (edge) => edge.from === integration && edge.to === apiProjectionId,
    );
    expect(
      contributesToEdge?.attributes?.projection?.membership?.relation,
    ).toBe(DefaultProjectionMembershipRelations.ContributesTo);

    const projectedEdge = result.edges.find(
      (edge) => edge.from === apiProjectionId && edge.to === lambdaProjectionId,
    );
    expect(projectedEdge?.attributes?.projection?.adjacency).toEqual({
      source: 'derived',
      evidence: {
        derivedBy: 'anchor_path',
        evidenceCount: 1,
        shortestPathLength: 2,
        viaResourceTypes: ['aws_apigatewayv2_integration'],
      },
    });
  });

  it('should derive separate projections for repeated module-wrapped root node names by default', () => {
    const lambdaA = tgNodeIdFrom(
      'resource',
      'module.batch_messages.aws_lambda_function.this',
    );
    const lambdaB = tgNodeIdFrom(
      'resource',
      'module.gemini_bulk_request.aws_lambda_function.this',
    );

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [lambdaA]: {
          id: lambdaA,
          terraform: {
            kind: 'resource',
            address: 'module.batch_messages.aws_lambda_function.this',
            resource: 'aws_lambda_function',
            name: 'this',
            moduleAddress: 'module.batch_messages',
            parentModuleName: 'batch_messages',
          },
        },
        [lambdaB]: {
          id: lambdaB,
          terraform: {
            kind: 'resource',
            address: 'module.gemini_bulk_request.aws_lambda_function.this',
            resource: 'aws_lambda_function',
            name: 'this',
            moduleAddress: 'module.gemini_bulk_request',
            parentModuleName: 'gemini_bulk_request',
          },
        },
      },
      edges: [],
    };

    const rule = createRule({
      projections: [
        {
          name: 'aws.lambda',
          rootNode: {
            attr: { key: 'terraform.resource', eq: 'aws_lambda_function' },
          },
        },
      ],
    });

    const resolver = new GraphResolver(
      new GraphologyAdapter(new DirectedGraph()),
    );
    const result = resolver.resolve({ graph, phases: [[rule]] }).toTgGraph();

    expect(
      result.nodes[
        tgProjectionNodeIdFrom(
          DefaultProjectionLayers.Core,
          'aws.lambda:batch_messages.this',
        )
      ]?.projection,
    ).toMatchObject({
      address: 'aws.lambda:batch_messages.this',
      label: 'batch_messages.this',
    });
    expect(
      result.nodes[
        tgProjectionNodeIdFrom(
          DefaultProjectionLayers.Core,
          'aws.lambda:gemini_bulk_request.this',
        )
      ]?.projection,
    ).toMatchObject({
      address: 'aws.lambda:gemini_bulk_request.this',
      label: 'gemini_bulk_request.this',
    });
  });

  it('should keep graph unchanged when the rule does not match, when invoked on a non-first node, or when there are no projections', () => {
    const nodeA = tgNodeIdFrom('resource', 'aws_lambda_function.a');
    const nodeB = tgNodeIdFrom('resource', 'aws_lambda_function.b');
    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.a',
            resource: 'aws_lambda_function',
            name: 'a',
          },
        },
        [nodeB]: {
          id: nodeB,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.b',
            resource: 'aws_lambda_function',
            name: 'b',
          },
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      graph,
    );
    const node = adapter.getNodeAttributes(nodeB);
    if (!node) {
      throw new Error('Missing node attributes');
    }

    const unmatchedRule = new DeriveProjectionGraph({
      node: { nodeId: { eq: 'missing-node' } },
      options: {
        projections: [],
      },
    });
    unmatchedRule.match(nodeB, node, adapter);
    expect(unmatchedRule.apply(nodeB, node, adapter)).toBe(adapter);

    const nonFirstRule = createRule({
      projections: [
        {
          name: 'aws.lambda',
          rootNode: {
            attr: { key: 'terraform.resource', eq: 'aws_lambda_function' },
          },
        },
      ],
    });
    nonFirstRule.match(nodeB, node, adapter);
    expect(nonFirstRule.apply(nodeB, node, adapter)).toBe(adapter);

    const emptyRule = createRule();
    const firstNode = adapter.getNodeAttributes(nodeA);
    if (!firstNode) {
      throw new Error('Missing first node attributes');
    }
    emptyRule.match(nodeA, firstNode, adapter);
    expect(emptyRule.apply(nodeA, firstNode, adapter)).toBe(adapter);
  });

  it('should cover helper branches for parsing, traversal, grouping, and anchor merging', () => {
    const rootId = asNodeId('root');
    const memberId = asNodeId('member');
    const otherRootId = asNodeId('other-root');
    const projectionNodeId = asNodeId('projection-node');
    const excludedId = asNodeId('excluded');
    const missingResourceId = asNodeId('missing-resource');
    const includeMissId = asNodeId('include-miss');
    const duplicateA = asNodeId('duplicate-a');
    const duplicateB = asNodeId('duplicate-b');
    const fallbackId = asNodeId('fallback');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [rootId]: {
          id: rootId,
          terraform: {
            kind: 'resource',
            address: 'module.app.aws_lambda_function.root',
            resource: 'aws_lambda_function',
            name: 'root',
            parentModuleName: 'app',
          },
        },
        [memberId]: {
          id: memberId,
          terraform: {
            kind: 'resource',
            address: 'aws_iam_role.member',
            resource: 'aws_iam_role',
            name: 'member',
          },
        },
        [otherRootId]: {
          id: otherRootId,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.other',
            resource: 'aws_lambda_function',
            name: 'other',
          },
        },
        [projectionNodeId]: {
          id: projectionNodeId,
          projection: {
            layer: 'core',
            address: 'projection:node',
            label: 'Projection',
          },
        },
        [excludedId]: {
          id: excludedId,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.excluded',
            resource: 'aws_s3_bucket',
            name: 'excluded',
          },
        },
        [missingResourceId]: {
          id: missingResourceId,
          terraform: {
            kind: 'resource',
            address: 'aws_unknown.no_resource',
            name: 'no_resource',
          },
        },
        [includeMissId]: {
          id: includeMissId,
          terraform: {
            kind: 'resource',
            address: 'aws_dynamodb_table.include_miss',
            resource: 'aws_dynamodb_table',
            name: 'include_miss',
          },
        },
        [asNodeId('missing')]: {
          id: asNodeId('missing'),
          terraform: {
            kind: 'resource',
            address: 'aws_kms_key.missing',
            resource: 'aws_kms_key',
            name: 'missing',
          },
        },
        [duplicateA]: {
          id: duplicateA,
          terraform: {
            kind: 'resource',
            address: 'module.alpha.aws_lambda_function.this',
            resource: 'aws_lambda_function',
            name: 'this',
          },
        },
        [duplicateB]: {
          id: duplicateB,
          terraform: {
            kind: 'resource',
            address: 'module.beta.aws_lambda_function.this',
            resource: 'aws_lambda_function',
            name: 'this',
          },
        },
        [fallbackId]: {
          id: fallbackId,
          terraform: {
            kind: 'resource',
            resource: 'aws_cloudwatch_log_group',
          },
        },
      },
      edges: [
        { id: 'edge-root-member' as never, from: rootId, to: memberId },
        { id: 'edge-member-root' as never, from: memberId, to: rootId },
        { id: 'edge-root-other' as never, from: rootId, to: otherRootId },
        {
          id: 'edge-root-projection' as never,
          from: rootId,
          to: projectionNodeId,
        },
        { id: 'edge-root-excluded' as never, from: rootId, to: excludedId },
        {
          id: 'edge-root-missing-resource' as never,
          from: rootId,
          to: missingResourceId,
        },
        {
          id: 'edge-root-include-miss' as never,
          from: rootId,
          to: includeMissId,
        },
        {
          id: 'edge-root-missing' as never,
          from: rootId,
          to: asNodeId('missing'),
        },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const rule = createRule({
      projections: [
        {
          name: 'aws.lambda',
          rootNode: { any: true },
          membership: {
            maxDepth: 1,
            includeResources: ['aws_iam_role'],
            excludeResources: ['aws_s3_bucket'],
            stopAtOtherRootNodes: true,
          },
          relationships: {
            maxDepth: 2,
            minEvidence: 2,
          },
        },
      ],
    });
    const helpers = asHarness(rule);
    const resolved = helpers.resolveProjections()[0];
    const nodeMap = new Map(
      adapter
        .nodeIds()
        .filter((id) => id !== asNodeId('missing'))
        .map((id) => [id, adapter.getNodeAttributes(id)]),
    );

    expect(helpers.neighborIds(rootId, adapter)).toEqual(
      expect.arrayContaining([
        memberId,
        otherRootId,
        projectionNodeId,
        excludedId,
        missingResourceId,
        includeMissId,
        asNodeId('missing'),
      ]),
    );

    const expanded = helpers.expandMembership(
      resolved,
      rootId,
      nodeMap,
      adapter,
      new Set([rootId, otherRootId]),
    );
    expect([...expanded]).toEqual([rootId, memberId]);

    expect(
      helpers.shouldIncludeMember(
        nodeMap.get(missingResourceId),
        resolved.membership,
      ),
    ).toBe(false);
    expect(
      helpers.shouldIncludeMember(nodeMap.get(excludedId), {
        ...resolved.membership,
        includeResources: [],
      }),
    ).toBe(false);
    expect(
      helpers.shouldIncludeMember(
        nodeMap.get(includeMissId),
        resolved.membership,
      ),
    ).toBe(false);
    expect(
      helpers.shouldIncludeMember(nodeMap.get(memberId), resolved.membership),
    ).toBe(true);

    expect(helpers.buildProjectionPairKey(rootId, memberId)).toBe(
      `${String(rootId)}->${String(memberId)}`,
    );
    expect(
      helpers.parseProjectionPairKey(`${String(rootId)}->${String(memberId)}`),
    ).toEqual([rootId, memberId]);
    expect(() => helpers.parseProjectionPairKey('invalid')).toThrow(
      "Rule 'DeriveProjectionGraph' encountered an invalid projection pair key 'invalid'",
    );

    const rootNode = nodeMap.get(rootId);
    const fallbackNode = nodeMap.get(fallbackId);
    if (!rootNode || !fallbackNode) {
      throw new Error(
        'Missing expected node attributes for logical name tests',
      );
    }
    expect(helpers.logicalProjectionName(rootId, rootNode)).toBe('app.root');
    expect(helpers.logicalProjectionName(fallbackId, fallbackNode)).toBe(
      'aws_cloudwatch_log_group',
    );
    expect(
      helpers.logicalProjectionName(asNodeId('plain-node'), {
        id: asNodeId('plain-node'),
      }),
    ).toBe('plain-node');

    const duplicateMap = new Map([
      [duplicateA, nodeMap.get(duplicateA)],
      [duplicateB, nodeMap.get(duplicateB)],
    ]);
    const addresses = helpers.resolveProjectionAddresses(
      resolved,
      [duplicateA, duplicateB, asNodeId('missing-root')],
      duplicateMap,
    );
    expect(addresses.get(duplicateA)).toBe(
      'module.alpha.aws_lambda_function.this',
    );
    expect(addresses.get(duplicateB)).toBe(
      'module.beta.aws_lambda_function.this',
    );

    const labels = helpers.resolveProjectionLabels(
      resolved,
      [duplicateA, duplicateB, asNodeId('missing-root')],
      duplicateMap,
      addresses,
    );
    expect(labels.get(duplicateA)).toBe(
      'module.alpha.aws_lambda_function.this',
    );
    expect(labels.get(duplicateB)).toBe('module.beta.aws_lambda_function.this');

    expect(helpers.buildProjectionAddress(resolved, rootId, undefined)).toBe(
      'aws.lambda:root',
    );
    expect(
      helpers.buildProjectionAddress(resolved, asNodeId('   '), undefined),
    ).toBe('aws.lambda:unknown');
    expect(helpers.buildProjectionLabel(resolved, rootId, undefined)).toBe(
      'root',
    );

    expect(
      helpers.mergeProjectionAnchors(
        [{ nodeId: rootId, address: 'old', role: 'member' }],
        {
          nodeId: rootId,
          address: 'new',
          role: DefaultProjectionAnchorRoles.RootNode,
        },
      ),
    ).toEqual([
      {
        nodeId: rootId,
        address: 'new',
        role: DefaultProjectionAnchorRoles.RootNode,
      },
    ]);
    expect(
      helpers.mergeProjectionAnchors([], {
        nodeId: memberId,
        address: 'member',
        role: 'member',
      }),
    ).toEqual([
      {
        nodeId: memberId,
        address: 'member',
        role: 'member',
      },
    ]);

    expect(
      parseOptions({
        projections: [
          {
            name: 'aws.test',
            layer: 42,
            rootNode: { any: true },
            membership: {
              maxDepth: 'bad',
              includeResources: ['ok', 1],
              excludeResources: [2, 'skip'],
              stopAtOtherRootNodes: 'nope',
            },
            relationships: {
              maxDepth: 'bad',
              minEvidence: 'bad',
            },
          },
        ],
      }),
    ).toEqual({
      projections: [
        {
          name: 'aws.test',
          layer: undefined,
          rootNode: { any: true },
          membership: {
            maxDepth: undefined,
            includeResources: ['ok'],
            excludeResources: ['skip'],
            stopAtOtherRootNodes: undefined,
          },
          relationships: {
            maxDepth: undefined,
            minEvidence: undefined,
          },
        },
      ],
    });
    expect(
      parseOptions({
        projections: [
          {
            name: 'aws.invalid-include',
            rootNode: { any: true },
            membership: {
              includeResources: 'bad',
            },
          },
        ],
      }),
    ).toEqual({
      projections: [
        {
          name: 'aws.invalid-include',
          layer: undefined,
          rootNode: { any: true },
          membership: {
            maxDepth: undefined,
            includeResources: undefined,
            excludeResources: undefined,
            stopAtOtherRootNodes: undefined,
          },
          relationships: undefined,
        },
      ],
    });
    expect(
      parseOptions({
        projections: [
          {
            name: 'aws.valid',
            layer: 'core',
            rootNode: { any: true },
            membership: {
              maxDepth: 2,
              includeResources: ['aws_lambda_function'],
            },
            relationships: {
              maxDepth: 4,
              minEvidence: 2,
            },
          },
        ],
      }),
    ).toEqual({
      projections: [
        {
          name: 'aws.valid',
          layer: 'core',
          rootNode: { any: true },
          membership: {
            maxDepth: 2,
            includeResources: ['aws_lambda_function'],
            excludeResources: undefined,
            stopAtOtherRootNodes: undefined,
          },
          relationships: {
            maxDepth: 4,
            minEvidence: 2,
          },
        },
      ],
    });

    const fallbackDuplicateMap = new Map<NodeId, TgNodeAttributes | undefined>([
      [
        asNodeId('dup-no-address-a'),
        {
          id: asNodeId('dup-no-address-a'),
          terraform: {
            kind: 'resource',
            resource: 'aws_lambda_function',
            name: 'same',
          },
        },
      ],
      [
        asNodeId('dup-no-address-b'),
        {
          id: asNodeId('dup-no-address-b'),
          terraform: {
            kind: 'resource',
            resource: 'aws_lambda_function',
            name: 'same',
          },
        },
      ],
    ]);
    const fallbackAddresses = helpers.resolveProjectionAddresses(
      resolved,
      [asNodeId('dup-no-address-a'), asNodeId('dup-no-address-b')],
      fallbackDuplicateMap,
    );
    expect(fallbackAddresses.get(asNodeId('dup-no-address-a'))).toBe(
      'dup-no-address-a',
    );
    expect(
      helpers.resolveProjectionLabels(
        resolved,
        [asNodeId('dup-no-address-a'), asNodeId('dup-no-address-b')],
        fallbackDuplicateMap,
        undefined,
      ),
    ).toEqual(
      new Map([
        [asNodeId('dup-no-address-a'), 'same'],
        [asNodeId('dup-no-address-b'), 'same'],
      ]),
    );
  });

  it('should support wildcard membership resource filters', () => {
    const rule = createRule({
      projections: [
        {
          name: 'aws.test',
          rootNode: { any: true },
        },
      ],
    });
    const helpers = asHarness(rule);
    const resolved = helpers.resolveProjections()[0];

    const apiGatewayV2Integration: TgNodeAttributes = {
      id: asNodeId('api-gateway-v2-integration'),
      terraform: {
        kind: 'resource',
        address: 'aws_apigatewayv2_integration.example',
        resource: 'aws_apigatewayv2_integration',
        name: 'example',
      },
    };
    const apiGatewayStage: TgNodeAttributes = {
      id: asNodeId('api-gateway-stage'),
      terraform: {
        kind: 'resource',
        address: 'aws_api_gateway_stage.example',
        resource: 'aws_api_gateway_stage',
        name: 'example',
      },
    };
    const lambdaPermission: TgNodeAttributes = {
      id: asNodeId('lambda-permission'),
      terraform: {
        kind: 'resource',
        address: 'aws_lambda_permission.example',
        resource: 'aws_lambda_permission',
        name: 'example',
      },
    };
    const unrelated: TgNodeAttributes = {
      id: asNodeId('unrelated'),
      terraform: {
        kind: 'resource',
        address: 'aws_sns_topic.example',
        resource: 'aws_sns_topic',
        name: 'example',
      },
    };

    expect(
      helpers.shouldIncludeMember(apiGatewayV2Integration, {
        ...resolved.membership,
        includeResources: ['aws_apigatewayv2_*'],
      }),
    ).toBe(true);
    expect(
      helpers.shouldIncludeMember(apiGatewayStage, {
        ...resolved.membership,
        includeResources: ['aws_api_gateway_stage'],
      }),
    ).toBe(true);
    expect(
      helpers.shouldIncludeMember(apiGatewayStage, {
        ...resolved.membership,
        includeResources: ['aws_api_gateway_*'],
      }),
    ).toBe(true);
    expect(
      helpers.shouldIncludeMember(lambdaPermission, {
        ...resolved.membership,
        includeResources: ['aws_lambda_*'],
        excludeResources: ['aws_lambda_permission'],
      }),
    ).toBe(false);
    expect(
      helpers.shouldIncludeMember(apiGatewayV2Integration, {
        ...resolved.membership,
        includeResources: ['aws_api_gateway_*', 'aws_apigatewayv2_*'],
      }),
    ).toBe(true);
    expect(
      helpers.shouldIncludeMember(unrelated, {
        ...resolved.membership,
        includeResources: ['aws_api_gateway_*', 'aws_apigatewayv2_*'],
      }),
    ).toBe(false);
    expect(
      helpers.shouldIncludeMember(apiGatewayStage, {
        ...resolved.membership,
        excludeResources: ['aws_api_gateway_*'],
      }),
    ).toBe(false);
    expect(
      helpers.shouldIncludeMember(apiGatewayStage, {
        ...resolved.membership,
        includeResources: ['aws_api_gateway_stage*'],
      }),
    ).toBe(true);
  });

  it('should cover relationship inference branches and skip low-evidence derived edges', () => {
    const sourceProjectionId = asNodeId('projection-source');
    const targetProjectionId = asNodeId('projection-target');
    const memberA = asNodeId('member-a');
    const memberB = asNodeId('member-b');
    const targetMember = asNodeId('target-member');
    const memberC = asNodeId('member-c');
    const intermediate = asNodeId('intermediate');
    const deadEnd = asNodeId('dead-end');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [memberA]: {
          id: memberA,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.a',
            resource: 'aws_lambda_function',
            name: 'a',
          },
        },
        [memberB]: {
          id: memberB,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.b',
            resource: 'aws_lambda_function',
            name: 'b',
          },
        },
        [targetMember]: {
          id: targetMember,
          terraform: {
            kind: 'resource',
            address: 'aws_sqs_queue.target',
            resource: 'aws_sqs_queue',
            name: 'target',
          },
        },
        [memberC]: {
          id: memberC,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.c',
            resource: 'aws_lambda_function',
            name: 'c',
          },
        },
        [intermediate]: {
          id: intermediate,
          terraform: {
            kind: 'resource',
            address: 'aws_iam_role.intermediate',
            resource: 'aws_iam_role',
            name: 'intermediate',
          },
        },
        [deadEnd]: {
          id: deadEnd,
          terraform: {
            kind: 'resource',
            address: 'aws_iam_role.dead_end',
            resource: 'aws_iam_role',
            name: 'dead_end',
          },
        },
      },
      edges: [
        { id: 'edge-a-intermediate' as never, from: memberA, to: intermediate },
        { id: 'edge-a-target' as never, from: memberA, to: targetMember },
        { id: 'edge-b-target' as never, from: memberB, to: targetMember },
        { id: 'edge-c-target' as never, from: memberC, to: targetMember },
        {
          id: 'edge-intermediate-target' as never,
          from: intermediate,
          to: targetMember,
        },
        { id: 'edge-a-dead-end' as never, from: memberA, to: deadEnd },
      ],
    };
    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const rule = createRule({
      projections: [
        {
          name: 'source',
          rootNode: { any: true },
          relationships: { maxDepth: 2, minEvidence: 3 },
        },
      ],
    });
    const helpers = asHarness(rule);
    const resolved = helpers.resolveProjections()[0];
    const projectionDefinitions = new Map([
      [sourceProjectionId, resolved],
      [
        asNodeId('projection-depth-limited'),
        { ...resolved, relationships: { maxDepth: 1, minEvidence: 1 } },
      ],
    ]);
    const projectionRootNodes = new Map([
      [sourceProjectionId, memberA],
      [asNodeId('projection-depth-limited'), deadEnd],
    ]);
    const rootToProjections = new Map([
      [targetMember, new Set([targetProjectionId])],
      [memberA, new Set([sourceProjectionId])],
      [deadEnd, new Set([asNodeId('projection-depth-limited')])],
    ]);

    const evidence = helpers.inferAdjacencies(
      projectionDefinitions,
      projectionRootNodes,
      rootToProjections,
      adapter,
    );
    const targetEvidence = evidence.get(
      `${String(sourceProjectionId)}->${String(targetProjectionId)}`,
    );
    expect(targetEvidence).toMatchObject({
      evidenceCount: 2,
      shortestPathLength: 1,
      viaResourceTypes: ['aws_iam_role'],
    });

    const applyRule = createRule({
      projections: [
        {
          name: 'source',
          rootNode: { attr: { key: 'terraform.name', eq: 'a' } },
          relationships: { maxDepth: 2, minEvidence: 5 },
        },
        {
          name: 'target',
          rootNode: { attr: { key: 'terraform.name', eq: 'target' } },
        },
      ],
    });
    const resolver = new GraphResolver(
      new GraphologyAdapter(new DirectedGraph()),
    );
    const result = resolver
      .resolve({ graph: tg, phases: [[applyRule]] })
      .toTgGraph();
    const derivedEdge = result.edges.find(
      (edge) =>
        edge.from ===
          tgProjectionNodeIdFrom(DefaultProjectionLayers.Core, 'source:a') &&
        edge.to ===
          tgProjectionNodeIdFrom(DefaultProjectionLayers.Core, 'target:target'),
    );
    expect(derivedEdge).toBeUndefined();
  });

  it('should cover membership revisit and relationship depth-limit helper branches', () => {
    const rootId = asNodeId('root');
    const memberId = asNodeId('member');
    const intermediateId = asNodeId('intermediate');
    const projectionNodeId = asNodeId('projection-source');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [rootId]: {
          id: rootId,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.root',
            resource: 'aws_lambda_function',
            name: 'root',
          },
        },
        [memberId]: {
          id: memberId,
          terraform: {
            kind: 'resource',
            address: 'aws_iam_role.member',
            resource: 'aws_iam_role',
            name: 'member',
          },
        },
        [intermediateId]: {
          id: intermediateId,
          terraform: {
            kind: 'resource',
            address: 'aws_iam_role.intermediate',
            resource: 'aws_iam_role',
            name: 'intermediate',
          },
        },
      },
      edges: [
        { id: 'edge-root-member' as never, from: rootId, to: memberId },
        { id: 'edge-member-root' as never, from: memberId, to: rootId },
        {
          id: 'edge-root-intermediate' as never,
          from: rootId,
          to: intermediateId,
        },
      ],
    };
    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const rule = createRule({
      projections: [
        {
          name: 'aws.lambda',
          rootNode: { any: true },
          membership: {
            maxDepth: 2,
            includeResources: ['aws_iam_role'],
          },
          relationships: {
            maxDepth: 1,
            minEvidence: 1,
          },
        },
      ],
    });
    const helpers = asHarness(rule);
    const resolved = helpers.resolveProjections()[0];
    const nodeMap = new Map(
      adapter.nodeIds().map((id) => [id, adapter.getNodeAttributes(id)]),
    );

    expect([
      ...helpers.expandMembership(
        resolved,
        rootId,
        nodeMap,
        adapter,
        new Set([rootId]),
      ),
    ]).toEqual([rootId, memberId, intermediateId]);

    const evidence = helpers.inferAdjacencies(
      new Map([
        [
          projectionNodeId,
          { ...resolved, relationships: { maxDepth: 1, minEvidence: 1 } },
        ],
      ]),
      new Map([[projectionNodeId, rootId]]),
      new Map(),
      adapter,
    );
    expect(evidence.size).toBe(0);

    expect(
      helpers.inferAdjacencies(
        new Map(),
        new Map([[asNodeId('missing-projection'), rootId]]),
        new Map(),
        adapter,
      ).size,
    ).toBe(0);
    expect(
      helpers.inferAdjacencies(
        new Map([
          [
            projectionNodeId,
            { ...resolved, relationships: { maxDepth: 0, minEvidence: 1 } },
          ],
        ]),
        new Map([[projectionNodeId, rootId]]),
        new Map(),
        adapter,
      ).size,
    ).toBe(0);
  });

  it('should skip missing or disabled projections and cap recorded adjacency sample paths', () => {
    const sourceRootId = asNodeId('source-root');
    const pathOneId = asNodeId('path-one');
    const pathTwoId = asNodeId('path-two');
    const pathThreeId = asNodeId('path-three');
    const pathFourId = asNodeId('path-four');
    const targetRootId = asNodeId('target-root');
    const sourceProjectionId = asNodeId('projection-source');
    const targetProjectionId = asNodeId('projection-target');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [sourceRootId]: {
          id: sourceRootId,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.source',
            resource: 'aws_lambda_function',
            name: 'source',
          },
        },
        [pathOneId]: {
          id: pathOneId,
          terraform: {
            kind: 'resource',
            address: 'aws_iam_role.path_one',
            resource: 'aws_iam_role',
            name: 'path_one',
          },
        },
        [pathTwoId]: {
          id: pathTwoId,
          terraform: {
            kind: 'resource',
            address: 'aws_iam_role.path_two',
            resource: 'aws_iam_role',
            name: 'path_two',
          },
        },
        [pathThreeId]: {
          id: pathThreeId,
          terraform: {
            kind: 'resource',
            address: 'aws_iam_role.path_three',
            resource: 'aws_iam_role',
            name: 'path_three',
          },
        },
        [pathFourId]: {
          id: pathFourId,
          terraform: {
            kind: 'resource',
            address: 'aws_iam_role.path_four',
            resource: 'aws_iam_role',
            name: 'path_four',
          },
        },
        [targetRootId]: {
          id: targetRootId,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.target',
            resource: 'aws_lambda_function',
            name: 'target',
          },
        },
      },
      edges: [
        {
          id: 'edge-source-path-one' as never,
          from: sourceRootId,
          to: pathOneId,
        },
        {
          id: 'edge-path-one-target' as never,
          from: pathOneId,
          to: targetRootId,
        },
        {
          id: 'edge-source-path-two' as never,
          from: sourceRootId,
          to: pathTwoId,
        },
        {
          id: 'edge-path-two-target' as never,
          from: pathTwoId,
          to: targetRootId,
        },
        {
          id: 'edge-source-path-three' as never,
          from: sourceRootId,
          to: pathThreeId,
        },
        {
          id: 'edge-path-three-target' as never,
          from: pathThreeId,
          to: targetRootId,
        },
        {
          id: 'edge-source-path-four' as never,
          from: sourceRootId,
          to: pathFourId,
        },
        {
          id: 'edge-path-four-target' as never,
          from: pathFourId,
          to: targetRootId,
        },
      ],
    };
    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const rule = createRule({
      projections: [
        {
          name: 'aws.lambda',
          rootNode: { any: true },
          relationships: {
            maxDepth: 2,
            minEvidence: 1,
          },
        },
      ],
    });
    const helpers = asHarness(rule);
    const resolved = helpers.resolveProjections()[0];

    expect(
      helpers.inferAdjacencies(
        new Map(),
        new Map([[sourceProjectionId, sourceRootId]]),
        new Map(),
        adapter,
      ).size,
    ).toBe(0);
    expect(
      helpers.inferAdjacencies(
        new Map([
          [
            sourceProjectionId,
            { ...resolved, relationships: { maxDepth: 0, minEvidence: 1 } },
          ],
        ]),
        new Map([[sourceProjectionId, sourceRootId]]),
        new Map(),
        adapter,
      ).size,
    ).toBe(0);

    const evidence = helpers.inferAdjacencies(
      new Map([
        [sourceProjectionId, resolved],
        [targetProjectionId, resolved],
      ]),
      new Map([
        [sourceProjectionId, sourceRootId],
        [targetProjectionId, targetRootId],
      ]),
      new Map([
        [sourceRootId, new Set([sourceProjectionId])],
        [targetRootId, new Set([targetProjectionId])],
      ]),
      adapter,
    );
    const adjacencyEvidence = evidence.get(
      `${String(sourceProjectionId)}->${String(targetProjectionId)}`,
    );

    expect(adjacencyEvidence?.evidenceCount).toBe(4);
    expect(adjacencyEvidence?.viaResourceTypes).toEqual(['aws_iam_role']);
  });

  it('should collect distinct via resource types from multiple admissible paths', () => {
    const sourceRootId = asNodeId('source-root-mixed');
    const targetRootId = asNodeId('target-root-mixed');
    const integrationId = asNodeId('integration');
    const permissionId = asNodeId('permission');
    const sourceProjectionId = asNodeId('projection-source-mixed');
    const targetProjectionId = asNodeId('projection-target-mixed');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [sourceRootId]: {
          id: sourceRootId,
          terraform: {
            kind: 'resource',
            address: 'aws_apigatewayv2_api.source',
            resource: 'aws_apigatewayv2_api',
            name: 'source',
          },
        },
        [integrationId]: {
          id: integrationId,
          terraform: {
            kind: 'resource',
            address: 'aws_apigatewayv2_integration.path',
            resource: 'aws_apigatewayv2_integration',
            name: 'path',
          },
        },
        [permissionId]: {
          id: permissionId,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_permission.allow',
            resource: 'aws_lambda_permission',
            name: 'allow',
          },
        },
        [targetRootId]: {
          id: targetRootId,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.target',
            resource: 'aws_lambda_function',
            name: 'target',
          },
        },
      },
      edges: [
        {
          id: 'edge-source-integration' as never,
          from: sourceRootId,
          to: integrationId,
        },
        {
          id: 'edge-integration-target' as never,
          from: integrationId,
          to: targetRootId,
        },
        {
          id: 'edge-source-permission' as never,
          from: sourceRootId,
          to: permissionId,
        },
        {
          id: 'edge-permission-target' as never,
          from: permissionId,
          to: targetRootId,
        },
      ],
    };
    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const rule = createRule({
      projections: [
        {
          name: 'aws.lambda',
          rootNode: { any: true },
          relationships: {
            maxDepth: 2,
            minEvidence: 1,
          },
        },
      ],
    });
    const helpers = asHarness(rule);
    const resolved = helpers.resolveProjections()[0];

    const evidence = helpers.inferAdjacencies(
      new Map([
        [sourceProjectionId, resolved],
        [targetProjectionId, resolved],
      ]),
      new Map([
        [sourceProjectionId, sourceRootId],
        [targetProjectionId, targetRootId],
      ]),
      new Map([
        [sourceRootId, new Set([sourceProjectionId])],
        [targetRootId, new Set([targetProjectionId])],
      ]),
      adapter,
    );
    const adjacencyEvidence = evidence.get(
      `${String(sourceProjectionId)}->${String(targetProjectionId)}`,
    );

    expect(adjacencyEvidence?.evidenceCount).toBe(2);
    expect(adjacencyEvidence?.shortestPathLength).toBe(2);
    expect(adjacencyEvidence?.viaResourceTypes).toEqual([
      'aws_apigatewayv2_integration',
      'aws_lambda_permission',
    ]);
  });
});
