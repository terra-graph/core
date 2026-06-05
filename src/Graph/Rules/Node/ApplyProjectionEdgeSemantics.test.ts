import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from '../../Adapters/GraphologyAdapter.js';
import { AdapterOperations } from '../../Operations/Operations.js';
import {
  TG_SCHEMA_VERSION,
  TgGraph,
  asEdgeId,
  asNodeId,
} from '../../TgGraph.js';
import { ApplyProjectionEdgeSemantics } from './ApplyProjectionEdgeSemantics.js';

describe('ApplyProjectionEdgeSemantics.apply', () => {
  it('shoud derive semantic hints from projection membership and relationship metadata', () => {
    const memberId = asNodeId('member');
    const sourceProjectionId = asNodeId('projection-source');
    const targetProjectionId = asNodeId('projection-target');
    const membershipEdgeId = asEdgeId('member-realizes-projection');
    const relationshipEdgeId = asEdgeId('projection-depends-on-projection');

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [memberId]: {
          id: memberId,
          terraform: {
            kind: 'resource',
            address: 'aws_lambda_function.handler',
            resource: 'aws_lambda_function',
            name: 'handler',
          },
        },
        [sourceProjectionId]: {
          id: sourceProjectionId,
          projection: {
            layer: 'core',
            address: 'service:handler',
            label: 'Handler',
          },
        },
        [targetProjectionId]: {
          id: targetProjectionId,
          projection: {
            layer: 'core',
            address: 'store:table',
            label: 'Table',
          },
        },
      },
      edges: [
        {
          id: membershipEdgeId,
          from: memberId,
          to: sourceProjectionId,
          attributes: {
            projection: {
              layer: 'core',
              membership: {
                relation: 'realizes',
                source: 'derived',
              },
            },
          },
        },
        {
          id: relationshipEdgeId,
          from: sourceProjectionId,
          to: targetProjectionId,
          attributes: {
            projection: {
              layer: 'core',
              adjacency: {
                source: 'derived',
              },
              relationship: {
                relation: 'depends_on',
                source: 'derived',
              },
            },
          },
        },
      ],
    };

    const adapter: AdapterOperations = new GraphologyAdapter(
      new DirectedGraph(),
    ).withTgGraph(graph);
    const rule = new ApplyProjectionEdgeSemantics();

    let updated = adapter;
    for (const nodeId of updated.nodeIds()) {
      const node = updated.getNodeAttributes(nodeId);
      if (!node) {
        continue;
      }

      rule.match(nodeId, node, updated);
      updated = rule.apply(nodeId, node, updated);
    }

    expect(
      updated.getEdgeAttributes(membershipEdgeId)?.hints?.semantic,
    ).toEqual({
      semantic: 'realizes',
      role: 'primary',
    });
    expect(
      updated.getEdgeAttributes(relationshipEdgeId)?.hints?.semantic,
    ).toEqual({
      semantic: 'depends_on',
      role: 'primary',
    });
    expect(
      updated.getEdgeAttributes(relationshipEdgeId)?.projection?.adjacency,
    ).toBeUndefined();
  });

  it('should drop neutral projection adjacency edges by default', () => {
    const sourceProjectionId = asNodeId('projection-source');
    const targetProjectionId = asNodeId('projection-target');
    const adjacencyEdgeId = asEdgeId('projection-adjacency');

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [sourceProjectionId]: {
          id: sourceProjectionId,
          projection: {
            layer: 'core',
            address: 'service:handler',
            label: 'Handler',
          },
        },
        [targetProjectionId]: {
          id: targetProjectionId,
          projection: {
            layer: 'core',
            address: 'store:table',
            label: 'Table',
          },
        },
      },
      edges: [
        {
          id: adjacencyEdgeId,
          from: sourceProjectionId,
          to: targetProjectionId,
          attributes: {
            projection: {
              layer: 'core',
              adjacency: {
                source: 'derived',
              },
            },
          },
        },
      ],
    };

    const adapter: AdapterOperations = new GraphologyAdapter(
      new DirectedGraph(),
    ).withTgGraph(graph);
    const rule = new ApplyProjectionEdgeSemantics();

    let updated = adapter;
    for (const nodeId of updated.nodeIds()) {
      const node = updated.getNodeAttributes(nodeId);
      if (!node) {
        continue;
      }

      rule.match(nodeId, node, updated);
      updated = rule.apply(nodeId, node, updated);
    }

    expect(() => updated.getEdgeAttributes(adjacencyEdgeId)).toThrow();
  });

  it('should retain explicitly emitted neutral adjacency edges', () => {
    const sourceProjectionId = asNodeId('projection-source');
    const targetProjectionId = asNodeId('projection-target');
    const adjacencyEdgeId = asEdgeId('projection-adjacency');

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [sourceProjectionId]: {
          id: sourceProjectionId,
          projection: {
            layer: 'core',
            address: 'service:handler',
            label: 'Handler',
          },
        },
        [targetProjectionId]: {
          id: targetProjectionId,
          projection: {
            layer: 'core',
            address: 'store:table',
            label: 'Table',
          },
        },
      },
      edges: [
        {
          id: adjacencyEdgeId,
          from: sourceProjectionId,
          to: targetProjectionId,
          attributes: {
            projection: {
              layer: 'core',
              adjacency: {
                source: 'derived',
                emit: true,
              },
            },
          },
        },
      ],
    };

    const adapter: AdapterOperations = new GraphologyAdapter(
      new DirectedGraph(),
    ).withTgGraph(graph);
    const rule = new ApplyProjectionEdgeSemantics();

    let updated = adapter;
    for (const nodeId of updated.nodeIds()) {
      const node = updated.getNodeAttributes(nodeId);
      if (!node) {
        continue;
      }

      rule.match(nodeId, node, updated);
      updated = rule.apply(nodeId, node, updated);
    }

    expect(
      updated.getEdgeAttributes(adjacencyEdgeId)?.projection?.adjacency,
    ).toEqual({
      source: 'derived',
      emit: true,
    });
    expect(updated.getEdgeAttributes(adjacencyEdgeId)?.hints?.semantic).toBe(
      undefined,
    );
  });

  it('should cover unmatched, non-first, duplicate, supporting, and no-op branches', () => {
    const firstId = asNodeId('first');
    const secondId = asNodeId('second');
    const targetId = asNodeId('target');
    const edgeId = asEdgeId('supporting-edge');

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [firstId]: {
          id: firstId,
          projection: {
            layer: 'core',
            address: 'first',
            label: 'First',
          },
        },
        [secondId]: {
          id: secondId,
          projection: {
            layer: 'core',
            address: 'second',
            label: 'Second',
          },
        },
        [targetId]: {
          id: targetId,
          projection: {
            layer: 'core',
            address: 'target',
            label: 'Target',
          },
        },
      },
      edges: [
        {
          id: edgeId,
          from: firstId,
          to: targetId,
          attributes: {
            projection: {
              layer: 'core',
              membership: {
                relation: 'contributes_to',
                source: 'derived',
              },
            },
            hints: {
              semantic: {
                semantic: 'contributes_to',
                role: 'supporting',
              },
            },
          },
        },
      ],
    };

    const adapter: AdapterOperations = new GraphologyAdapter(
      new DirectedGraph(),
    ).withTgGraph(graph);
    const rule = new ApplyProjectionEdgeSemantics();
    const secondNode = adapter.getNodeAttributes(secondId);
    if (!secondNode) {
      throw new Error('Missing second node');
    }

    rule.match(secondId, secondNode, adapter);
    expect(rule.apply(secondId, secondNode, adapter)).toBe(adapter);

    const unmatched = new ApplyProjectionEdgeSemantics();
    const firstNode = adapter.getNodeAttributes(firstId);
    if (!firstNode) {
      throw new Error('Missing first node');
    }
    expect(unmatched.apply(firstId, firstNode, adapter)).toBe(adapter);

    rule.match(firstId, firstNode, adapter);
    const result = rule.apply(firstId, firstNode, adapter);
    expect(result.getEdgeAttributes(edgeId)?.hints?.semantic).toEqual({
      semantic: 'contributes_to',
      role: 'supporting',
    });
  });

  it('should skip already-visited duplicate edge ids', () => {
    const rule = new ApplyProjectionEdgeSemantics();
    const graph = {
      nodeIds: () => [asNodeId('a'), asNodeId('b')],
      outEdges: () => [asEdgeId('shared-edge')],
      getEdgeAttributes: () => ({
        projection: {
          layer: 'core',
          relationship: {
            relation: 'invokes',
          },
        },
      }),
      edgeSource: () => asNodeId('a'),
      edgeTarget: () => asNodeId('b'),
      setEdge: jest.fn().mockReturnThis(),
    } as unknown as AdapterOperations;

    const node = { id: asNodeId('a') } as never;
    rule.match(asNodeId('a'), node, graph);
    rule.apply(asNodeId('a'), node, graph);

    expect(graph.setEdge).toHaveBeenCalledTimes(1);
  });

  it('should leave edges without adjacency or projection semantics unchanged', () => {
    const sourceId = asNodeId('source');
    const targetId = asNodeId('target');
    const edgeId = asEdgeId('plain-edge');

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [sourceId]: {
          id: sourceId,
          projection: {
            layer: 'core',
            address: 'source',
            label: 'Source',
          },
        },
        [targetId]: {
          id: targetId,
          projection: {
            layer: 'core',
            address: 'target',
            label: 'Target',
          },
        },
      },
      edges: [
        {
          id: edgeId,
          from: sourceId,
          to: targetId,
          attributes: {},
        },
      ],
    };

    const adapter: AdapterOperations = new GraphologyAdapter(
      new DirectedGraph(),
    ).withTgGraph(graph);
    const rule = new ApplyProjectionEdgeSemantics();
    const sourceNode = adapter.getNodeAttributes(sourceId);
    if (!sourceNode) {
      throw new Error('Missing source node');
    }

    rule.match(sourceId, sourceNode, adapter);
    const result = rule.apply(sourceId, sourceNode, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({});
  });
});
