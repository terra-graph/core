import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from '../../Adapters/GraphologyAdapter.js';
import { GraphResolver } from '../../GraphResolver.js';
import {
  DefaultProjectionAnchorRoles,
  DefaultProjectionLayers,
  DefaultProjectionMembershipRelations,
  DefaultProjectionRelationshipRelations,
  NodeId,
  TG_SCHEMA_VERSION,
  TgGraph,
  asNodeId,
  tgNodeIdFrom,
  tgProjectionNodeIdFrom,
} from '../../TgGraph.js';
import { DeriveProjectionGraph } from './DeriveProjectionGraph.js';

type ResolvedStrategyLike = {
  id: string;
  layer: string;
  category?: string;
  groupBy?: string;
  display?: {
    prefix?: string;
    from?: string;
  };
  membership: {
    direction: 'in' | 'out' | 'both';
    maxDepth: number;
    includeResources: string[];
    excludeResources: string[];
    stopAtOtherTriggers: boolean;
  };
  relationships: {
    relation: string;
    maxDepth: number;
    minEvidence: number;
  };
};

type RelationshipEvidenceLike = {
  evidenceCount: number;
  shortestPathLength?: number;
  minEvidence: number;
  samplePaths?: unknown[];
};

type DeriveProjectionGraphPrivate = {
  resolveStrategies(): ResolvedStrategyLike[];
  neighborIds(
    direction: 'in' | 'out' | 'both',
    nodeId: NodeId,
    graph: GraphologyAdapter,
  ): NodeId[];
  shouldIncludeMember(
    node: Record<string, unknown>,
    membership: ResolvedStrategyLike['membership'],
  ): boolean;
  expandMembership(
    strategy: ResolvedStrategyLike,
    triggerId: NodeId,
    nodeMap: Map<NodeId, Record<string, unknown>>,
    graph: GraphologyAdapter,
    allTriggerNodes: Set<NodeId>,
  ): Set<NodeId>;
  groupValue(
    groupBy:
      | 'address'
      | 'resource_name'
      | 'module_address'
      | 'parent_module'
      | 'name',
    triggerId: NodeId,
    triggerNode: Record<string, unknown>,
  ): string;
  logicalProjectionName(
    triggerId: NodeId,
    triggerNode: Record<string, unknown>,
  ): string;
  preferredProjectionLabel(
    strategy: ResolvedStrategyLike,
    triggerId: NodeId,
    triggerNode: Record<string, unknown>,
  ): string;
  buildProjectionAddress(
    strategy: ResolvedStrategyLike,
    triggerId: NodeId,
    resolvedAddresses: Map<NodeId, string> | undefined,
  ): string;
  buildProjectionLabel(
    strategy: ResolvedStrategyLike,
    triggerId: NodeId,
    resolvedLabels: Map<NodeId, string> | undefined,
  ): string;
  mergeProjectionAnchors(
    existing: Array<{ nodeId: NodeId; address?: string; role?: string }>,
    next: { nodeId: NodeId; address?: string; role?: string },
  ): Array<{ nodeId: NodeId; address?: string; role?: string }>;
  inferRelationships(
    projectionMembers: Map<NodeId, Set<NodeId>>,
    projectionStrategies: Map<NodeId, ResolvedStrategyLike>,
    memberToProjections: Map<NodeId, Set<NodeId>>,
    graph: GraphologyAdapter,
  ): Map<string, RelationshipEvidenceLike>;
  resolveProjectionAddresses(
    strategy: ResolvedStrategyLike,
    triggerIds: NodeId[],
    nodeMap: Map<NodeId, Record<string, unknown>>,
  ): Map<NodeId, string>;
  resolveProjectionLabels(
    strategy: ResolvedStrategyLike,
    triggerIds: NodeId[],
    nodeMap: Map<NodeId, Record<string, unknown>>,
    resolvedAddresses: Map<NodeId, string> | undefined,
  ): Map<NodeId, string>;
};

