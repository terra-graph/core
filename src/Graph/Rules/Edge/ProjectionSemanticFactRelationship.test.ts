import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from '../../Adapters/GraphologyAdapter.js';
import {
  TG_SCHEMA_VERSION,
  TgGraph,
  asEdgeId,
  asNodeId,
} from '../../TgGraph.js';
import { ProjectionSemanticFactRelationship } from './ProjectionSemanticFactRelationship.js';

describe('ProjectionSemanticFactRelationship', () => {
  const queueId = asNodeId('projection-queue');
  const pipeId = asNodeId('projection-pipe');

  const buildAdapter = (graph: TgGraph) =>
    new GraphologyAdapter(new DirectedGraph()).withTgGraph(graph);

  it('should require options.fact and options.relation', () => {
    expect(
      () =>
        new ProjectionSemanticFactRelationship({
          edge: { any: true },
          options: { relation: 'triggers' },
        }),
    ).toThrow(
      `Rule 'ProjectionSemanticFactRelationship' requires options.fact`,
    );

    expect(
      () =>
        new ProjectionSemanticFactRelationship({
          edge: { any: true },
          options: { fact: 'feeds' },
        }),
    ).toThrow(
      `Rule 'ProjectionSemanticFactRelationship' requires options.relation`,
    );
  });

  it('should reverse an existing projection edge to match the semantic fact direction', () => {
    const edgeId = asEdgeId('pipe->queue');
    const adapter = buildAdapter({
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [queueId]: {
          id: queueId,
          projection: {
            layer: 'core',
            address: 'aws.sqs:event_queue',
            label: 'event_queue',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.sqs',
              groupKey: 'aws.sqs:event_queue',
              rootNodeId: asNodeId('anchor-queue'),
              anchors: [],
            },
          },
        },
        [pipeId]: {
          id: pipeId,
          projection: {
            layer: 'core',
            address: 'aws.eventbridge_pipe:event_pipe',
            label: 'event_pipe',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.eventbridge_pipe',
              groupKey: 'aws.eventbridge_pipe:event_pipe',
              rootNodeId: asNodeId('anchor-pipe'),
              anchors: [],
            },
          },
        },
      },
      edges: [
        {
          id: edgeId,
          from: pipeId,
          to: queueId,
          attributes: {
            projection: {
              layer: 'core',
              semantics: {
                facts: [
                  {
                    kind: 'feeds',
                    from: queueId,
                    to: pipeId,
                    source: 'explicit_connection',
                    confidence: 'exact',
                  },
                ],
              },
            },
          },
        },
      ],
    });
    const queueNode = adapter.getNodeAttributes(queueId);
    if (!queueNode) {
      throw new Error('Missing queue projection node');
    }

    const rule = new ProjectionSemanticFactRelationship({
      edge: {
        from: {
          attr: {
            key: 'projection.derivation.projectionName',
            eq: 'aws.sqs',
          },
        },
        to: {
          attr: {
            key: 'projection.derivation.projectionName',
            eq: 'aws.eventbridge_pipe',
          },
        },
      },
      options: {
        fact: 'feeds',
        relation: 'triggers',
      },
    });

    rule.match(queueId, queueNode, adapter);
    const result = rule.apply(queueId, queueNode, adapter);

    expect(result.edgeSource(edgeId)).toBe(queueId);
    expect(result.edgeTarget(edgeId)).toBe(pipeId);
    expect(
      result.getEdgeAttributes(edgeId)?.projection?.relationship?.relation,
    ).toBe('triggers');
  });
});
