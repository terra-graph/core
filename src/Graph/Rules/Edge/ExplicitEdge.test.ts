import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from '../../Adapters/GraphologyAdapter.js';
import {
  TG_SCHEMA_VERSION,
  TgGraph,
  asNodeId,
  edgeIdFrom,
} from '../../TgGraph.js';
import { ExplicitEdge } from './ExplicitEdge.js';

describe('ExplicitEdge.apply', () => {
  it('shoud add edges from matching source nodes to matching target nodes', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const nodeC = asNodeId('node-c');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
        [nodeB]: { id: nodeB, label: 'B' },
        [nodeC]: { id: nodeC, label: 'C' },
      },
      edges: [],
    };

    const hook = new ExplicitEdge({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { in: ['node-b', 'node-c'] } },
      },
    });

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    hook.match(nodeA, node, adapter);
    const result = hook.apply(nodeA, node, adapter);

    const edgeAB = edgeIdFrom(nodeA, nodeB);
    const edgeAC = edgeIdFrom(nodeA, nodeC);

    expect(result.edgeSource(edgeAB)).toBe(nodeA);
    expect(result.edgeTarget(edgeAB)).toBe(nodeB);
    expect(result.edgeSource(edgeAC)).toBe(nodeA);
    expect(result.edgeTarget(edgeAC)).toBe(nodeC);
    expect(result.getEdgeAttributes(edgeAB)).toEqual({});
  });

  it('shoud keep graph unchanged when the hook does not match', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
        [nodeB]: { id: nodeB, label: 'B' },
      },
      edges: [],
    };

    const hook = new ExplicitEdge({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
    });

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeB);
    if (!node) {
      throw new Error('Missing node attributes for node-b');
    }

    hook.match(nodeB, node, adapter);
    const result = hook.apply(nodeB, node, adapter);

    expect(result.outEdges(nodeA)).toEqual([]);
  });

  it('shoud skip targets that do not match the query', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
        [nodeB]: { id: nodeB, label: 'B' },
      },
      edges: [],
    };

    const hook = new ExplicitEdge({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-c' } },
      },
    });

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    hook.match(nodeA, node, adapter);
    const result = hook.apply(nodeA, node, adapter);

    expect(result.outEdges(nodeA)).toEqual([]);
  });

  it('shoud return early when the source node no longer matches', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
        [nodeB]: { id: nodeB, label: 'B' },
      },
      edges: [],
    };

    const hook = new ExplicitEdge({
      edge: {
        from: { attr: { key: 'label', eq: 'A' } },
        to: { any: true },
      },
    });

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    hook.match(nodeA, node, adapter);
    const mismatchedNode = { ...node, label: 'mismatch' };
    const result = hook.apply(nodeA, mismatchedNode, adapter);

    expect(result.outEdges(nodeA)).toEqual([]);
  });
});