describe('DeriveProjectionGraph', () => {
  const createRule = (options: unknown = { strategies: [] }) =>
    new DeriveProjectionGraph({
      node: { any: true },
      options: options as never,
    });
  const asPrivateRule = (rule: DeriveProjectionGraph) =>
    rule as unknown as DeriveProjectionGraphPrivate;

  describe('constructor', () => {
    it('should require options', () => {
      expect(
        () =>
          new DeriveProjectionGraph({
            node: { any: true },
          }),
      ).toThrow(`Rule 'DeriveProjectionGraph' requires options in config`);
    });

    it('should require options.strategies', () => {
      expect(() =>
        createRule({
          strategy: [],
        }),
      ).toThrow(`Rule 'DeriveProjectionGraph' requires options.strategies`);
    });

    it('should require each strategy to have an id', () => {
      expect(() =>
        createRule({
          strategies: [{ trigger: { any: true } }],
        }),
      ).toThrow(
        `Rule 'DeriveProjectionGraph' strategy at index 0 requires an id`,
      );
    });

    it('should require each strategy to have a trigger', () => {
      expect(() =>
        createRule({
          strategies: [{ id: 'aws.lambda' }],
        }),
      ).toThrow(
        `Rule 'DeriveProjectionGraph' strategy 'aws.lambda' requires a trigger query`,
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
      node: { any: true },
      options: {
        strategies: [
          {
            id: 'aws.api_gateway',
            trigger: {
              attr: { key: 'terraform.resource', eq: 'aws_apigatewayv2_api' },
            },
            display: { prefix: 'API', from: 'terraform.name' },
            category: 'service',
            membership: {
              direction: 'out',
              maxDepth: 1,
              includeResources: ['aws_apigatewayv2_integration'],
            },
            relationships: {
              relation: 'invokes',
              maxDepth: 2,
            },
          },
          {
            id: 'aws.lambda',
            trigger: {
              attr: { key: 'terraform.resource', eq: 'aws_lambda_function' },
            },
            display: { prefix: 'Lambda', from: 'terraform.name' },
            category: 'runtime',
            relationships: {
              relation: 'invokes',
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
      label: 'API public',
      category: 'service',
      derivation: {
        source: 'plugin',
        strategyId: 'aws.api_gateway',
        groupKey: 'aws.api_gateway:public',
        primaryAnchorNodeId: api,
        anchors: [
          {
            nodeId: api,
            address: 'aws_apigatewayv2_api.public',
            role: 'trigger',
          },
        ],
      },
    });
    expect(result.nodes[lambdaProjectionId]?.projection).toEqual({
      layer: 'core',
      address: 'aws.lambda:handler',
      label: 'Lambda handler',
      category: 'runtime',
      derivation: {
        source: 'plugin',
        strategyId: 'aws.lambda',
        groupKey: 'aws.lambda:handler',
        primaryAnchorNodeId: lambda,
        anchors: [
          {
            nodeId: lambda,
            address: 'aws_lambda_function.handler',
            role: 'trigger',
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

    const supportsEdge = result.edges.find(
      (edge) => edge.from === integration && edge.to === apiProjectionId,
    );
    expect(supportsEdge?.attributes?.projection?.membership?.relation).toBe(
      DefaultProjectionMembershipRelations.ContributesTo,
    );

    const projectedEdge = result.edges.find(
      (edge) => edge.from === apiProjectionId && edge.to === lambdaProjectionId,
    );
    expect(projectedEdge?.attributes?.projection?.relationship?.relation).toBe(
      DefaultProjectionRelationshipRelations.Invokes,
    );
    expect(
      projectedEdge?.attributes?.projection?.relationship?.evidence,
    ).toEqual({
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
    });
  });

  it('should derive separate projections for repeated module-wrapped trigger names by default', () => {
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

    const rule = new DeriveProjectionGraph({
      node: { any: true },
      options: {
        strategies: [
          {
            id: 'aws.lambda',
            trigger: {
              attr: { key: 'terraform.resource', eq: 'aws_lambda_function' },
            },
            category: 'runtime',
          },
        ],
      },
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

  it('should disambiguate duplicate display labels when triggers resolve to different projections', () => {
    const bucketA = tgNodeIdFrom(
      'resource',
      'module.input.aws_s3_bucket.s3_bucket_prod',
    );
    const bucketB = tgNodeIdFrom(
      'resource',
      'module.output.aws_s3_bucket.s3_bucket_prod',
    );

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [bucketA]: {
          id: bucketA,
          terraform: {
            kind: 'resource',
            address: 'module.input.aws_s3_bucket.s3_bucket_prod',
            resource: 'aws_s3_bucket',
            name: 's3_bucket_prod',
            moduleAddress: 'module.input',
            parentModuleName: 'input',
          },
        },
        [bucketB]: {
          id: bucketB,
          terraform: {
            kind: 'resource',
            address: 'module.output.aws_s3_bucket.s3_bucket_prod',
            resource: 'aws_s3_bucket',
            name: 's3_bucket_prod',
            moduleAddress: 'module.output',
            parentModuleName: 'output',
          },
        },
      },
      edges: [],
    };

    const rule = new DeriveProjectionGraph({
      node: { any: true },
      options: {
        strategies: [
          {
            id: 'aws.s3',
            trigger: {
              attr: { key: 'terraform.resource', eq: 'aws_s3_bucket' },
            },
            display: { prefix: 'S3', from: 'terraform.name' },
            category: 'store',
          },
        ],
      },
    });

    const resolver = new GraphResolver(
      new GraphologyAdapter(new DirectedGraph()),
    );
    const result = resolver.resolve({ graph, phases: [[rule]] }).toTgGraph();

    expect(
      result.nodes[
        tgProjectionNodeIdFrom(
          DefaultProjectionLayers.Core,
          'aws.s3:input.s3_bucket_prod',
        )
      ]?.projection,
    ).toMatchObject({
      address: 'aws.s3:input.s3_bucket_prod',
      label: 'S3 input.s3_bucket_prod',
    });
    expect(
      result.nodes[
        tgProjectionNodeIdFrom(
          DefaultProjectionLayers.Core,
          'aws.s3:output.s3_bucket_prod',
        )
      ]?.projection,
    ).toMatchObject({
      address: 'aws.s3:output.s3_bucket_prod',
      label: 'S3 output.s3_bucket_prod',
    });
  });

  it('should retain all trigger anchors when multiple triggers are explicitly collapsed to one projection', () => {
    const lambdaA = tgNodeIdFrom(
      'resource',
      'module.payments.aws_lambda_function.authorizer',
    );
    const lambdaB = tgNodeIdFrom(
      'resource',
      'module.payments.aws_lambda_function.processor',
    );

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [lambdaA]: {
          id: lambdaA,
          terraform: {
            kind: 'resource',
            address: 'module.payments.aws_lambda_function.authorizer',
            resource: 'aws_lambda_function',
            name: 'authorizer',
            moduleAddress: 'module.payments',
            parentModuleName: 'payments',
          },
        },
        [lambdaB]: {
          id: lambdaB,
          terraform: {
            kind: 'resource',
            address: 'module.payments.aws_lambda_function.processor',
            resource: 'aws_lambda_function',
            name: 'processor',
            moduleAddress: 'module.payments',
            parentModuleName: 'payments',
          },
        },
      },
      edges: [],
    };

    const rule = new DeriveProjectionGraph({
      node: { any: true },
      options: {
        strategies: [
          {
            id: 'aws.lambda',
            trigger: {
              attr: { key: 'terraform.resource', eq: 'aws_lambda_function' },
            },
            groupBy: 'parent_module',
            display: { prefix: 'Lambda', from: 'terraform.parentModuleName' },
            category: 'runtime',
          },
        ],
      },
    });

    const resolver = new GraphResolver(
      new GraphologyAdapter(new DirectedGraph()),
    );
    const result = resolver.resolve({ graph, phases: [[rule]] }).toTgGraph();
    const projectionId = tgProjectionNodeIdFrom(
      DefaultProjectionLayers.Core,
      'aws.lambda:payments',
    );

    expect(result.nodes[projectionId]?.projection).toEqual({
      layer: 'core',
      address: 'aws.lambda:payments',
      label: 'Lambda payments',
      category: 'runtime',
      derivation: {
        source: 'plugin',
        strategyId: 'aws.lambda',
        groupKey: 'aws.lambda:payments',
        primaryAnchorNodeId: lambdaA,
        anchors: [
          {
            nodeId: lambdaA,
            address: 'module.payments.aws_lambda_function.authorizer',
            role: 'trigger',
          },
          {
            nodeId: lambdaB,
            address: 'module.payments.aws_lambda_function.processor',
            role: 'trigger',
          },
        ],
      },
    });

    expect(
      result.edges.filter(
        (edge) => edge.to === projectionId && edge.from === lambdaA,
      ),
    ).toHaveLength(1);
    expect(
      result.edges.filter(
        (edge) => edge.to === projectionId && edge.from === lambdaB,
      ),
    ).toHaveLength(1);
  });

  it('should keep graph unchanged when the rule does not match, when invoked on a non-first node, or when there are no strategies', () => {
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
        strategies: [],
      },
    });
    unmatchedRule.match(nodeB, node, adapter);
    expect(unmatchedRule.apply(nodeB, node, adapter)).toBe(adapter);

    const nonFirstRule = new DeriveProjectionGraph({
      node: { any: true },
      options: {
        strategies: [
          {
            id: 'aws.lambda',
            trigger: {
              attr: { key: 'terraform.resource', eq: 'aws_lambda_function' },
            },
          },
        ],
      },
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

  it('should honor minEvidence and helper branches for membership, directions, grouping, and labels', () => {
    const rule = createRule({
      strategies: [
        {
          id: 'aws.lambda',
          trigger: { any: true },
          membership: {
            includeResources: ['aws_lambda_function', 1],
            excludeResources: ['aws_iam_role', 2],
          },
          relationships: {
            relation: 'depends_on',
            minEvidence: 2,
            maxDepth: 1,
          },
        },
      ],
    });

    const sourceProjectionId = asNodeId('projection-source');
    const targetProjectionId = asNodeId('projection-target');
    const memberA = asNodeId('member-a');
    const memberB = asNodeId('member-b');
    const projectionNode = asNodeId('projection-neighbor');
    const inbound = asNodeId('inbound');
    const terraformNode = {
      terraform: {
        kind: 'resource' as const,
        address: 'module.alpha.aws_lambda_function.handler',
        resource: 'aws_lambda_function',
        name: 'handler',
        moduleAddress: 'module.alpha',
        parentModuleName: 'alpha',
      },
    };

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [memberA]: { id: memberA, ...terraformNode },
        [memberB]: {
          id: memberB,
          terraform: {
            kind: 'resource',
            address: 'aws_sqs_queue.jobs',
            resource: 'aws_sqs_queue',
            name: 'jobs',
          },
        },
        [projectionNode]: {
          id: projectionNode,
          projection: {
            layer: 'core',
            address: 'aws.lambda:projection',
            label: 'projection',
          },
        },
        [inbound]: {
          id: inbound,
          terraform: {
            kind: 'resource',
            address: 'aws_iam_role.reader',
            resource: 'aws_iam_role',
            name: 'reader',
          },
        },
        [targetProjectionId]: {
          id: targetProjectionId,
          projection: {
            layer: 'core',
            address: 'aws.sqs:jobs',
            label: 'jobs',
          },
        },
      },
      edges: [
        { id: 'a-b' as never, from: memberA, to: memberB },
        { id: 'b-a' as never, from: memberB, to: memberA },
        { id: 'b-proj' as never, from: memberB, to: projectionNode },
        { id: 'in-a' as never, from: inbound, to: memberA },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      graph,
    );
    const privateRule = asPrivateRule(rule);
    const strategy = privateRule.resolveStrategies()[0];

    expect(privateRule.neighborIds('in', memberA, adapter)).toEqual([
      memberB,
      inbound,
    ]);
    expect(privateRule.neighborIds('out', memberA, adapter)).toEqual([memberB]);
    expect(new Set(privateRule.neighborIds('both', memberA, adapter))).toEqual(
      new Set([inbound, memberB]),
    );

    expect(privateRule.shouldIncludeMember({}, strategy.membership)).toBe(
      false,
    );
    expect(
      privateRule.shouldIncludeMember(
        {
          terraform: { resource: 'aws_iam_role' },
        },
        strategy.membership,
      ),
    ).toBe(false);
    expect(
      privateRule.shouldIncludeMember(
        {
          terraform: { resource: 'aws_sqs_queue' },
        },
        { ...strategy.membership, includeResources: ['aws_lambda_function'] },
      ),
    ).toBe(false);

    const stopMembershipStrategy: ResolvedStrategyLike = {
      ...strategy,
      membership: {
        ...strategy.membership,
        direction: 'both',
        maxDepth: 2,
        includeResources: [],
        excludeResources: [],
        stopAtOtherTriggers: true,
      },
    };
    const members = privateRule.expandMembership(
      stopMembershipStrategy,
      memberA,
      new Map([
        [memberA, { id: memberA, ...terraformNode }],
        [
          memberB,
          {
            id: memberB,
            terraform: {
              kind: 'resource',
              address: 'aws_sqs_queue.jobs',
              resource: 'aws_sqs_queue',
              name: 'jobs',
            },
          },
        ],
        [projectionNode, graph.nodes[projectionNode]],
        [inbound, graph.nodes[inbound]],
      ]),
      adapter,
      new Set([memberA, memberB]),
    );
    expect(members).toEqual(new Set([memberA, inbound]));

    const filteredMembers = privateRule.expandMembership(
      {
        ...strategy,
        membership: {
          ...strategy.membership,
          direction: 'out',
          maxDepth: 2,
          includeResources: ['aws_lambda_function'],
          excludeResources: [],
          stopAtOtherTriggers: false,
        },
      },
      memberA,
      new Map([
        [memberA, { id: memberA, ...terraformNode }],
        [
          memberB,
          {
            id: memberB,
            terraform: {
              kind: 'resource',
              address: 'aws_sqs_queue.jobs',
              resource: 'aws_sqs_queue',
              name: 'jobs',
            },
          },
        ],
        [projectionNode, graph.nodes[projectionNode]],
      ]),
      adapter,
      new Set<NodeId>(),
    );
    expect(filteredMembers).toEqual(new Set([memberA]));

    const projectionSkippingMembers = privateRule.expandMembership(
      {
        ...strategy,
        membership: {
          ...strategy.membership,
          direction: 'out',
          maxDepth: 2,
          includeResources: [],
          excludeResources: [],
          stopAtOtherTriggers: false,
        },
      },
      memberA,
      new Map([
        [memberA, { id: memberA, ...terraformNode }],
        [
          memberB,
          {
            id: memberB,
            terraform: {
              kind: 'resource',
              address: 'aws_sqs_queue.jobs',
              resource: 'aws_sqs_queue',
              name: 'jobs',
            },
          },
        ],
        [projectionNode, graph.nodes[projectionNode]],
      ]),
      adapter,
      new Set<NodeId>(),
    );
    expect(projectionSkippingMembers).toEqual(new Set([memberA, memberB]));

    expect(privateRule.groupValue('address', memberA, terraformNode)).toBe(
      'module.alpha.aws_lambda_function.handler',
    );
    expect(
      privateRule.groupValue('resource_name', memberA, terraformNode),
    ).toBe('aws_lambda_function.handler');
    expect(
      privateRule.groupValue('module_address', memberA, terraformNode),
    ).toBe('module.alpha');
    expect(
      privateRule.groupValue('parent_module', memberA, terraformNode),
    ).toBe('alpha');
    expect(privateRule.groupValue('name', memberA, terraformNode)).toBe(
      'handler',
    );
    expect(privateRule.groupValue('name', asNodeId('fallback'), {})).toBe(
      String(asNodeId('fallback')),
    );

    expect(
      privateRule.logicalProjectionName(asNodeId('resource-only'), {
        terraform: { resource: 'aws_lambda_function' },
      }),
    ).toBe('aws_lambda_function');
    expect(privateRule.logicalProjectionName(asNodeId('id-only'), {})).toBe(
      String(asNodeId('id-only')),
    );

    expect(
      privateRule.preferredProjectionLabel(
        { ...strategy, display: { from: '' } },
        memberA,
        terraformNode,
      ),
    ).toBe('alpha.handler');
    expect(
      privateRule.preferredProjectionLabel(
        { ...strategy, display: { from: 'terraform.missing' } },
        memberA,
        terraformNode,
      ),
    ).toBe('alpha.handler');

    expect(
      privateRule.buildProjectionAddress(strategy, memberA, undefined),
    ).toBe(`aws.lambda:${String(memberA)}`);
    expect(
      privateRule.buildProjectionLabel(
        { ...strategy, display: { prefix: 'Lambda' } },
        memberA,
        undefined,
      ),
    ).toBe(`Lambda ${String(memberA)}`);

    expect(
      privateRule.mergeProjectionAnchors(
        [
          {
            nodeId: memberA,
            address: 'old',
            role: DefaultProjectionAnchorRoles.Trigger,
          },
        ],
        {
          nodeId: memberA,
          address: 'new',
          role: DefaultProjectionAnchorRoles.Trigger,
        },
      ),
    ).toEqual([
      {
        nodeId: memberA,
        address: 'new',
        role: DefaultProjectionAnchorRoles.Trigger,
      },
    ]);

    const relationshipEvidence = privateRule.inferRelationships(
      new Map([[sourceProjectionId, new Set([memberA])]]),
      new Map([
        [
          sourceProjectionId,
          {
            ...strategy,
            relationships: {
              ...strategy.relationships,
              maxDepth: 2,
              minEvidence: 2,
            },
          },
        ],
      ]),
      new Map([[memberB, new Set([targetProjectionId])]]),
      adapter,
    );
    expect(
      relationshipEvidence.get(
        `${String(sourceProjectionId)}->${String(targetProjectionId)}`,
      ),
    ).toMatchObject({
      evidenceCount: 1,
      shortestPathLength: 1,
      minEvidence: 2,
    });

    const traversalOnlyEvidence = privateRule.inferRelationships(
      new Map([[sourceProjectionId, new Set([memberA])]]),
      new Map([
        [
          sourceProjectionId,
          {
            ...strategy,
            relationships: {
              ...strategy.relationships,
              maxDepth: 1,
            },
          },
        ],
      ]),
      new Map(),
      adapter,
    );
    expect(traversalOnlyEvidence.size).toBe(0);

    const skippedEvidence = privateRule.inferRelationships(
      new Map([[sourceProjectionId, new Set([memberA])]]),
      new Map(),
      new Map(),
      adapter,
    );
    expect(skippedEvidence.size).toBe(0);

    const lowEvidenceGraph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [memberA]: { id: memberA, ...terraformNode },
        [memberB]: {
          id: memberB,
          terraform: {
            kind: 'resource',
            address: 'aws_sqs_queue.jobs',
            resource: 'aws_sqs_queue',
            name: 'jobs',
          },
        },
      },
      edges: [{ id: 'a-b' as never, from: memberA, to: memberB }],
    };
    const lowEvidenceResult = new GraphResolver(
      new GraphologyAdapter(new DirectedGraph()),
    )
      .resolve({
        graph: lowEvidenceGraph,
        phases: [
          [
            new DeriveProjectionGraph({
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
                    relationships: {
                      minEvidence: 2,
                      maxDepth: 1,
                    },
                  },
                  {
                    id: 'aws.sqs',
                    trigger: {
                      attr: {
                        key: 'terraform.resource',
                        eq: 'aws_sqs_queue',
                      },
                    },
                  },
                ],
              },
            }),
          ],
        ],
      })
      .toTgGraph();

    expect(
      lowEvidenceResult.edges.find(
        (edge) =>
          String(edge.from).includes('aws.lambda') &&
          String(edge.to).includes('aws.sqs'),
      ),
    ).toBeUndefined();
  });

  it('should normalize parser input and helper fallbacks', () => {
    const rule = createRule({
      strategies: [
        {
          id: 'aws.mixed',
          layer: 1,
          category: 2,
          trigger: { any: true },
          groupBy: 3,
          display: { prefix: 4, from: 5 },
          membership: {
            direction: 'out',
            maxDepth: 'x',
            includeResources: ['aws_lambda_function', 1],
            excludeResources: ['aws_iam_role', 2],
            stopAtOtherTriggers: 'nope',
          },
          relationships: {
            relation: 'invokes',
            maxDepth: 'later',
            minEvidence: 'later',
          },
        },
      ],
    });

    const privateRule = asPrivateRule(rule);
    const strategy = privateRule.resolveStrategies()[0];

    expect(strategy.layer).toBe(DefaultProjectionLayers.Core);
    expect(strategy.category).toBeUndefined();
    expect(strategy.groupBy).toBeUndefined();
    expect(strategy.display).toEqual({ prefix: undefined, from: undefined });
    expect(strategy.membership).toMatchObject({
      direction: 'out',
      maxDepth: 0,
      includeResources: ['aws_lambda_function'],
      excludeResources: ['aws_iam_role'],
      stopAtOtherTriggers: true,
    });
    expect(strategy.relationships).toMatchObject({
      relation: 'invokes',
      maxDepth: 3,
      minEvidence: 1,
    });

    expect(privateRule.groupValue('address', asNodeId('fallback'), {})).toBe(
      String(asNodeId('fallback')),
    );
    expect(
      privateRule.groupValue('resource_name', asNodeId('fallback'), {}),
    ).toBe(`resource.${String(asNodeId('fallback'))}`);
    expect(
      privateRule.groupValue('module_address', asNodeId('fallback'), {}),
    ).toBe('root');
    expect(
      privateRule.groupValue('parent_module', asNodeId('fallback'), {}),
    ).toBe('root');

    const whitespaceId = asNodeId('whitespace');
    const whitespaceStrategy = {
      ...strategy,
      groupBy: 'name',
    };
    expect(
      privateRule
        .resolveProjectionAddresses(
          whitespaceStrategy,
          [whitespaceId],
          new Map([
            [
              whitespaceId,
              {
                id: whitespaceId,
                terraform: {
                  kind: 'resource',
                  address: 'aws_lambda_function.whitespace',
                  resource: 'aws_lambda_function',
                  name: '   ',
                },
              },
            ],
          ]),
        )
        .get(whitespaceId),
    ).toBe('unknown');

    const labelId = asNodeId('label-node');
    expect(
      privateRule
        .resolveProjectionLabels(
          { ...strategy, display: undefined },
          [labelId],
          new Map([
            [
              labelId,
              {
                id: labelId,
                terraform: {
                  kind: 'resource',
                  address: 'aws_lambda_function.label',
                  resource: 'aws_lambda_function',
                  name: 'label',
                },
              },
            ],
          ]),
          undefined,
        )
        .get(labelId),
    ).toBe('label');
  });

  it('should parse explicit strategy metadata branches and duplicate address fallback to node id', () => {
    const rule = createRule({
      strategies: [
        {
          id: 'aws.explicit',
          layer: 'core',
          category: 'runtime',
          trigger: { any: true },
          groupBy: 'address',
          display: { prefix: 'Lambda', from: 'terraform.name' },
          membership: {
            direction: 'in',
            maxDepth: 2,
            stopAtOtherTriggers: false,
          },
          relationships: {
            relation: 'invokes',
            maxDepth: 4,
            minEvidence: 2,
          },
        },
      ],
    });

    const privateRule = asPrivateRule(rule);
    const strategy = privateRule.resolveStrategies()[0];
    expect(strategy.layer).toBe('core');
    expect(strategy.category).toBe('runtime');
    expect(strategy.groupBy).toBe('address');
    expect(strategy.display).toEqual({
      prefix: 'Lambda',
      from: 'terraform.name',
    });
    expect(strategy.membership).toMatchObject({
      direction: 'in',
      maxDepth: 2,
      includeResources: [],
      excludeResources: [],
      stopAtOtherTriggers: false,
    });
    expect(strategy.relationships).toMatchObject({
      relation: 'invokes',
      maxDepth: 4,
      minEvidence: 2,
    });

    const a = asNodeId('dup-a');
    const b = asNodeId('dup-b');
    expect(
      privateRule
        .resolveProjectionAddresses(
          { ...strategy, groupBy: undefined },
          [a, b],
          new Map([
            [
              a,
              {
                id: a,
                terraform: {
                  kind: 'resource',
                  resource: 'aws_lambda_function',
                  name: 'this',
                  parentModuleName: 'dup',
                },
              },
            ],
            [
              b,
              {
                id: b,
                terraform: {
                  kind: 'resource',
                  resource: 'aws_lambda_function',
                  name: 'this',
                  parentModuleName: 'dup',
                },
              },
            ],
          ]),
        )
        .get(a),
    ).toBe(String(a));
  });

  it('should cover duplicate address and label fallbacks plus repeated relationship evidence', () => {
    const rule = createRule({
      strategies: [
        {
          id: 'aws.lambda',
          trigger: { any: true },
          display: { from: 'terraform.name' },
          relationships: {
            relation: 'depends_on',
            maxDepth: 2,
            minEvidence: 1,
          },
        },
      ],
    });
    const privateRule = asPrivateRule(rule);
    const strategy = privateRule.resolveStrategies()[0];

    const a = asNodeId('a');
    const b = asNodeId('b');
    const c = asNodeId('c');
    const d = asNodeId('d');
    const target = asNodeId('target');
    const targetProjection = asNodeId('target-projection');
    const sourceProjection = asNodeId('source-projection');

    const duplicateNodeMap = new Map([
      [
        a,
        {
          id: a,
          terraform: {
            kind: 'resource' as const,
            address: 'module.one.aws_lambda_function.this',
            resource: 'aws_lambda_function',
            name: 'this',
            parentModuleName: 'shared',
          },
        },
      ],
      [
        b,
        {
          id: b,
          terraform: {
            kind: 'resource' as const,
            address: 'module.two.aws_lambda_function.this',
            resource: 'aws_lambda_function',
            name: 'this',
            parentModuleName: 'shared',
          },
        },
      ],
    ]);

    const duplicateAddresses = privateRule.resolveProjectionAddresses(
      strategy,
      [a, b],
      duplicateNodeMap,
    );
    expect(duplicateAddresses.get(a)).toBe(
      'module.one.aws_lambda_function.this',
    );
    expect(duplicateAddresses.get(b)).toBe(
      'module.two.aws_lambda_function.this',
    );

    const duplicateLabels = privateRule.resolveProjectionLabels(
      strategy,
      [a, b],
      duplicateNodeMap,
      undefined,
    );
    expect(duplicateLabels.get(a)).toBe('shared.this');
    expect(duplicateLabels.get(b)).toBe('shared.this');

    const evidenceGraph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [a]: duplicateNodeMap.get(a) as TgGraph['nodes'][string],
        [b]: duplicateNodeMap.get(b) as TgGraph['nodes'][string],
        [c]: {
          id: c,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.c',
            resource: 'aws_lambda_function',
            name: 'c',
          },
        },
        [d]: {
          id: d,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.d',
            resource: 'aws_lambda_function',
            name: 'd',
          },
        },
        [target]: {
          id: target,
          terraform: {
            kind: 'resource',
            address: 'aws_sqs_queue.jobs',
            resource: 'aws_sqs_queue',
            name: 'jobs',
          },
        },
      },
      edges: [
        { id: 'a-target' as never, from: a, to: target },
        { id: 'b-target' as never, from: b, to: target },
        { id: 'c-target' as never, from: c, to: target },
        { id: 'd-target' as never, from: d, to: target },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      evidenceGraph,
    );
    const evidence = privateRule.inferRelationships(
      new Map([[sourceProjection, new Set([a, b, c, d])]]),
      new Map([[sourceProjection, strategy]]),
      new Map([[target, new Set([targetProjection])]]),
      adapter,
    );
    const targetEvidence = evidence.get(
      `${String(sourceProjection)}->${String(targetProjection)}`,
    );
    expect(targetEvidence).toMatchObject({
      evidenceCount: 4,
      shortestPathLength: 1,
    });
    expect(targetEvidence?.samplePaths).toHaveLength(3);
  });
});
