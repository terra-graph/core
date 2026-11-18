import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from '../../Adapters/GraphologyAdapter.js';
import {
  TG_SCHEMA_VERSION,
  TgGraph,
  asEdgeId,
  asNodeId,
  edgeIdFrom,
} from '../../TgGraph.js';
import { ConvertNodeToEdge } from './ConvertNodeToEdge.js';

describe('ConvertNodeToEdge.apply', () => {
  it('shoud convert a node with a single in/out edge into a labeled edge', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const nodeLabel = asNodeId('resource.name');
    const edgeIn = asEdgeId('edge-in');
    const edgeOut = asEdgeId('edge-out');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
        [nodeLabel]: {
          id: nodeLabel,
          label: 'resource.name',
          terraform: {
            kind: 'resource',
            address: 'resource.name',
            resource: 'resource',
            name: 'name',
          },
        },
        [nodeB]: { id: nodeB, label: 'B' },
      },
      edges: [
        { id: edgeIn, from: nodeA, to: nodeLabel, attributes: {} },
        { id: edgeOut, from: nodeLabel, to: nodeB, attributes: {} },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeLabel);
    if (!node) {
      throw new Error('Missing node attributes for resource.name');
    }

    const hook = new ConvertNodeToEdge({
      node: { attr: { key: 'label', eq: 'resource.name' } },
    });

    hook.match(nodeLabel, node, adapter);
    const result = hook.apply(nodeLabel, node, adapter);

    const edgeId = edgeIdFrom(nodeA, nodeB);
    expect(result.getEdgeAttributes(edgeId)).toEqual({
      renderHints: { resource: 'resource', name: 'name' },
    });
    expect(result.edgeSource(edgeId)).toBe(nodeA);
    expect(result.edgeTarget(edgeId)).toBe(nodeB);
    expect(result.nodeIds()).not.toContain(nodeLabel);
  });

  it('shoud keep graph unchanged when the node does not have a single in/out edge', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const nodeC = asNodeId('node-c');
    const nodeLabel = asNodeId('resource.name');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
        [nodeLabel]: { id: nodeLabel, label: 'resource.name' },
        [nodeB]: { id: nodeB, label: 'B' },
        [nodeC]: { id: nodeC, label: 'C' },
      },
      edges: [
        { id: asEdgeId('edge-in'), from: nodeA, to: nodeLabel },
        { id: asEdgeId('edge-out-1'), from: nodeLabel, to: nodeB },
        { id: asEdgeId('edge-out-2'), from: nodeLabel, to: nodeC },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeLabel);
    if (!node) {
      throw new Error('Missing node attributes for resource.name');
    }

    const hook = new ConvertNodeToEdge({
      node: { attr: { key: 'label', eq: 'resource.name' } },
    });

    hook.match(nodeLabel, node, adapter);
    const result = hook.apply(nodeLabel, node, adapter);

    expect(result).toBe(adapter);
  });

  it('shoud keep graph unchanged when the node was not matched', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const nodeLabel = asNodeId('resource.name');
    const edgeIn = asEdgeId('edge-in');
    const edgeOut = asEdgeId('edge-out');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
        [nodeLabel]: { id: nodeLabel, label: 'resource.name' },
        [nodeB]: { id: nodeB, label: 'B' },
      },
      edges: [
        { id: edgeIn, from: nodeA, to: nodeLabel, attributes: {} },
        { id: edgeOut, from: nodeLabel, to: nodeB, attributes: {} },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeLabel);
    if (!node) {
      throw new Error('Missing node attributes for resource.name');
    }

    const hook = new ConvertNodeToEdge({
      node: { attr: { key: 'label', eq: 'different' } },
    });

    hook.match(nodeLabel, node, adapter);
    const result = hook.apply(nodeLabel, node, adapter);

    expect(result).toBe(adapter);
    expect(result.getNodeAttributes(nodeLabel)).toBeDefined();
  });

  it('shoud default render hints when terraform metadata is missing', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const nodeLabel = asNodeId('resource.name');
    const edgeIn = asEdgeId('edge-in');
    const edgeOut = asEdgeId('edge-out');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
        [nodeLabel]: { id: nodeLabel, label: 'resource.name' },
        [nodeB]: { id: nodeB, label: 'B' },
      },
      edges: [
        { id: edgeIn, from: nodeA, to: nodeLabel, attributes: {} },
        { id: edgeOut, from: nodeLabel, to: nodeB, attributes: {} },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeLabel);
    if (!node) {
      throw new Error('Missing node attributes for resource.name');
    }

    const hook = new ConvertNodeToEdge({
      node: { attr: { key: 'label', eq: 'resource.name' } },
    });

    hook.match(nodeLabel, node, adapter);
    const result = hook.apply(nodeLabel, node, adapter);

    const edgeId = edgeIdFrom(nodeA, nodeB);
    expect(result.getEdgeAttributes(edgeId)).toEqual({
      renderHints: { resource: '', name: '' },
    });
  });

  it('shoud remove wrapper node without creating a self-loop edge', () => {
    const nodeA = asNodeId('node-a');
    const nodeWrapper = asNodeId('resource.wrapper');
    const edgeIn = asEdgeId('edge-in');
    const edgeOut = asEdgeId('edge-out');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
        [nodeWrapper]: {
          id: nodeWrapper,
          label: 'resource.wrapper',
          terraform: {
            kind: 'resource',
            address: 'resource.wrapper',
            resource: 'resource',
            name: 'wrapper',
          },
        },
      },
      edges: [
        { id: edgeIn, from: nodeA, to: nodeWrapper, attributes: {} },
        { id: edgeOut, from: nodeWrapper, to: nodeA, attributes: {} },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeWrapper);
    if (!node) {
      throw new Error('Missing node attributes for resource.wrapper');
    }

    const hook = new ConvertNodeToEdge({
      node: { attr: { key: 'label', eq: 'resource.wrapper' } },
    });

    hook.match(nodeWrapper, node, adapter);
    const result = hook.apply(nodeWrapper, node, adapter);

    expect(result.getNodeAttributes(nodeWrapper)).toBeUndefined();
    expect(result.edgesBetween(nodeA, nodeA)).toHaveLength(0);
  });
});
