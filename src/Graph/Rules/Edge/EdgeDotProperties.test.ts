import { DirectedGraph } from 'graphology';
import { DotAdapter } from '../../Adapters/DotAdapter.js';
import { GraphologyAdapter } from '../../Adapters/GraphologyAdapter.js';
import { AdapterOperations } from '../../Operations/Operations.js';
import {
  NodeId,
  TG_SCHEMA_VERSION,
  TgGraph,
  asEdgeId,
  asNodeId,
} from '../../TgGraph.js';
import { EdgeDotProperties } from './EdgeDotProperties.js';

describe('EdgeDotProperties.constructor', () => {
  it('shoud require options', () => {
    expect(
      () =>
        new EdgeDotProperties({
          edge: { from: { any: true }, to: { any: true } },
        }),
    ).toThrow(`Rule 'EdgeDotProperties' requires options in config`);
  });
});

describe('EdgeDotProperties.supports', () => {
  it('shoud only support DotAdapter instances', () => {
    const rule = new EdgeDotProperties({
      edge: { from: { any: true }, to: { any: true } },
      options: { color: 'red' },
    });

    const dotAdapter = new DotAdapter(new DirectedGraph());
    const graphAdapter = new GraphologyAdapter(new DirectedGraph());

    expect(rule.supports(dotAdapter)).toBe(true);
    expect(rule.supports(graphAdapter)).toBe(false);
  });
});

