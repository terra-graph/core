import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from '../../Adapters/GraphologyAdapter.js';
import type { AdapterOperations } from '../../Operations/Operations.js';
import type { SemanticDecorator } from '../../Semantics.js';
import {
  TG_SCHEMA_VERSION,
  type TgGraph,
  asEdgeId,
  asNodeId,
} from '../../TgGraph.js';
import { ApplySemanticDecorators } from './ApplySemanticDecorators.js';

describe('ApplySemanticDecorators', () => {
  it('should run extract decorators once from the first matched node', () => {
    const firstNodeId = asNodeId('first');
    const secondNodeId = asNodeId('second');
    const edgeId = asEdgeId('first->second');

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [firstNodeId]: { id: firstNodeId },
        [secondNodeId]: { id: secondNodeId },
      },
      edges: [
        {
          id: edgeId,
          from: firstNodeId,
          to: secondNodeId,
          attributes: {},
        },
      ],
    };

    const extractCalls: string[] = [];
    const decorator: SemanticDecorator = {
      name: 'test.decorator',
      extract: ({ graph: current }) => {
        extractCalls.push('extract');
        return current.setEdge(edgeId, firstNodeId, secondNodeId, {
          ...current.getEdgeAttributes(edgeId),
          semantic: {
            facts: [
              {
                kind: 'feeds',
                from: firstNodeId,
                to: secondNodeId,
                source: 'explicit_connection',
                confidence: 'exact',
                decorator: 'test.decorator',
              },
            ],
          },
        });
      },
      project: ({ graph: current }) => current,
    };

    const adapter: AdapterOperations = new GraphologyAdapter(
      new DirectedGraph(),
    ).withTgGraph(graph);
    const rule = new ApplySemanticDecorators({
      options: {
        mode: 'extract',
        decorators: [decorator],
      },
    });

    let updated = adapter;
    for (const nodeId of updated.nodeIds()) {
      const node = updated.getNodeAttributes(nodeId);
      if (!node) {
        continue;
      }

      rule.match(nodeId, node, updated);
      updated = rule.apply(nodeId, node, updated);
    }

    expect(extractCalls).toEqual(['extract']);
    expect(updated.getEdgeAttributes(edgeId)?.semantic?.facts?.[0]?.kind).toBe(
      'feeds',
    );
  });
});
