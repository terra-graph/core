import { DirectedGraph } from 'graphology';
import { DotAdapter } from '../../Adapters/DotAdapter.js';
import { GraphologyAdapter } from '../../Adapters/GraphologyAdapter.js';
import {
  NodeId,
  TG_SCHEMA_VERSION,
  TgGraph,
  asNodeId,
  tgNodeIdFrom,
  tgProjectionNodeIdFrom,
} from '../../TgGraph.js';
import { CopyNodeProperties } from './CopyNodeProperties.js';

type CopyNodePropertiesPrivate = {
  resolveDslReferences(
    nodeId: NodeId,
    node: Record<string, unknown>,
    input: unknown,
  ): unknown;
  resolveValueReference(
    nodeId: NodeId,
    node: Record<string, unknown>,
    value: { from: string },
  ): unknown;
};

type CopyNodePropertiesStatics = {
  getValueAtPath(target: Record<string, unknown>, path: string): unknown;
  setValueAtPath(
    target: Record<string, unknown>,
    path: string,
    value: unknown,
  ): Record<string, unknown>;
  cloneValue<T>(value: T): T;
};

describe('CopyNodeProperties.constructor', () => {
  it('shoud require options', () => {
    expect(
      () =>
        new CopyNodeProperties({
          node: { any: true },
        }),
    ).toThrow(`Rule 'CopyNodeProperties' requires options in config`);
  });

  it('shoud require options.sourceNode', () => {
    expect(
      () =>
        new CopyNodeProperties({
          node: { any: true },
          options: {
            properties: ['hints.layout'],
          },
        } as never),
    ).toThrow(`Rule 'CopyNodeProperties' requires options.sourceNode`);
  });

  it('shoud require options.properties to be an array', () => {
    expect(
      () =>
        new CopyNodeProperties({
          node: { any: true },
          options: {
            sourceNode: { any: true },
            properties: 'hints.layout',
          },
        } as never),
    ).toThrow(`Rule 'CopyNodeProperties' requires options.properties`);
  });

  it('shoud require options.properties to include at least one path', () => {
    expect(
      () =>
        new CopyNodeProperties({
          node: { any: true },
          options: {
            sourceNode: { any: true },
            properties: ['', 1],
          },
        } as never),
    ).toThrow(
      `Rule 'CopyNodeProperties' requires options.properties to include at least one path`,
    );
  });
});

