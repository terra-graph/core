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
    direction: 'in' | 'out' | 'both';
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
  projectionName: string;
  evidenceCount: number;
  shortestPathLength?: number;
  samplePaths: Array<{
    from: NodeId;
    to: NodeId;
    via?: NodeId[];
  }>;
};

type ParseOptionsResult = {
  projections: Array<{
    name: string;
    layer?: string;
    rootNode: unknown;
    membership?: {
      direction?: 'in' | 'out' | 'both';
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
  neighborIds(
    direction: 'in' | 'out' | 'both',
    nodeId: NodeId,
    graph: AdapterOperations,
  ): NodeId[];
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
  inferRelationships(
    projectionMembers: Map<NodeId, Set<NodeId>>,
    projectionDefinitions: Map<NodeId, TestResolvedProjection>,
    memberToProjections: Map<NodeId, Set<NodeId>>,
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
              direction: 'out',
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
    expect(projectedEdge?.attributes?.projection?.relationship).toEqual({
      source: 'derived',
      projectionName: 'aws.api_gateway',
      evidence: {
        derivedBy: 'anchor_path',
        evidenceCount: 1,
        shortestPathLength: 1,
        samplePaths: [
          {
            from: integration,
            to: lambda,
            via: [],
          },
        ],
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
            direction: 'both',
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

    expect(helpers.neighborIds('in', rootId, adapter)).toEqual([memberId]);
    expect(helpers.neighborIds('out', rootId, adapter)).toEqual([
      memberId,
      otherRootId,
      projectionNodeId,
      excludedId,
      missingResourceId,
      includeMissId,
      asNodeId('missing'),
    ]);
    expect(helpers.neighborIds('both', rootId, adapter)).toEqual(
      expect.arrayContaining([
        memberId,
        otherRootId,
        projectionNodeId,
        excludedId,
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
              direction: 7,
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
            direction: undefined,
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
            direction: undefined,
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
              direction: 'out',
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
            direction: 'out',
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
    const projectionMembers = new Map([
      [sourceProjectionId, new Set([memberA, memberB, memberC])],
      [asNodeId('projection-skip'), new Set([deadEnd])],
    ]);
    const projectionDefinitions = new Map([
      [sourceProjectionId, resolved],
      [
        asNodeId('projection-depth-limited'),
        { ...resolved, relationships: { maxDepth: 1, minEvidence: 1 } },
      ],
    ]);
    const memberToProjections = new Map([
      [targetMember, new Set([targetProjectionId])],
      [memberA, new Set([sourceProjectionId])],
      [memberB, new Set([sourceProjectionId])],
      [memberC, new Set([sourceProjectionId])],
      [deadEnd, new Set([asNodeId('projection-depth-limited')])],
    ]);

    const evidence = helpers.inferRelationships(
      projectionMembers,
      projectionDefinitions,
      memberToProjections,
      adapter,
    );
    const targetEvidence = evidence.get(
      `${String(sourceProjectionId)}->${String(targetProjectionId)}`,
    );
    expect(targetEvidence).toMatchObject({
      projectionName: 'source',
      evidenceCount: 4,
      shortestPathLength: 1,
    });
    expect(targetEvidence?.samplePaths).toHaveLength(3);

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
            direction: 'both',
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

    const evidence = helpers.inferRelationships(
      new Map([[projectionNodeId, new Set([rootId])]]),
      new Map([
        [
          projectionNodeId,
          { ...resolved, relationships: { maxDepth: 1, minEvidence: 1 } },
        ],
      ]),
      new Map(),
      adapter,
    );
    expect(evidence.size).toBe(0);
  });
});
