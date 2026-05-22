import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from '../../Adapters/GraphologyAdapter.js';
import { GraphResolver } from '../../GraphResolver.js';
import {
  DefaultProjectionDerivationSources,
  NodeId,
  TG_SCHEMA_VERSION,
  TgGraph,
  TgNodeAttributes,
  edgeIdFrom,
  tgNodeIdFrom,
  tgProjectionNodeIdFrom,
} from '../../TgGraph.js';
import { ProjectionInstanceStrategies } from './DeriveProjectionGraph.js';
import { MaterializeProjectionInstances } from './MaterializeProjectionInstances.js';

type MaterializeHarness = {
  expandLogicalProjection(
    logicalProjectionId: NodeId,
    graph: GraphologyAdapter,
  ): Array<Record<string, unknown>>;
  rootAnchors(
    derivation: unknown,
    logicalProjectionId: NodeId,
  ): Array<Record<string, unknown>>;
  resolveProjectionInstances(
    projectionNodeId: NodeId,
    projectionNode: TgNodeAttributes,
    replacements: Map<NodeId, Array<Record<string, unknown>>>,
  ): Array<Record<string, unknown>>;
  matchInstances(
    source: Array<Record<string, unknown>>,
    target: Array<Record<string, unknown>>,
  ): Array<Record<string, unknown>>;
  edgeSuffix(attributes: Record<string, unknown>, edgeId: string): string;
};

const asHarness = (rule: MaterializeProjectionInstances): MaterializeHarness =>
  rule as unknown as MaterializeHarness;

const parseOptions = (input: unknown): { instanceStrategy?: string } =>
  (
    MaterializeProjectionInstances as unknown as {
      parseOptions(inputValue: unknown): { instanceStrategy?: string };
    }
  ).parseOptions(input);