describe('CopyNodeProperties.apply', () => {
  const createHook = () =>
    new CopyNodeProperties({
      node: { any: true },
      options: {
        sourceNode: {
          nodeId: { eq: { from: 'projection.derivation.rootNodeId' } },
        },
        properties: ['hints.layout', `adapter.${DotAdapter.name}.label`],
      },
    });

  it('shoud copy dot-path properties from a source node selected by DSL', () => {
    const anchorNodeId = tgNodeIdFrom(
      'resource',
      'aws_lambda_function.handler',
    );
    const projectionNodeId = tgProjectionNodeIdFrom(
      'core',
      'aws.lambda:handler',
    );

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [anchorNodeId]: {
          id: anchorNodeId,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.handler',
            resource: 'aws_lambda_function',
            name: 'handler',
          },
          hints: {
            layout: {
              image: '/tmp/lambda.svg',
              text1: 'handler',
              text2: 'Lambda',
            },
          },
          adapter: {
            [DotAdapter.name]: {
              label:
                '<<table><tr><td><IMG SRC="/tmp/lambda.svg"/></td></tr><tr><td>handler</td></tr></table>>',
              shape: 'plaintext',
            },
          },
        },
        [projectionNodeId]: {
          id: projectionNodeId,
          projection: {
            layer: 'core',
            address: 'aws.lambda:handler',
            label: 'Lambda handler',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.lambda',
              groupKey: 'aws.lambda:handler',
              rootNodeId: anchorNodeId,
              anchors: [
                {
                  nodeId: anchorNodeId,
                  address: 'aws_lambda_function.handler',
                  role: 'root_node',
                },
              ],
            },
          },
          adapter: {
            [DotAdapter.name]: {
              label: 'stale label',
              shape: 'plaintext',
            },
          },
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(projectionNodeId);
    if (!node) {
      throw new Error('Missing projection node attributes');
    }

    const hook = createHook();

    hook.match(projectionNodeId, node, adapter);
    const result = hook.apply(projectionNodeId, node, adapter);

    expect(result.getNodeAttributes(projectionNodeId)).toEqual({
      ...node,
      hints: {
        layout: {
          image: '/tmp/lambda.svg',
          text1: 'handler',
          text2: 'Lambda',
        },
      },
      adapter: {
        [DotAdapter.name]: {
          label:
            '<<table><tr><td><IMG SRC="/tmp/lambda.svg"/></td></tr><tr><td>handler</td></tr></table>>',
          shape: 'plaintext',
        },
      },
    });
  });

  it('shoud keep graph unchanged when the source node does not resolve', () => {
    const projectionNodeId = asNodeId('projection-node');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [projectionNodeId]: {
          id: projectionNodeId,
          projection: {
            layer: 'core',
            address: 'aws.lambda:handler',
            label: 'Lambda handler',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.lambda',
              groupKey: 'aws.lambda:handler',
              rootNodeId: asNodeId('missing-anchor'),
              anchors: [],
            },
          },
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(projectionNodeId);
    if (!node) {
      throw new Error('Missing projection node attributes');
    }

    const hook = createHook();

    hook.match(projectionNodeId, node, adapter);
    const result = hook.apply(projectionNodeId, node, adapter);

    expect(result.getNodeAttributes(projectionNodeId)).toEqual(node);
  });

  it('shoud keep graph unchanged when the rule does not match', () => {
    const nodeId = asNodeId('projection-node');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeId]: {
          id: nodeId,
          projection: {
            layer: 'core',
            address: 'aws.lambda:handler',
            label: 'Lambda handler',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.lambda',
              groupKey: 'aws.lambda:handler',
              rootNodeId: asNodeId('missing-anchor'),
              anchors: [],
            },
          },
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeId);
    if (!node) {
      throw new Error('Missing projection node attributes');
    }

    const hook = new CopyNodeProperties({
      node: { nodeId: { eq: 'different-node' } },
      options: {
        sourceNode: { any: true },
        properties: ['hints.layout'],
      },
    });

    hook.match(nodeId, node, adapter);
    const result = hook.apply(nodeId, node, adapter);

    expect(result.getNodeAttributes(nodeId)).toEqual(node);
  });

  it('shoud keep graph unchanged when requested properties do not exist on the source node', () => {
    const anchorNodeId = tgNodeIdFrom(
      'resource',
      'aws_lambda_function.handler',
    );
    const projectionNodeId = tgProjectionNodeIdFrom(
      'core',
      'aws.lambda:handler',
    );

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [anchorNodeId]: {
          id: anchorNodeId,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.handler',
            resource: 'aws_lambda_function',
            name: 'handler',
          },
        },
        [projectionNodeId]: {
          id: projectionNodeId,
          projection: {
            layer: 'core',
            address: 'aws.lambda:handler',
            label: 'Lambda handler',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.lambda',
              groupKey: 'aws.lambda:handler',
              rootNodeId: anchorNodeId,
              anchors: [],
            },
          },
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(projectionNodeId);
    if (!node) {
      throw new Error('Missing projection node attributes');
    }

    const hook = new CopyNodeProperties({
      node: { nodeId: { eq: String(projectionNodeId) } },
      options: {
        sourceNode: {
          nodeId: { eq: { from: 'projection.derivation.rootNodeId' } },
        },
        properties: [
          'hints.layout',
          'adapter.DotAdapter.label',
          'missing.path',
        ],
      },
    });

    hook.match(projectionNodeId, node, adapter);
    const result = hook.apply(projectionNodeId, node, adapter);

    expect(result.getNodeAttributes(projectionNodeId)).toEqual(node);
  });

  it('shoud resolve helper branches for references and path utilities', () => {
    const hook = createHook();
    const hookPrivate = hook as unknown as CopyNodePropertiesPrivate;
    const copyNodeProperties =
      CopyNodeProperties as unknown as CopyNodePropertiesStatics;
    const nodeId = asNodeId('node-a');
    const node = {
      projection: {
        derivation: {
          rootNodeId: asNodeId('anchor-a'),
        },
      },
    };

    expect(
      hookPrivate.resolveDslReferences(nodeId, node, [
        { nodeId: { eq: { from: 'nodeId' } } },
        true,
      ]),
    ).toEqual([{ nodeId: { eq: String(nodeId) } }, true]);

    expect(hookPrivate.resolveDslReferences(nodeId, node, 'literal')).toBe(
      'literal',
    );
    expect(
      hookPrivate.resolveDslReferences(nodeId, node, {
        missing: { from: 'projection.derivation.unknown' },
        keep: 'value',
      }),
    ).toEqual({ keep: 'value' });

    expect(
      hookPrivate.resolveValueReference(nodeId, node, { from: 'nodeId' }),
    ).toBe(String(nodeId));

    expect(copyNodeProperties.getValueAtPath(node, '')).toBeUndefined();
    expect(
      copyNodeProperties.getValueAtPath(node, 'projection.missing'),
    ).toBeUndefined();

    expect(copyNodeProperties.setValueAtPath({}, '.', 'ignored')).toEqual({});

    const cloned = copyNodeProperties.cloneValue({
      list: [{ value: 1 }],
    });
    expect(cloned).toEqual({ list: [{ value: 1 }] });
    expect(cloned).not.toBeUndefined();
  });
});
