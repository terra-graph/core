import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from '../../Adapters/GraphologyAdapter.js';
import {
  TG_SCHEMA_VERSION,
  TgGraph,
  asEdgeId,
  asNodeId,
} from '../../TgGraph.js';
import { RemoveSelfLoopEdges } from './RemoveSelfLoopEdges.js';

describe('RemoveSelfLoopEdges.apply', () => {
  it('shoud remove matching self-loop edges', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const loopA = asEdgeId('edge-a-a');
    const edgeAB = asEdgeId('edge-a-b');
    const loopB = asEdgeId('edge-b-b');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
        [nodeB]: { id: nodeB, label: 'B' },
      },
      edges: [
        { id: loopA, from: nodeA, to: nodeA, attributes: {} },
        { id: edgeAB, from: nodeA, to: nodeB, attributes: {} },
        { id: loopB, from: nodeB, to: nodeB, attributes: {} },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new RemoveSelfLoopEdges({
      edge: {
        from: { any: true },
        to: { any: true },
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result.edgesBetween(nodeA, nodeA)).toHaveLength(0);
    expect(result.edgesBetween(nodeA, nodeB)).toEqual([edgeAB]);
    expect(result.edgesBetween(nodeB, nodeB)).toEqual([loopB]);
  });

  it('shoud keep graph unchanged when the rule does not match', () => {
    const nodeA = asNodeId('node-a');
    const loopA = asEdgeId('edge-a-a');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
      },
      edges: [{ id: loopA, from: nodeA, to: nodeA, attributes: {} }],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new RemoveSelfLoopEdges({
      edge: {
        from: { attr: { key: 'label', eq: 'B' } },
        to: { any: true },
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result).toBe(adapter);
    expect(result.edgesBetween(nodeA, nodeA)).toEqual([loopA]);
  });

  it('shoud return early when source no longer matches at apply time', () => {
    const nodeA = asNodeId('node-a');
    const loopA = asEdgeId('edge-a-a');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
      },
      edges: [{ id: loopA, from: nodeA, to: nodeA, attributes: {} }],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new RemoveSelfLoopEdges({
      edge: {
        from: { attr: { key: 'label', eq: 'A' } },
        to: { any: true },
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, { ...node, label: 'not-a' }, adapter);

    expect(result).toBe(adapter);
    expect(result.edgesBetween(nodeA, nodeA)).toEqual([loopA]);
  });

  it('shoud keep self-loop when target query does not match', () => {
    const nodeA = asNodeId('node-a');
    const loopA = asEdgeId('edge-a-a');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
      },
      edges: [{ id: loopA, from: nodeA, to: nodeA, attributes: {} }],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new RemoveSelfLoopEdges({
      edge: {
        from: { any: true },
        to: { attr: { key: 'label', eq: 'B' } },
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result.edgesBetween(nodeA, nodeA)).toEqual([loopA]);
  });
});