describe('MaterializeProjectionInstances', () => {
  it('should parse options and expose helper fallbacks', () => {
    expect(parseOptions(undefined)).toEqual({
      instanceStrategy: ProjectionInstanceStrategies.None,
    });
    expect(parseOptions({ instanceStrategy: 'bad-value' })).toEqual({
      instanceStrategy: ProjectionInstanceStrategies.None,
    });
    expect(
      parseOptions({
        instanceStrategy: ProjectionInstanceStrategies.MatchByKey,
      }),
    ).toEqual({
      instanceStrategy: ProjectionInstanceStrategies.MatchByKey,
    });

    const rule = new MaterializeProjectionInstances({
      options: {
        instanceStrategy: ProjectionInstanceStrategies.MatchByKey,
      },
    });
    const helpers = asHarness(rule);

    expect(
      helpers.rootAnchors(
        undefined,
        tgNodeIdFrom('resource', 'aws_lambda_function.fallback'),
      ),
    ).toEqual([
      {
        nodeId: tgNodeIdFrom('resource', 'aws_lambda_function.fallback'),
        role: 'root_node',
      },
    ]);
    expect(
      helpers.rootAnchors(
        {
          rootNodeId: tgNodeIdFrom('resource', 'aws_lambda_function.root'),
        },
        tgNodeIdFrom('resource', 'aws_lambda_function.ignored'),
      ),
    ).toEqual([
      {
        nodeId: tgNodeIdFrom('resource', 'aws_lambda_function.root'),
        role: 'root_node',
      },
    ]);
    expect(
      helpers.matchInstances(
        [
          {
            projectionNodeId: 'source-blue',
            isSingleton: false,
            instanceKey: 'blue',
          },
        ],
        [
          {
            projectionNodeId: 'target-blue',
            isSingleton: false,
            instanceKey: 'blue',
          },
        ],
      ),
    ).toEqual([
      {
        source: {
          projectionNodeId: 'source-blue',
          isSingleton: false,
          instanceKey: 'blue',
        },
        target: {
          projectionNodeId: 'target-blue',
          isSingleton: false,
          instanceKey: 'blue',
        },
      },
    ]);
    expect(
      helpers.matchInstances(
        [
          {
            projectionNodeId: 'source-0',
            isSingleton: false,
            instanceOrdinal: 0,
          },
        ],
        [
          {
            projectionNodeId: 'target-blue',
            isSingleton: false,
            instanceKey: 'blue',
            instanceOrdinal: 0,
          },
        ],
      ),
    ).toEqual([
      {
        source: {
          projectionNodeId: 'source-0',
          isSingleton: false,
          instanceOrdinal: 0,
        },
        target: {
          projectionNodeId: 'target-blue',
          isSingleton: false,
          instanceKey: 'blue',
          instanceOrdinal: 0,
        },
      },
    ]);
    expect(
      helpers.matchInstances(
        [{ projectionNodeId: 'singleton', isSingleton: true }],
        [
          {
            projectionNodeId: 'target-blue',
            isSingleton: false,
            instanceKey: 'blue',
          },
        ],
      ),
    ).toEqual([
      {
        source: {
          projectionNodeId: 'singleton',
          isSingleton: true,
        },
        target: {
          projectionNodeId: 'target-blue',
          isSingleton: false,
          instanceKey: 'blue',
        },
      },
    ]);
    expect(
      helpers.matchInstances(
        [
          {
            projectionNodeId: 'source-blue',
            isSingleton: false,
            instanceKey: 'blue',
          },
        ],
        [
          {
            projectionNodeId: 'target-green',
            isSingleton: false,
            instanceKey: 'green',
          },
        ],
      ),
    ).toEqual([]);
    expect(
      helpers.matchInstances(
        [
          {
            projectionNodeId: 'source-blue',
            isSingleton: false,
            instanceKey: 'blue',
          },
          {
            projectionNodeId: 'source-green',
            isSingleton: false,
            instanceKey: 'green',
          },
        ],
        [
          {
            projectionNodeId: 'target-blue',
            isSingleton: false,
            instanceKey: 'blue',
            instanceOrdinal: 0,
          },
          {
            projectionNodeId: 'target-red',
            isSingleton: false,
            instanceKey: 'red',
            instanceOrdinal: 1,
          },
        ],
      ),
    ).toEqual([]);
    expect(
      helpers.edgeSuffix(
        {
          projection: {
            layer: 'core',
            membership: { relation: 'realizes' },
          },
        },
        'edge:ignored',
      ),
    ).toBe('projection:core:realizes');
    expect(
      helpers.edgeSuffix(
        {
          projection: {
            layer: 'core',
            adjacency: { source: 'derived' },
          },
        },
        'edge:ignored',
      ),
    ).toBe('projection:core:adjacency');
    expect(helpers.edgeSuffix({}, 'prefix:custom')).toBe('custom');
  });

  it('should exercise logical expansion helper branches', () => {
    const plainNode = tgNodeIdFrom('resource', 'aws_lambda_function.plain');
    const noAddress = tgNodeIdFrom(
      'resource',
      'aws_lambda_function.no_address',
    );
    const quotedIndex = tgNodeIdFrom(
      'resource',
      'aws_lambda_function.quoted["blue"]',
    );
    const invalidIndex = tgNodeIdFrom(
      'resource',
      'aws_lambda_function.invalid[blue]',
    );
    const indexedFromState = tgNodeIdFrom(
      'resource',
      'aws_lambda_function.stateful',
    );
    const fallbackA = tgNodeIdFrom(
      'resource',
      'aws_lambda_function.fallback_a',
    );
    const fallbackB = tgNodeIdFrom(
      'resource',
      'aws_lambda_function.fallback_b',
    );
    const anchorOnlyA = tgNodeIdFrom(
      'resource',
      'aws_lambda_function.anchor_only_a',
    );
    const anchorOnlyB = tgNodeIdFrom(
      'resource',
      'aws_lambda_function.anchor_only_b',
    );
    const stateVariants = tgNodeIdFrom(
      'resource',
      'aws_lambda_function.edge_cases',
    );
    const projectionNoAddress = tgProjectionNodeIdFrom(
      'core',
      'aws.lambda:no_address',
    );
    const projectionQuoted = tgProjectionNodeIdFrom(
      'core',
      'aws.lambda:quoted',
    );
    const projectionInvalid = tgProjectionNodeIdFrom(
      'core',
      'aws.lambda:invalid',
    );
    const projectionState = tgProjectionNodeIdFrom(
      'core',
      'aws.lambda:stateful',
    );
    const projectionFallback = tgProjectionNodeIdFrom(
      'core',
      'aws.lambda:fallback',
    );
    const projectionAnchorOnly = tgProjectionNodeIdFrom(
      'core',
      'aws.lambda:anchor_only',
    );
    const projectionStateVariants = tgProjectionNodeIdFrom(
      'core',
      'aws.lambda:edge_cases',
    );

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [plainNode]: {
          id: plainNode,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.plain',
            resource: 'aws_lambda_function',
            name: 'plain',
          },
        },
        [noAddress]: {
          id: noAddress,
          terraform: {
            kind: 'resource',
            resource: 'aws_lambda_function',
            name: 'no_address',
          },
        },
        [quotedIndex]: {
          id: quotedIndex,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.quoted["blue"]',
            resource: 'aws_lambda_function',
            name: 'quoted["blue"]',
            state: {
              source: 'plan_show',
              effective: null,
              instances: [
                {
                  address: 'aws_lambda_function.quoted["blue"]',
                  index: 'blue',
                  values: null,
                },
              ],
            },
          },
        },
        [invalidIndex]: {
          id: invalidIndex,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.invalid[blue]',
            resource: 'aws_lambda_function',
            name: 'invalid[blue]',
            state: {
              source: 'plan_show',
              effective: null,
              instances: [
                {
                  address: 'aws_lambda_function.other["green"]',
                  index: 'green',
                  values: null,
                },
              ],
            },
          },
        },
        [indexedFromState]: {
          id: indexedFromState,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.stateful',
            resource: 'aws_lambda_function',
            name: 'stateful',
            state: {
              source: 'plan_show',
              effective: null,
              instances: [
                {
                  address: 'aws_lambda_function.stateful[0]',
                  index: undefined,
                  values: null,
                },
              ],
            },
          },
        },
        [fallbackA]: {
          id: fallbackA,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.fallback_a',
            resource: 'aws_lambda_function',
            name: 'fallback_a',
          },
        },
        [fallbackB]: {
          id: fallbackB,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.fallback_b',
            resource: 'aws_lambda_function',
            name: 'fallback_b',
          },
        },
        [anchorOnlyA]: {
          id: anchorOnlyA,
          terraform: {
            kind: 'resource',
            resource: 'aws_lambda_function',
            name: 'anchor_only_a',
          },
        },
        [anchorOnlyB]: {
          id: anchorOnlyB,
          terraform: {
            kind: 'resource',
            resource: 'aws_lambda_function',
            name: 'anchor_only_b',
          },
        },
        [stateVariants]: {
          id: stateVariants,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.edge_cases',
            resource: 'aws_lambda_function',
            name: 'edge_cases',
            state: {
              source: 'plan_show',
              effective: null,
              instances: [
                {
                  address: 'aws_lambda_function.edge_cases[2]',
                  index: 2,
                  values: null,
                },
                {
                  address: 'aws_lambda_function.edge_cases["blue"]',
                  index: '' as unknown as string,
                  values: null,
                },
                {
                  address: 'aws_lambda_function.edge_cases',
                  index: '' as unknown as string,
                  values: null,
                },
              ],
            },
          },
        },
        [projectionNoAddress]: {
          id: projectionNoAddress,
          projection: {
            layer: 'core',
            address: 'aws.lambda:no_address',
            label: 'no_address',
            derivation: {
              source: DefaultProjectionDerivationSources.Plugin,
              projectionName: 'aws.lambda',
              groupKey: 'aws.lambda:no_address',
              anchors: [{ nodeId: noAddress, role: 'root_node' }],
            },
          },
        },
        [projectionQuoted]: {
          id: projectionQuoted,
          projection: {
            layer: 'core',
            address: 'aws.lambda:quoted',
            label: 'quoted',
            derivation: {
              source: DefaultProjectionDerivationSources.Plugin,
              projectionName: 'aws.lambda',
              groupKey: 'aws.lambda:quoted',
              anchors: [{ nodeId: quotedIndex, role: 'root_node' }],
            },
          },
        },
        [projectionInvalid]: {
          id: projectionInvalid,
          projection: {
            layer: 'core',
            address: 'aws.lambda:invalid',
            label: 'invalid',
            derivation: {
              source: DefaultProjectionDerivationSources.Plugin,
              projectionName: 'aws.lambda',
              groupKey: 'aws.lambda:invalid',
              anchors: [{ nodeId: invalidIndex, role: 'root_node' }],
            },
          },
        },
        [projectionState]: {
          id: projectionState,
          projection: {
            layer: 'core',
            address: 'aws.lambda:stateful',
            label: 'stateful',
            derivation: {
              source: DefaultProjectionDerivationSources.Plugin,
              projectionName: 'aws.lambda',
              groupKey: 'aws.lambda:stateful',
              anchors: [{ nodeId: indexedFromState, role: 'root_node' }],
            },
          },
        },
        [projectionFallback]: {
          id: projectionFallback,
          projection: {
            layer: 'core',
            address: 'aws.lambda:fallback',
            label: 'fallback',
            derivation: {
              source: DefaultProjectionDerivationSources.Plugin,
              projectionName: 'aws.lambda',
              groupKey: 'aws.lambda:fallback',
              anchors: [
                { nodeId: fallbackA, role: 'root_node' },
                { nodeId: fallbackB, role: 'root_node' },
              ],
            },
          },
        },
        [projectionAnchorOnly]: {
          id: projectionAnchorOnly,
          projection: {
            layer: 'core',
            address: 'aws.lambda:anchor_only',
            label: 'anchor_only',
            derivation: {
              source: DefaultProjectionDerivationSources.Plugin,
              projectionName: 'aws.lambda',
              groupKey: 'aws.lambda:anchor_only',
              anchors: [
                { nodeId: anchorOnlyA, role: 'root_node' },
                { nodeId: anchorOnlyB, role: 'root_node' },
              ],
            },
          },
        },
        [projectionStateVariants]: {
          id: projectionStateVariants,
          projection: {
            layer: 'core',
            address: 'aws.lambda:edge_cases',
            label: 'edge_cases',
            derivation: {
              source: DefaultProjectionDerivationSources.Plugin,
              projectionName: 'aws.lambda',
              groupKey: 'aws.lambda:edge_cases',
              anchors: [{ nodeId: stateVariants, role: 'root_node' }],
            },
          },
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      graph,
    );
    const rule = new MaterializeProjectionInstances({
      options: {
        instanceStrategy: ProjectionInstanceStrategies.MatchByKey,
      },
    });
    const helpers = asHarness(rule);

    expect(helpers.expandLogicalProjection(plainNode, adapter)).toEqual([]);
    expect(
      helpers.expandLogicalProjection(projectionNoAddress, adapter),
    ).toMatchObject([
      {
        projectionAddress: 'aws.lambda:no_address',
        isSingleton: true,
      },
    ]);
    expect(
      helpers.expandLogicalProjection(projectionQuoted, adapter),
    ).toMatchObject([
      {
        projectionAddress: 'aws.lambda:quoted["blue"]',
        instanceKey: 'blue',
        instanceOrdinal: 0,
      },
    ]);
    expect(
      helpers.expandLogicalProjection(projectionInvalid, adapter),
    ).toMatchObject([
      {
        projectionAddress: 'aws.lambda:invalid["blue"]',
        instanceKey: 'blue',
      },
    ]);
    expect(
      helpers.expandLogicalProjection(projectionState, adapter),
    ).toMatchObject([
      {
        projectionAddress: 'aws.lambda:stateful[0]',
        instanceOrdinal: 0,
      },
    ]);
    expect(
      helpers.expandLogicalProjection(projectionFallback, adapter),
    ).toMatchObject([
      {
        projectionAddress: 'aws.lambda:fallback[0]',
        instanceOrdinal: 0,
      },
      {
        projectionAddress: 'aws.lambda:fallback[1]',
        instanceOrdinal: 1,
      },
    ]);
    expect(
      helpers.expandLogicalProjection(projectionAnchorOnly, adapter),
    ).toMatchObject([
      {
        projectionAddress: 'aws.lambda:anchor_only[0]',
        instanceOrdinal: 0,
      },
      {
        projectionAddress: 'aws.lambda:anchor_only[1]',
        instanceOrdinal: 1,
      },
    ]);
    expect(
      helpers.expandLogicalProjection(projectionStateVariants, adapter),
    ).toMatchObject([
      {
        projectionAddress: 'aws.lambda:edge_cases[2]',
        instanceKey: '2',
        instanceOrdinal: 2,
      },
      {
        projectionAddress: 'aws.lambda:edge_cases["blue"]',
        instanceKey: 'blue',
        instanceOrdinal: 1,
      },
      {
        projectionAddress: 'aws.lambda:edge_cases',
        rootInstanceAddress: 'aws_lambda_function.edge_cases',
        isSingleton: true,
      },
    ]);

    const fallbackProjectionNode = graph.nodes[
      projectionQuoted
    ] as TgNodeAttributes;
    expect(
      helpers.resolveProjectionInstances(
        projectionQuoted,
        fallbackProjectionNode,
        new Map(),
      ),
    ).toMatchObject([
      {
        projectionNodeId: projectionQuoted,
        projectionAddress: 'aws.lambda:quoted',
        groupKey: 'aws.lambda:quoted',
        isSingleton: true,
      },
    ]);
    expect(
      helpers.resolveProjectionInstances(
        projectionQuoted,
        fallbackProjectionNode,
        new Map([[projectionQuoted, [{ projectionNodeId: plainNode }]]]),
      ),
    ).toEqual([{ projectionNodeId: plainNode }]);
    expect(
      helpers.resolveProjectionInstances(
        projectionQuoted,
        {
          id: projectionQuoted,
          projection: {
            derivation: {},
          },
        } as unknown as TgNodeAttributes,
        new Map(),
      ),
    ).toEqual([
      {
        projectionNodeId: projectionQuoted,
        projectionAddress: String(projectionQuoted),
        projectionLabel: String(projectionQuoted),
        groupKey: String(projectionQuoted),
        rootNodeId: projectionQuoted,
        rootInstanceAddress: undefined,
        instanceKey: undefined,
        instanceOrdinal: undefined,
        isSingleton: true,
        anchors: [],
        layer: 'core',
      },
    ]);
  });

  it('should skip apply branches for unmatched, none strategy, missing logical projections, and non-materialized logical projections', () => {
    const projectionNode = tgProjectionNodeIdFrom(
      'core',
      'aws.lambda:singleton',
    );
    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [projectionNode]: {
          id: projectionNode,
          projection: {
            layer: 'core',
            address: 'aws.lambda:singleton',
            label: 'singleton',
            derivation: {
              source: DefaultProjectionDerivationSources.Plugin,
              projectionName: 'aws.lambda',
              groupKey: 'aws.lambda:singleton',
              rootNodeId: tgNodeIdFrom(
                'resource',
                'aws_lambda_function.singleton',
              ),
            },
          },
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      graph,
    );
    const noneRule = new MaterializeProjectionInstances({
      options: {
        instanceStrategy: ProjectionInstanceStrategies.None,
      },
    });
    noneRule.match(
      projectionNode,
      graph.nodes[projectionNode] as TgNodeAttributes,
      adapter,
    );
    expect(
      noneRule.apply(
        projectionNode,
        graph.nodes[projectionNode] as TgNodeAttributes,
        adapter,
      ),
    ).toBe(adapter);

    const unmatchedRule = new MaterializeProjectionInstances({
      node: {
        attr: { key: 'terraform.name', eq: 'missing' },
      },
      options: {
        instanceStrategy: ProjectionInstanceStrategies.MatchByKey,
      },
    } as never);
    expect(
      unmatchedRule.apply(
        projectionNode,
        graph.nodes[projectionNode] as TgNodeAttributes,
        adapter,
      ),
    ).toBe(adapter);

    const plainGraph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [tgNodeIdFrom('resource', 'aws_lambda_function.plain')]: {
          id: tgNodeIdFrom('resource', 'aws_lambda_function.plain'),
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.plain',
            resource: 'aws_lambda_function',
            name: 'plain',
          },
        },
      },
      edges: [],
    };
    const plainAdapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      plainGraph,
    );
    const matchRule = new MaterializeProjectionInstances({
      options: {
        instanceStrategy: ProjectionInstanceStrategies.MatchByKey,
      },
    });
    const firstPlainNode = plainAdapter.nodeIds()[0] as NodeId;
    matchRule.match(
      firstPlainNode,
      plainAdapter.getNodeAttributes(firstPlainNode) as TgNodeAttributes,
      plainAdapter,
    );
    expect(
      matchRule.apply(
        firstPlainNode,
        plainAdapter.getNodeAttributes(firstPlainNode) as TgNodeAttributes,
        plainAdapter,
      ),
    ).toBe(plainAdapter);

    matchRule.match(
      projectionNode,
      graph.nodes[projectionNode] as TgNodeAttributes,
      adapter,
    );
    const noMaterializationResult = matchRule.apply(
      projectionNode,
      graph.nodes[projectionNode] as TgNodeAttributes,
      adapter,
    );
    expect(noMaterializationResult).toBe(adapter);
  });

  it('should throw when a discovered logical projection loses its projection attrs during materialization', () => {
    const projectionNode = tgProjectionNodeIdFrom('core', 'aws.lambda:flaky');
    const projectionAttributes: TgNodeAttributes = {
      id: projectionNode,
      projection: {
        layer: 'core',
        address: 'aws.lambda:flaky',
        label: 'flaky',
        derivation: {
          source: DefaultProjectionDerivationSources.Plugin,
          projectionName: 'aws.lambda',
          groupKey: 'aws.lambda:flaky',
          rootNodeId: tgNodeIdFrom('resource', 'aws_lambda_function.flaky'),
        },
      },
    };

    let getNodeAttributesCalls = 0;
    const flakyAdapter = {
      nodeIds: () => [projectionNode],
      getNodeAttributes: () => {
        getNodeAttributesCalls += 1;
        return getNodeAttributesCalls === 1 ? projectionAttributes : undefined;
      },
    } as unknown as GraphologyAdapter;

    const rule = new MaterializeProjectionInstances({
      options: {
        instanceStrategy: ProjectionInstanceStrategies.MatchByKey,
      },
    });
    rule.match(projectionNode, projectionAttributes, flakyAdapter);

    expect(() =>
      rule.apply(projectionNode, projectionAttributes, flakyAdapter),
    ).toThrow(
      `Rule 'MaterializeProjectionInstances' expected projection node attributes for '${projectionNode}'`,
    );
  });

  it('should fall back to a materialized realizes edge suffix when projectionName is missing', () => {
    const rootNode = tgNodeIdFrom('resource', 'aws_lambda_function.counted[0]');
    const logicalProjection = tgProjectionNodeIdFrom(
      'core',
      'aws.lambda:counted',
    );
    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [rootNode]: {
          id: rootNode,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.counted[0]',
            resource: 'aws_lambda_function',
            name: 'counted[0]',
          },
        },
        [logicalProjection]: {
          id: logicalProjection,
          projection: {
            layer: 'core',
            address: 'aws.lambda:counted',
            label: 'counted',
            derivation: {
              source: DefaultProjectionDerivationSources.Plugin,
              groupKey: 'aws.lambda:counted',
              anchors: [{ nodeId: rootNode, role: 'root_node' }],
            },
          },
        },
      },
      edges: [],
    };
    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      graph,
    );
    const rule = new MaterializeProjectionInstances({
      options: {
        instanceStrategy: ProjectionInstanceStrategies.MatchByKey,
      },
    });
    const node = adapter.getNodeAttributes(rootNode) as TgNodeAttributes;
    rule.match(rootNode, node, adapter);

    const updated = rule.apply(rootNode, node, adapter);
    expect(updated.outEdges(rootNode)).toContain(
      edgeIdFrom(
        rootNode,
        tgProjectionNodeIdFrom('core', 'aws.lambda:counted[0]'),
        'projection:materialized:realizes',
      ),
    );
  });

  it('should expand logical keyed projections into keyed 1:1 edges', () => {
    const queueBlue = tgNodeIdFrom('resource', 'aws_sqs_queue.channel["blue"]');
    const queueGreen = tgNodeIdFrom(
      'resource',
      'aws_sqs_queue.channel["green"]',
    );
    const lambdaBlue = tgNodeIdFrom(
      'resource',
      'aws_lambda_function.consumer["blue"]',
    );
    const lambdaGreen = tgNodeIdFrom(
      'resource',
      'aws_lambda_function.consumer["green"]',
    );
    const queueProjection = tgProjectionNodeIdFrom('core', 'aws.sqs:channel');
    const lambdaProjection = tgProjectionNodeIdFrom(
      'core',
      'aws.lambda:consumer',
    );

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [queueBlue]: {
          id: queueBlue,
          terraform: {
            kind: 'resource',
            address: 'aws_sqs_queue.channel["blue"]',
            resource: 'aws_sqs_queue',
            name: 'channel["blue"]',
          },
        },
        [queueGreen]: {
          id: queueGreen,
          terraform: {
            kind: 'resource',
            address: 'aws_sqs_queue.channel["green"]',
            resource: 'aws_sqs_queue',
            name: 'channel["green"]',
          },
        },
        [lambdaBlue]: {
          id: lambdaBlue,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.consumer["blue"]',
            resource: 'aws_lambda_function',
            name: 'consumer["blue"]',
          },
        },
        [lambdaGreen]: {
          id: lambdaGreen,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.consumer["green"]',
            resource: 'aws_lambda_function',
            name: 'consumer["green"]',
          },
        },
        [queueProjection]: {
          id: queueProjection,
          projection: {
            layer: 'core',
            address: 'aws.sqs:channel',
            label: 'channel',
            derivation: {
              source: DefaultProjectionDerivationSources.Plugin,
              projectionName: 'aws.sqs',
              groupKey: 'aws.sqs:channel',
              rootNodeId: queueBlue,
              anchors: [
                {
                  nodeId: queueBlue,
                  address: 'aws_sqs_queue.channel["blue"]',
                  role: 'root_node',
                },
                {
                  nodeId: queueGreen,
                  address: 'aws_sqs_queue.channel["green"]',
                  role: 'root_node',
                },
              ],
            },
          },
        },
        [lambdaProjection]: {
          id: lambdaProjection,
          projection: {
            layer: 'core',
            address: 'aws.lambda:consumer',
            label: 'consumer',
            derivation: {
              source: DefaultProjectionDerivationSources.Plugin,
              projectionName: 'aws.lambda',
              groupKey: 'aws.lambda:consumer',
              rootNodeId: lambdaBlue,
              anchors: [
                {
                  nodeId: lambdaBlue,
                  address: 'aws_lambda_function.consumer["blue"]',
                  role: 'root_node',
                },
                {
                  nodeId: lambdaGreen,
                  address: 'aws_lambda_function.consumer["green"]',
                  role: 'root_node',
                },
              ],
            },
          },
        },
      },
      edges: [
        {
          id: 'logical-adjacency' as never,
          from: queueProjection,
          to: lambdaProjection,
          attributes: {
            projection: {
              layer: 'core',
              adjacency: {
                source: 'derived',
                evidence: {
                  derivedBy: 'anchor_path',
                  evidenceCount: 1,
                  shortestPathLength: 1,
                  viaResourceTypes: ['aws_lambda_event_source_mapping'],
                },
              },
            },
          },
        },
      ],
    };

    const rule = new MaterializeProjectionInstances({
      options: {
        instanceStrategy: ProjectionInstanceStrategies.MatchByKey,
      },
    });

    const resolver = new GraphResolver(
      new GraphologyAdapter(new DirectedGraph()),
    );
    const result = resolver.resolve({ graph, phases: [[rule]] }).toTgGraph();
    const hasEdge = (from: NodeId, to: NodeId) =>
      result.edges.some((edge) => edge.from === from && edge.to === to);

    const queueBlueProjection = tgProjectionNodeIdFrom(
      'core',
      'aws.sqs:channel["blue"]',
    );
    const queueGreenProjection = tgProjectionNodeIdFrom(
      'core',
      'aws.sqs:channel["green"]',
    );
    const lambdaBlueProjection = tgProjectionNodeIdFrom(
      'core',
      'aws.lambda:consumer["blue"]',
    );
    const lambdaGreenProjection = tgProjectionNodeIdFrom(
      'core',
      'aws.lambda:consumer["green"]',
    );

    expect(result.nodes[queueProjection]).toBeUndefined();
    expect(result.nodes[lambdaProjection]).toBeUndefined();
    expect(
      result.nodes[queueBlueProjection]?.projection?.derivation,
    ).toMatchObject({
      source: DefaultProjectionDerivationSources.Profile,
      groupKey: 'aws.sqs:channel',
      instanceKey: 'blue',
      rootNodeId: queueBlue,
    });
    expect(hasEdge(queueBlueProjection, lambdaBlueProjection)).toBe(true);
    expect(hasEdge(queueBlueProjection, lambdaGreenProjection)).toBe(false);
    expect(hasEdge(queueGreenProjection, lambdaBlueProjection)).toBe(false);
    expect(hasEdge(queueGreenProjection, lambdaGreenProjection)).toBe(true);
  });

  it('should fall back to ordinal matching for logical projections with different key spaces', () => {
    const replay0 = tgNodeIdFrom('resource', 'aws_sqs_queue.replay[0]');
    const replay1 = tgNodeIdFrom('resource', 'aws_sqs_queue.replay[1]');
    const deadBlue = tgNodeIdFrom(
      'resource',
      'aws_sqs_queue.dead_letter["blue"]',
    );
    const deadGreen = tgNodeIdFrom(
      'resource',
      'aws_sqs_queue.dead_letter["green"]',
    );
    const replayProjection = tgProjectionNodeIdFrom('core', 'aws.sqs:replay');
    const deadLetterProjection = tgProjectionNodeIdFrom(
      'core',
      'aws.sqs:dead_letter',
    );

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [replay0]: {
          id: replay0,
          terraform: {
            kind: 'resource',
            address: 'aws_sqs_queue.replay[0]',
            resource: 'aws_sqs_queue',
            name: 'replay[0]',
          },
        },
        [replay1]: {
          id: replay1,
          terraform: {
            kind: 'resource',
            address: 'aws_sqs_queue.replay[1]',
            resource: 'aws_sqs_queue',
            name: 'replay[1]',
          },
        },
        [deadBlue]: {
          id: deadBlue,
          terraform: {
            kind: 'resource',
            address: 'aws_sqs_queue.dead_letter["blue"]',
            resource: 'aws_sqs_queue',
            name: 'dead_letter["blue"]',
            state: {
              source: 'plan_show',
              effective: null,
              instances: [
                {
                  address: 'aws_sqs_queue.dead_letter["blue"]',
                  index: 'blue',
                  values: null,
                },
                {
                  address: 'aws_sqs_queue.dead_letter["green"]',
                  index: 'green',
                  values: null,
                },
              ],
            },
          },
        },
        [deadGreen]: {
          id: deadGreen,
          terraform: {
            kind: 'resource',
            address: 'aws_sqs_queue.dead_letter["green"]',
            resource: 'aws_sqs_queue',
            name: 'dead_letter["green"]',
            state: {
              source: 'plan_show',
              effective: null,
              instances: [
                {
                  address: 'aws_sqs_queue.dead_letter["blue"]',
                  index: 'blue',
                  values: null,
                },
                {
                  address: 'aws_sqs_queue.dead_letter["green"]',
                  index: 'green',
                  values: null,
                },
              ],
            },
          },
        },
        [replayProjection]: {
          id: replayProjection,
          projection: {
            layer: 'core',
            address: 'aws.sqs:replay',
            label: 'replay',
            derivation: {
              source: DefaultProjectionDerivationSources.Plugin,
              projectionName: 'aws.sqs',
              groupKey: 'aws.sqs:replay',
              rootNodeId: replay0,
              anchors: [
                {
                  nodeId: replay0,
                  address: 'aws_sqs_queue.replay[0]',
                  role: 'root_node',
                },
                {
                  nodeId: replay1,
                  address: 'aws_sqs_queue.replay[1]',
                  role: 'root_node',
                },
              ],
            },
          },
        },
        [deadLetterProjection]: {
          id: deadLetterProjection,
          projection: {
            layer: 'core',
            address: 'aws.sqs:dead_letter',
            label: 'dead_letter',
            derivation: {
              source: DefaultProjectionDerivationSources.Plugin,
              projectionName: 'aws.sqs',
              groupKey: 'aws.sqs:dead_letter',
              rootNodeId: deadBlue,
              anchors: [
                {
                  nodeId: deadBlue,
                  address: 'aws_sqs_queue.dead_letter["blue"]',
                  role: 'root_node',
                },
                {
                  nodeId: deadGreen,
                  address: 'aws_sqs_queue.dead_letter["green"]',
                  role: 'root_node',
                },
              ],
            },
          },
        },
      },
      edges: [
        {
          id: 'logical-routes' as never,
          from: replayProjection,
          to: deadLetterProjection,
          attributes: {
            projection: {
              layer: 'core',
              adjacency: {
                source: 'derived',
                evidence: {
                  derivedBy: 'anchor_path',
                  evidenceCount: 1,
                  shortestPathLength: 1,
                  viaResourceTypes: ['aws_sqs_queue'],
                },
              },
            },
          },
        },
      ],
    };

    const rule = new MaterializeProjectionInstances({
      options: {
        instanceStrategy: ProjectionInstanceStrategies.MatchByKey,
      },
    });
    const resolver = new GraphResolver(
      new GraphologyAdapter(new DirectedGraph()),
    );
    const result = resolver.resolve({ graph, phases: [[rule]] }).toTgGraph();
    const replay0Projection = tgProjectionNodeIdFrom(
      'core',
      'aws.sqs:replay[0]',
    );
    const replay1Projection = tgProjectionNodeIdFrom(
      'core',
      'aws.sqs:replay[1]',
    );
    const deadBlueProjection = tgProjectionNodeIdFrom(
      'core',
      'aws.sqs:dead_letter["blue"]',
    );
    const deadGreenProjection = tgProjectionNodeIdFrom(
      'core',
      'aws.sqs:dead_letter["green"]',
    );

    expect(
      result.edges.some(
        (edge) =>
          edge.from === replay0Projection && edge.to === deadBlueProjection,
      ),
    ).toBe(true);
    expect(
      result.edges.some(
        (edge) =>
          edge.from === replay0Projection && edge.to === deadGreenProjection,
      ),
    ).toBe(false);
    expect(
      result.edges.some(
        (edge) =>
          edge.from === replay1Projection && edge.to === deadBlueProjection,
      ),
    ).toBe(false);
    expect(
      result.edges.some(
        (edge) =>
          edge.from === replay1Projection && edge.to === deadGreenProjection,
      ),
    ).toBe(true);
  });

  it('should cover remaining materialization edge branches', () => {
    const indexedRoot = tgNodeIdFrom(
      'resource',
      'aws_lambda_function.indexed["blue"]',
    );
    const singletonRoot = tgNodeIdFrom(
      'resource',
      'aws_lambda_function.singleton',
    );
    const plainTarget = tgNodeIdFrom('resource', 'aws_iam_role.plain');
    const indexedProjection = tgProjectionNodeIdFrom(
      'core',
      'aws.lambda:indexed',
    );
    const singletonProjection = tgProjectionNodeIdFrom(
      'core',
      'aws.lambda:singleton',
    );
    const plainProjection = tgProjectionNodeIdFrom(
      'core',
      'aws.iam_role:plain',
    );

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [indexedRoot]: {
          id: indexedRoot,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.indexed["blue"]',
            resource: 'aws_lambda_function',
            name: 'indexed["blue"]',
          },
        },
        [singletonRoot]: {
          id: singletonRoot,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.singleton',
            resource: 'aws_lambda_function',
            name: 'singleton',
          },
        },
        [plainTarget]: {
          id: plainTarget,
          terraform: {
            kind: 'resource',
            address: 'aws_iam_role.plain',
            resource: 'aws_iam_role',
            name: 'plain',
          },
        },
        [indexedProjection]: {
          id: indexedProjection,
          projection: {
            layer: 'core',
            address: 'aws.lambda:indexed',
            label: 'indexed',
            derivation: {
              source: DefaultProjectionDerivationSources.Plugin,
              projectionName: 'aws.lambda',
              groupKey: 'aws.lambda:indexed',
              rootNodeId: indexedRoot,
              anchors: [{ nodeId: indexedRoot, role: 'root_node' }],
            },
          },
        },
        [singletonProjection]: {
          id: singletonProjection,
          projection: {
            layer: 'core',
            address: 'aws.lambda:singleton',
            label: 'singleton',
            derivation: {
              source: DefaultProjectionDerivationSources.Plugin,
              projectionName: 'aws.lambda',
              groupKey: 'aws.lambda:singleton',
              rootNodeId: singletonRoot,
              anchors: [{ nodeId: singletonRoot, role: 'root_node' }],
            },
          },
        },
        [plainProjection]: {
          id: plainProjection,
          projection: {
            layer: 'core',
            address: 'aws.iam_role:plain',
            label: 'plain',
            derivation: {
              source: DefaultProjectionDerivationSources.Plugin,
              projectionName: 'aws.iam_role',
              groupKey: 'aws.iam_role:plain',
              rootNodeId: plainTarget,
            },
          },
        },
      },
      edges: [
        {
          id: 'edge-indexed-plain' as never,
          from: indexedProjection,
          to: plainTarget,
          attributes: {
            projection: {
              layer: 'core',
              adjacency: {
                source: 'derived',
                evidence: {
                  derivedBy: 'anchor_path',
                  evidenceCount: 1,
                  shortestPathLength: 1,
                  viaResourceTypes: [],
                },
              },
            },
          },
        },
        {
          id: 'edge-singleton-plain-projection' as never,
          from: singletonProjection,
          to: plainProjection,
          attributes: {
            projection: {
              layer: 'core',
              adjacency: {
                source: 'derived',
                evidence: {
                  derivedBy: 'anchor_path',
                  evidenceCount: 1,
                  shortestPathLength: 1,
                  viaResourceTypes: [],
                },
              },
            },
          },
        },
        {
          id: 'edge-indexed-singleton-membership' as never,
          from: indexedProjection,
          to: singletonProjection,
          attributes: {
            projection: {
              layer: 'core',
              membership: {
                relation: 'contributes_to',
                source: 'derived',
              },
            },
          },
        },
      ],
    };

    const rule = new MaterializeProjectionInstances({
      options: {
        instanceStrategy: ProjectionInstanceStrategies.MatchByKey,
      },
    });
    const resolver = new GraphResolver(
      new GraphologyAdapter(new DirectedGraph()),
    );
    const result = resolver.resolve({ graph, phases: [[rule]] }).toTgGraph();

    const indexedInstance = tgProjectionNodeIdFrom(
      'core',
      'aws.lambda:indexed["blue"]',
    );
    expect(result.nodes[indexedInstance]?.projection?.derivation).toMatchObject(
      {
        source: DefaultProjectionDerivationSources.Profile,
        instanceKey: 'blue',
      },
    );
    expect(
      result.edges.some(
        (edge) => edge.from === indexedInstance && edge.to === plainTarget,
      ),
    ).toBe(false);
    expect(
      result.edges.some(
        (edge) =>
          edge.from === indexedInstance &&
          edge.to === plainProjection &&
          edge.attributes?.projection?.adjacency,
      ),
    ).toBe(false);
    expect(
      result.edges.some(
        (edge) =>
          edge.from === indexedRoot &&
          edge.to === indexedInstance &&
          edge.attributes?.projection?.membership?.relation === 'realizes',
      ),
    ).toBe(true);
  });
});