describe('EdgeDotProperties.apply', () => {
  it('shoud store dot adapter options for matching edges', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const edgeId = asEdgeId('edge-a-b');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
        [nodeB]: { id: nodeB, label: 'B' },
      },
      edges: [
        {
          id: edgeId,
          from: nodeA,
          to: nodeB,
          attributes: { weight: 1 },
        },
      ],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const hook = new EdgeDotProperties({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
      options: {
        color: 'red',
        style: 'dashed',
      },
    });

    hook.match(nodeA, node, adapter);
    const result = hook.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({
      weight: 1,
      adapter: {
        [DotAdapter.name]: {
          color: 'red',
          style: 'dashed',
        },
      },
    });
  });

  it('shoud keep graph unchanged when the hook does not match', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const edgeId = asEdgeId('edge-a-b');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
        [nodeB]: { id: nodeB, label: 'B' },
      },
      edges: [
        {
          id: edgeId,
          from: nodeA,
          to: nodeB,
          attributes: { weight: 1 },
        },
      ],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeB);
    if (!node) {
      throw new Error('Missing node attributes for node-b');
    }

    const hook = new EdgeDotProperties({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
      options: {
        color: 'red',
      },
    });

    hook.match(nodeB, node, adapter);
    const result = hook.apply(nodeB, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({ weight: 1 });
  });

  it('shoud merge dot adapter properties with existing attributes', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const edgeId = asEdgeId('edge-a-b');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
        [nodeB]: { id: nodeB, label: 'B' },
      },
      edges: [
        {
          id: edgeId,
          from: nodeA,
          to: nodeB,
          attributes: {
            adapter: {
              [DotAdapter.name]: {
                style: 'dotted',
              },
            },
          },
        },
      ],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const hook = new EdgeDotProperties({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
      options: {
        color: 'red',
      },
    });

    hook.match(nodeA, node, adapter);
    const result = hook.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({
      adapter: {
        [DotAdapter.name]: {
          style: 'dotted',
          color: 'red',
        },
      },
    });
  });

  it('shoud ignore outbound edges when the target does not match', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const edgeId = asEdgeId('edge-a-b');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
        [nodeB]: { id: nodeB, label: 'B' },
      },
      edges: [
        {
          id: edgeId,
          from: nodeA,
          to: nodeB,
          attributes: { weight: 1 },
        },
      ],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const hook = new EdgeDotProperties({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-c' } },
      },
      options: {
        color: 'red',
      },
    });

    hook.match(nodeA, node, adapter);
    const result = hook.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({ weight: 1 });
  });

  it('should skip edges whose target node attributes are missing', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const edgeId = asEdgeId('edge-a-b');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
        [nodeB]: { id: nodeB, label: 'B' },
      },
      edges: [
        {
          id: edgeId,
          from: nodeA,
          to: nodeB,
          attributes: { weight: 1 },
        },
      ],
    };
    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const originalGetNodeAttributes = adapter.getNodeAttributes.bind(adapter);
    adapter.getNodeAttributes = ((nodeId: NodeId) =>
      nodeId === nodeB
        ? undefined
        : originalGetNodeAttributes(nodeId)) as never;

    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const hook = new EdgeDotProperties({
      edge: {
        from: { any: true },
        to: { any: true },
      },
      options: {
        color: 'red',
      },
    });

    hook.match(nodeA, node, adapter);
    expect(hook.apply(nodeA, node, adapter).getEdgeAttributes(edgeId)).toEqual({
      weight: 1,
    });
  });

  it('should match edges by edge attributes using boolean edge query dsl', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const nodeC = asNodeId('node-c');
    const adjacencyEdgeId = asEdgeId('adjacency-edge');
    const semanticEdgeId = asEdgeId('semantic-edge');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
        [nodeB]: { id: nodeB, label: 'B' },
        [nodeC]: { id: nodeC, label: 'C' },
      },
      edges: [
        {
          id: adjacencyEdgeId,
          from: nodeA,
          to: nodeB,
          attributes: {
            projection: {
              layer: 'core',
              adjacency: {
                source: 'derived',
              },
            },
          },
        },
        {
          id: semanticEdgeId,
          from: nodeA,
          to: nodeC,
          attributes: {
            projection: {
              layer: 'core',
              adjacency: {
                source: 'derived',
              },
              relationship: {
                relation: 'invokes',
                source: 'derived',
              },
            },
          },
        },
      ],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const hook = new EdgeDotProperties({
      edge: {
        and: [
          {
            attr: {
              key: 'projection.adjacency',
              exists: true,
            },
          },
          {
            not: {
              attr: {
                key: 'projection.relationship',
                exists: true,
              },
            },
          },
        ],
      },
      options: {
        color: '#999999',
        style: 'dotted',
        dir: 'none',
        constraint: false,
      },
    });

    hook.match(nodeA, node, adapter);
    const result = hook.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(adjacencyEdgeId)?.adapter).toEqual({
      [DotAdapter.name]: {
        color: '#999999',
        style: 'dotted',
        dir: 'none',
        constraint: false,
      },
    });
    expect(result.getEdgeAttributes(semanticEdgeId)?.adapter).toBeUndefined();
  });

  it('shoud return early when the source node no longer matches', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const edgeId = asEdgeId('edge-a-b');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
        [nodeB]: { id: nodeB, label: 'B' },
      },
      edges: [
        {
          id: edgeId,
          from: nodeA,
          to: nodeB,
          attributes: { weight: 1 },
        },
      ],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const hook = new EdgeDotProperties({
      edge: {
        from: { attr: { key: 'label', eq: 'A' } },
        to: { any: true },
      },
      options: {
        color: 'red',
      },
    });

    hook.match(nodeA, node, adapter);
    const mismatchedNode = { ...node, label: 'mismatch' };
    const result = hook.apply(nodeA, mismatchedNode, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({ weight: 1 });
  });

  it('shoud preserve non-dot adapter entries when applying dot properties', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const edgeId = asEdgeId('edge-a-b');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
        [nodeB]: { id: nodeB, label: 'B' },
      },
      edges: [
        {
          id: edgeId,
          from: nodeA,
          to: nodeB,
          attributes: {
            adapter: {
              OtherAdapter: { style: 'bold' },
            },
          },
        },
      ],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const hook = new EdgeDotProperties({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
      options: {
        color: 'red',
      },
    });

    hook.match(nodeA, node, adapter);
    const result = hook.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({
      adapter: {
        OtherAdapter: { style: 'bold' },
        [DotAdapter.name]: {
          color: 'red',
        },
      },
    });
  });

  it('shoud fall back to empty properties when options are cleared', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const edgeId = asEdgeId('edge-a-b');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
        [nodeB]: { id: nodeB, label: 'B' },
      },
      edges: [
        {
          id: edgeId,
          from: nodeA,
          to: nodeB,
          attributes: {},
        },
      ],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const hook = new EdgeDotProperties({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
      options: {
        color: 'red',
      },
    });
    (
      hook as unknown as { config: { options?: Record<string, unknown> } }
    ).config.options = undefined;

    hook.match(nodeA, node, adapter);
    const result = hook.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({
      adapter: {
        [DotAdapter.name]: {},
      },
    });
  });
});
