import { DirectedGraph } from 'graphology';
import { DotAdapter } from '../../Adapters/DotAdapter.js';
import { GraphologyAdapter } from '../../Adapters/GraphologyAdapter.js';
import {
  TG_SCHEMA_VERSION,
  TgGraph,
  asEdgeId,
  asNodeId,
} from '../../TgGraph.js';
import { AlignNodes } from './AlignNodes.js';

describe('AlignNodes.supports', () => {
  it('shoud only support DotAdapter instances', () => {
    const rule = new AlignNodes({
      edge: { from: { any: true }, to: { any: true } },
    });

    const dotAdapter = new DotAdapter(new DirectedGraph());
    const graphAdapter = new GraphologyAdapter(new DirectedGraph());

    expect(rule.supports(dotAdapter)).toBe(true);
    expect(rule.supports(graphAdapter)).toBe(false);
  });
});

describe('AlignNodes.apply', () => {
  it('shoud add a rank and edge attributes for matching nodes', () => {
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
      edges: [
        {
          id: asEdgeId('edge-1'),
          from: nodeA,
          to: nodeB,
          attributes: {},
        },
        {
          id: asEdgeId('edge-2'),
          from: nodeB,
          to: nodeC,
          attributes: {
            some: 'value',
          },
        },
      ],
    };
    const matcher = {
      edge: {
        from: { nodeId: { eq: 'node-b' } },
        to: { nodeId: { eq: 'node-c' } },
      },
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const moduleNode = adapter.getNodeAttributes(nodeB);
    if (!moduleNode) {
      throw new Error('Missing node attributes for node-b');
    }

    // const hook = new AlignNodes(matcher, { legend: { label: 'rank' } });
    const hook = new AlignNodes(matcher);
    hook.match(nodeB, moduleNode, adapter);
    const result = hook.apply(nodeB, moduleNode, adapter) as DotAdapter;

    expect(result.getRanks()).toEqual([
      { mode: 'same', nodes: [nodeB, nodeC] },
    ]);
    expect(result.getEdgeAttributes(asEdgeId('edge-1'))).toEqual({});
    expect(result.getEdgeAttributes(asEdgeId('edge-2'))).toEqual({
      some: 'value',
    });
  });

  it('shoud keep graph unchanged when the hook does not match', () => {
    const nodeId = asNodeId('node-a');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeId]: { id: nodeId, label: 'A' },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeId);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const hook = new AlignNodes({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
    });

    hook.match(nodeId, node, adapter);
    const result = hook.apply(nodeId, node, adapter) as DotAdapter;

    expect(result.getRanks()).toEqual([]);
  });

  it('shoud skip target nodes that do not match the query', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const edgeId = asEdgeId('edge-1');

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

    const hook = new AlignNodes({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-c' } },
      },
    });

    hook.match(nodeA, node, adapter);
    const result = hook.apply(nodeA, node, adapter) as DotAdapter;

    expect(result.getRanks()).toEqual([]);
    expect(result.getEdgeAttributes(edgeId)).toEqual({});
  });

  it('shoud keep graph unchanged when apply is called without a match', () => {
    const nodeA = asNodeId('node-a');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const hook = new AlignNodes({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
    });

    const result = hook.apply(nodeA, node, adapter) as DotAdapter;

    expect(result.getRanks()).toEqual([]);
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
          attributes: {},
        },
      ],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const hook = new AlignNodes({
      edge: {
        from: { attr: { key: 'label', eq: 'A' } },
        to: { any: true },
      },
    });

    hook.match(nodeA, node, adapter);
    const mismatchedNode = { ...node, label: 'mismatch' };
    const result = hook.apply(nodeA, mismatchedNode, adapter) as DotAdapter;

    expect(result.getRanks()).toEqual([]);
    expect(result.getEdgeAttributes(edgeId)).toEqual({});
  });
});
