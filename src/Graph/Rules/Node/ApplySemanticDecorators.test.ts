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
  it('should validate options before applying decorators', () => {
    expect(
      () =>
        new ApplySemanticDecorators({
          options: undefined as never,
        }),
    ).toThrow('ApplySemanticDecorators requires an options object');

    expect(
      () =>
        new ApplySemanticDecorators({
          options: {
            mode: 'invalid',
            decorators: [],
          } as never,
        }),
    ).toThrow(
      "ApplySemanticDecorators requires mode to be 'extract' or 'project'",
    );

    expect(
      () =>
        new ApplySemanticDecorators({
          options: {
            mode: 'extract',
            decorators: [{}],
          } as never,
        }),
    ).toThrow(
      'ApplySemanticDecorators requires decorators to be SemanticDecorator instances',
    );
  });

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

  it('should run project decorators and skip empty or non-leading matches', () => {
    const firstNodeId = asNodeId('first');
    const secondNodeId = asNodeId('second');
    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [firstNodeId]: { id: firstNodeId },
        [secondNodeId]: { id: secondNodeId },
      },
      edges: [],
    };

    const projectCalls: string[] = [];
    const decorator: SemanticDecorator = {
      name: 'test.decorator',
      extract: ({ graph: current }) => current,
      project: ({ graph: current }) => {
        projectCalls.push('project');
        return current.setNodeAttributes(firstNodeId, {
          ...(current.getNodeAttributes(firstNodeId) ?? { id: firstNodeId }),
          label: 'projected',
        });
      },
    };

    const adapter: AdapterOperations = new GraphologyAdapter(
      new DirectedGraph(),
    ).withTgGraph(graph);
    const rule = new ApplySemanticDecorators({
      options: {
        mode: 'project',
        decorators: [decorator],
      },
    });
    const emptyRule = new ApplySemanticDecorators({
      options: {
        mode: 'extract',
        decorators: [],
      },
    });

    const secondNode = adapter.getNodeAttributes(secondNodeId);
    if (!secondNode) {
      throw new Error('Missing second node');
    }

    emptyRule.match(secondNodeId, secondNode, adapter);
    expect(emptyRule.apply(secondNodeId, secondNode, adapter)).toBe(adapter);

    rule.match(secondNodeId, secondNode, adapter);
    expect(rule.apply(secondNodeId, secondNode, adapter)).toBe(adapter);

    const firstNode = adapter.getNodeAttributes(firstNodeId);
    if (!firstNode) {
      throw new Error('Missing first node');
    }

    rule.match(firstNodeId, firstNode, adapter);
    const updated = rule.apply(firstNodeId, firstNode, adapter);

    expect(projectCalls).toEqual(['project']);
    expect(updated.getNodeAttributes(firstNodeId)?.label).toBe('projected');
  });

  it('should accept explicit node config input', () => {
    const nodeId = asNodeId('node');
    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeId]: { id: nodeId },
      },
      edges: [],
    };

    const decorator: SemanticDecorator = {
      name: 'test.decorator',
      extract: ({ graph: current }) => current,
      project: ({ graph: current }) => current,
    };
    const adapter: AdapterOperations = new GraphologyAdapter(
      new DirectedGraph(),
    ).withTgGraph(graph);
    const node = adapter.getNodeAttributes(nodeId);
    if (!node) {
      throw new Error('Missing node');
    }

    const rule = new ApplySemanticDecorators({
      node: { any: true },
      options: {
        mode: 'extract',
        decorators: [decorator],
      },
    });

    rule.match(nodeId, node, adapter);
    expect(rule.apply(nodeId, node, adapter)).toBe(adapter);
  });
});
