import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from '../../Adapters/GraphologyAdapter.js';
import {
  DefaultProjectionInferenceMethods,
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
        } as never),
    ).toThrow(
      `Rule 'ProjectionSemanticFactRelationship' requires options in config`,
    );

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

    expect(
      () =>
        new ProjectionSemanticFactRelationship({
          edge: { any: true },
          options: {
            fact: 'feeds',
            relation: 'triggers',
            overwrite: 'yes',
          },
        } as never),
    ).toThrow(
      `Rule 'ProjectionSemanticFactRelationship' options.overwrite must be a boolean when provided`,
    );

    expect(
      () =>
        new ProjectionSemanticFactRelationship({
          edge: { any: true },
          options: {
            fact: 'feeds',
            relation: 'triggers',
            enforceDirection: 'yes',
          },
        } as never),
    ).toThrow(
      `Rule 'ProjectionSemanticFactRelationship' options.enforceDirection must be a boolean when provided`,
    );
  });

  it('should apply outgoing relationship facts when the edge already matches direction', () => {
    const edgeId = asEdgeId('queue->pipe');
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
          from: queueId,
          to: pipeId,
          attributes: {
            projection: {
              layer: 'core',
              adjacency: {
                source: 'derived',
                evidence: {
                  derivedBy: DefaultProjectionInferenceMethods.AnchorPath,
                  evidenceCount: 3,
                },
              },
              semantics: {
                facts: [
                  {
                    kind: 'feeds',
                    from: queueId,
                    to: pipeId,
                    source: 'explicit_connection',
                    confidence: 'exact',
                    attributes: {
                      matchCertainty: 100,
                    },
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

    expect(result.getEdgeAttributes(edgeId)?.projection?.relationship).toEqual({
      relation: 'triggers',
      source: 'derived',
      evidence: {
        derivedBy: DefaultProjectionInferenceMethods.AnchorPath,
        evidenceCount: 3,
      },
      semanticFact: {
        kind: 'feeds',
        confidence: 'exact',
        matchCertainty: 100,
      },
    });
  });

  it('should skip incoming reversal when enforceDirection is disabled', () => {
    const edgeId = asEdgeId('pipe->queue:no-reverse');
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
      edge: { any: true },
      options: {
        fact: 'feeds',
        relation: 'triggers',
        enforceDirection: false,
      },
    });

    rule.match(queueId, queueNode, adapter);
    const result = rule.apply(queueId, queueNode, adapter);

    expect(result.edgeSource(edgeId)).toBe(pipeId);
    expect(
      result.getEdgeAttributes(edgeId)?.projection?.relationship,
    ).toBeUndefined();
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

  it('should skip unmatched and protected branches when applying relationships', () => {
    const forwardEdgeId = asEdgeId('queue->pipe');
    const reverseEdgeId = asEdgeId('pipe->queue');
    const otherId = asNodeId('projection-other');
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
        [otherId]: {
          id: otherId,
          projection: {
            layer: 'core',
            address: 'aws.other:event_other',
            label: 'event_other',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.other',
              groupKey: 'aws.other:event_other',
              rootNodeId: asNodeId('anchor-other'),
              anchors: [],
            },
          },
        },
      },
      edges: [
        {
          id: forwardEdgeId,
          from: queueId,
          to: otherId,
          attributes: {
            projection: {
              layer: 'core',
              semantics: {
                facts: [
                  {
                    kind: 'feeds',
                    from: queueId,
                    to: otherId,
                    source: 'explicit_connection',
                    confidence: 'exact',
                  },
                ],
              },
            },
          },
        },
        {
          id: reverseEdgeId,
          from: pipeId,
          to: queueId,
          attributes: {
            projection: {
              layer: 'core',
              relationship: {
                relation: 'depends_on',
                source: 'derived',
              },
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
        overwrite: false,
      },
    });

    expect(rule.apply(queueId, queueNode, adapter)).toBe(adapter);

    rule.match(queueId, queueNode, adapter);
    const originalGetNodeAttributes = adapter.getNodeAttributes.bind(adapter);
    const missingSource = jest
      .spyOn(adapter, 'getNodeAttributes')
      .mockImplementation((nodeId) => {
        if (nodeId === pipeId) {
          return undefined;
        }
        return originalGetNodeAttributes(nodeId);
      });

    expect(rule.apply(queueId, queueNode, adapter)).toBe(adapter);
    missingSource.mockRestore();

    const result = rule.apply(queueId, queueNode, adapter);

    expect(result.edgeSource(reverseEdgeId)).toBe(pipeId);
    expect(
      result.getEdgeAttributes(reverseEdgeId)?.projection?.relationship
        ?.relation,
    ).toBe('depends_on');
  });

  it('should cover source-query, missing-target, and missing-fact skip paths', () => {
    const forwardEdgeId = asEdgeId('queue->pipe');
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
          id: forwardEdgeId,
          from: queueId,
          to: pipeId,
          attributes: {
            projection: {
              layer: 'core',
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
      edge: { any: true },
      options: {
        fact: 'feeds',
        relation: 'triggers',
      },
    });
    rule.match(queueId, queueNode, adapter);

    const ruleAny = rule as unknown as {
      query: { matchSourceNode: (...args: unknown[]) => boolean };
    };
    const originalMatchSourceNode = ruleAny.query.matchSourceNode;
    ruleAny.query.matchSourceNode = () => false;
    expect(rule.apply(queueId, queueNode, adapter)).toBe(adapter);
    ruleAny.query.matchSourceNode = originalMatchSourceNode;

    const originalGetNodeAttributes = adapter.getNodeAttributes.bind(adapter);
    const missingTarget = jest
      .spyOn(adapter, 'getNodeAttributes')
      .mockImplementation((nodeId) => {
        if (nodeId === pipeId) {
          return undefined;
        }
        return originalGetNodeAttributes(nodeId);
      });
    expect(rule.apply(queueId, queueNode, adapter)).toBe(adapter);
    missingTarget.mockRestore();

    expect(rule.apply(queueId, queueNode, adapter)).toBe(adapter);
  });

  it('should skip overwrite-protected outgoing and incoming edges', () => {
    const forwardProtectedEdgeId = asEdgeId('queue->pipe:protected');
    const reverseProtectedEdgeId = asEdgeId('pipe->queue:protected');
    const pipeMissingFactId = asNodeId('projection-pipe-missing-fact');
    const reverseMissingFactEdgeId = asEdgeId('pipe-missing-fact->queue');
    const otherId = asNodeId('projection-other');
    const reverseMismatchEdgeId = asEdgeId('other->queue:mismatch');

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
        [pipeMissingFactId]: {
          id: pipeMissingFactId,
          projection: {
            layer: 'core',
            address: 'aws.eventbridge_pipe:event_pipe_missing_fact',
            label: 'event_pipe_missing_fact',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.eventbridge_pipe',
              groupKey: 'aws.eventbridge_pipe:event_pipe_missing_fact',
              rootNodeId: asNodeId('anchor-pipe-missing-fact'),
              anchors: [],
            },
          },
        },
        [otherId]: {
          id: otherId,
          projection: {
            layer: 'core',
            address: 'aws.other:event_other',
            label: 'event_other',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.other',
              groupKey: 'aws.other:event_other',
              rootNodeId: asNodeId('anchor-other'),
              anchors: [],
            },
          },
        },
      },
      edges: [
        {
          id: forwardProtectedEdgeId,
          from: queueId,
          to: pipeId,
          attributes: {
            projection: {
              layer: 'core',
              relationship: {
                relation: 'depends_on',
                source: 'derived',
              },
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
        {
          id: reverseProtectedEdgeId,
          from: pipeId,
          to: queueId,
          attributes: {
            projection: {
              layer: 'core',
              relationship: {
                relation: 'depends_on',
                source: 'derived',
              },
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
        {
          id: reverseMissingFactEdgeId,
          from: pipeMissingFactId,
          to: queueId,
          attributes: {
            projection: {
              layer: 'core',
            },
          },
        },
        {
          id: reverseMismatchEdgeId,
          from: otherId,
          to: queueId,
          attributes: {
            projection: {
              layer: 'core',
              semantics: {
                facts: [
                  {
                    kind: 'feeds',
                    from: queueId,
                    to: otherId,
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
        overwrite: false,
      },
    });

    rule.match(queueId, queueNode, adapter);
    const result = rule.apply(queueId, queueNode, adapter);

    expect(result.edgeSource(reverseProtectedEdgeId)).toBe(pipeId);
    expect(
      result.getEdgeAttributes(forwardProtectedEdgeId)?.projection?.relationship
        ?.relation,
    ).toBe('depends_on');
    expect(
      result.getEdgeAttributes(reverseProtectedEdgeId)?.projection?.relationship
        ?.relation,
    ).toBe('depends_on');
    expect(result.edgeSource(reverseMissingFactEdgeId)).toBe(pipeMissingFactId);
    expect(result.edgeSource(reverseMismatchEdgeId)).toBe(otherId);
  });
});
