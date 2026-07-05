import {
  NodeId,
  TgEdgeAttributes,
  TgNodeAttributes,
  asNodeId,
} from '../../../TgGraph.js';
import { Operations } from '../../Operations.js';
import { EdgeQuery } from './EdgeQuery.js';

describe('EdgeQuery', () => {
  const sourceId = asNodeId('source');
  const targetId = asNodeId('target');
  const otherId = asNodeId('other');
  const graph = {} as never;
  const sourceNode: TgNodeAttributes = {
    id: sourceId,
    label: 'Source',
    projection: {
      layer: 'core',
      address: 'aws.lambda:source',
      label: 'Source',
      derivation: {
        source: 'plugin',
        projectionName: 'aws.lambda',
      },
    },
  };
  const targetNode: TgNodeAttributes = {
    id: targetId,
    label: 'Target',
    projection: {
      layer: 'core',
      address: 'aws.api_gateway:target',
      label: 'Target',
      derivation: {
        source: 'plugin',
        projectionName: 'aws.api_gateway',
      },
    },
  };
  const edge: TgEdgeAttributes = {
    projection: {
      layer: 'core',
      adjacency: {
        source: 'derived',
        evidence: {
          derivedBy: 'anchor_path',
          evidenceCount: 83,
        },
      },
      relationship: {
        relation: 'invokes',
      },
    },
    label: 'edge-label',
  };

  it('should support fromJson, getDsl, and default from/to matchers', () => {
    const query = EdgeQuery.fromJson({
      attr: {
        key: 'projection.adjacency',
        exists: true,
      },
    });

    expect(query.getDsl()).toEqual({
      attr: {
        key: 'projection.adjacency',
        exists: true,
      },
    });
    expect(query.from.match(sourceId, sourceNode, graph)).toBe(true);
    expect(query.to.match(targetId, targetNode, graph)).toBe(true);
  });

  it('should return true for unknown source-node constrained queries', () => {
    const anyQuery = EdgeQuery.from({ any: true });
    expect(anyQuery.matchSourceNode(sourceId, sourceNode, graph)).toBe(true);

    const attrOnlyQuery = EdgeQuery.from({
      attr: {
        key: 'projection.adjacency',
        exists: true,
      },
    });
    expect(attrOnlyQuery.matchSourceNode(sourceId, sourceNode, graph)).toBe(
      true,
    );

    const andUnknownQuery = EdgeQuery.from({
      and: [
        {
          attr: {
            key: 'projection.relationship',
            exists: true,
          },
        },
      ],
    });
    expect(andUnknownQuery.matchSourceNode(sourceId, sourceNode, graph)).toBe(
      true,
    );

    const orUnknownQuery = EdgeQuery.from({
      or: [
        {
          from: {
            nodeId: {
              eq: String(sourceId),
            },
          },
        },
        {
          attr: {
            key: 'projection.adjacency',
            exists: true,
          },
        },
      ],
    });
    expect(orUnknownQuery.matchSourceNode(otherId, sourceNode, graph)).toBe(
      true,
    );

    const notUnknownQuery = EdgeQuery.from({
      not: {
        attr: {
          key: 'projection.adjacency',
          exists: true,
        },
      },
    });
    expect(notUnknownQuery.matchSourceNode(sourceId, sourceNode, graph)).toBe(
      true,
    );
  });

  it('should evaluate known source-node constraints', () => {
    const andQuery = EdgeQuery.from({
      and: [
        {
          from: {
            nodeId: {
              eq: String(sourceId),
            },
          },
        },
        {
          from: {
            attr: {
              key: 'label',
              eq: 'Source',
            },
          },
        },
      ],
    });
    expect(andQuery.matchSourceNode(sourceId, sourceNode, graph)).toBe(true);
    expect(andQuery.matchSourceNode(otherId, sourceNode, graph)).toBe(false);

    const orQuery = EdgeQuery.from({
      or: [
        {
          from: {
            nodeId: {
              eq: String(otherId),
            },
          },
        },
        {
          from: {
            attr: {
              key: 'label',
              eq: 'Source',
            },
          },
        },
      ],
    });
    expect(orQuery.matchSourceNode(sourceId, sourceNode, graph)).toBe(true);
    expect(
      orQuery.matchSourceNode(
        sourceId,
        { ...sourceNode, label: 'Mismatch' },
        graph,
      ),
    ).toBe(false);

    const notQuery = EdgeQuery.from({
      not: {
        from: {
          nodeId: {
            eq: String(otherId),
          },
        },
      },
    });
    expect(notQuery.matchSourceNode(sourceId, sourceNode, graph)).toBe(true);
    expect(notQuery.matchSourceNode(otherId, sourceNode, graph)).toBe(false);
  });

  it('should evaluate edge queries across any, and, or, not, from, to, and attr', () => {
    expect(
      EdgeQuery.from({ any: true }).matchEdge(
        sourceId,
        sourceNode,
        targetId,
        targetNode,
        edge,
        graph,
      ),
    ).toBe(true);

    const andQuery = EdgeQuery.from({
      and: [
        {
          from: {
            nodeId: {
              eq: String(sourceId),
            },
          },
        },
        {
          attr: {
            key: 'projection.adjacency',
            exists: true,
          },
        },
      ],
    });
    expect(
      andQuery.matchEdge(
        sourceId,
        sourceNode,
        targetId,
        targetNode,
        edge,
        graph,
      ),
    ).toBe(true);

    const orQuery = EdgeQuery.from({
      or: [
        {
          to: {
            attr: {
              key: 'projection.derivation.projectionName',
              eq: 'missing',
            },
          },
        },
        {
          attr: {
            key: 'label',
            eq: 'edge-label',
          },
        },
      ],
    });
    expect(
      orQuery.matchEdge(
        sourceId,
        sourceNode,
        targetId,
        targetNode,
        edge,
        graph,
      ),
    ).toBe(true);

    const notQuery = EdgeQuery.from({
      not: {
        attr: {
          key: 'projection.relationship',
          exists: false,
        },
      },
    });
    expect(
      notQuery.matchEdge(
        sourceId,
        sourceNode,
        targetId,
        targetNode,
        edge,
        graph,
      ),
    ).toBe(true);

    const sourceMismatch = EdgeQuery.from({
      from: {
        nodeId: {
          eq: String(otherId),
        },
      },
    });
    expect(
      sourceMismatch.matchEdge(
        sourceId,
        sourceNode,
        targetId,
        targetNode,
        edge,
        graph,
      ),
    ).toBe(false);

    const targetMismatch = EdgeQuery.from({
      to: {
        attr: {
          key: 'projection.derivation.projectionName',
          eq: 'missing',
        },
      },
    });
    expect(
      targetMismatch.matchEdge(
        sourceId,
        sourceNode,
        targetId,
        targetNode,
        edge,
        graph,
      ),
    ).toBe(false);

    const attrMismatch = EdgeQuery.from({
      attr: {
        key: 'projection.adjacency',
        exists: false,
      },
    });
    expect(
      attrMismatch.matchEdge(
        sourceId,
        sourceNode,
        targetId,
        targetNode,
        edge,
        graph,
      ),
    ).toBe(false);
  });

  it('should support numeric comparison predicates for edge attributes', () => {
    expect(
      EdgeQuery.from({
        attr: {
          key: 'projection.adjacency.evidence.evidenceCount',
          gt: 80,
        },
      }).matchEdge(sourceId, sourceNode, targetId, targetNode, edge, graph),
    ).toBe(true);

    expect(
      EdgeQuery.from({
        attr: {
          key: 'projection.adjacency.evidence.evidenceCount',
          gte: 83,
        },
      }).matchEdge(sourceId, sourceNode, targetId, targetNode, edge, graph),
    ).toBe(true);

    expect(
      EdgeQuery.from({
        attr: {
          key: 'projection.adjacency.evidence.evidenceCount',
          lt: 90,
        },
      }).matchEdge(sourceId, sourceNode, targetId, targetNode, edge, graph),
    ).toBe(true);

    expect(
      EdgeQuery.from({
        attr: {
          key: 'projection.adjacency.evidence.evidenceCount',
          lte: 82,
        },
      }).matchEdge(sourceId, sourceNode, targetId, targetNode, edge, graph),
    ).toBe(false);
  });

  it('should cover predicate and path helper branches', () => {
    const helper = EdgeQuery as unknown as {
      compileSourceNodeConstraint(input: Record<string, unknown>): {
        kind: 'known' | 'unknown';
        fn?: (
          nodeId: NodeId,
          node: TgNodeAttributes,
          graph: Operations,
        ) => boolean;
      };
      compileEdge(
        input: Record<string, unknown>,
      ): (
        sourceId: NodeId,
        source: TgNodeAttributes,
        targetId: NodeId,
        target: TgNodeAttributes,
        edge: TgEdgeAttributes,
        graph: Operations,
      ) => boolean;
      matchPredicate(
        value: unknown,
        predicate: Record<string, unknown>,
      ): boolean;
      getValueAtPath(target: Record<string, unknown>, path: string): unknown;
    };

    expect(helper.compileSourceNodeConstraint({ any: true }).kind).toBe(
      'unknown',
    );
    expect(
      helper.compileSourceNodeConstraint({ and: [{ attr: { key: 'a' } }] })
        .kind,
    ).toBe('unknown');
    const allKnownOrConstraint = helper.compileSourceNodeConstraint({
      or: [
        {
          from: {
            nodeId: {
              eq: String(otherId),
            },
          },
        },
        {
          from: {
            attr: {
              key: 'label',
              eq: 'Source',
            },
          },
        },
      ],
    });
    expect(allKnownOrConstraint.kind).toBe('known');
    expect(allKnownOrConstraint.fn?.(sourceId, sourceNode, graph)).toBe(true);
    expect(
      allKnownOrConstraint.fn?.(
        sourceId,
        { ...sourceNode, label: 'Mismatch' },
        graph,
      ),
    ).toBe(false);
    expect(
      helper.compileSourceNodeConstraint({
        not: {
          from: {
            nodeId: {
              eq: String(sourceId),
            },
          },
        },
      }).kind,
    ).toBe('known');
    expect(
      helper.compileSourceNodeConstraint({
        not: {
          attr: {
            key: 'projection.adjacency',
            exists: true,
          },
        },
      }).kind,
    ).toBe('unknown');
    expect(helper.compileSourceNodeConstraint({ to: { any: true } }).kind).toBe(
      'unknown',
    );

    const anyEdge = helper.compileEdge({ any: true });
    expect(
      anyEdge(sourceId, sourceNode, targetId, targetNode, edge, graph),
    ).toBe(true);
    expect(
      helper.compileEdge({
        or: [
          {
            attr: {
              key: 'missing',
              exists: true,
            },
          },
          {
            attr: {
              key: 'label',
              eq: 'edge-label',
            },
          },
        ],
      })(sourceId, sourceNode, targetId, targetNode, edge, graph),
    ).toBe(true);
    expect(
      helper.compileEdge({
        not: {
          attr: {
            key: 'missing',
            exists: true,
          },
        },
      })(sourceId, sourceNode, targetId, targetNode, edge, graph),
    ).toBe(true);

    expect(helper.matchPredicate('value', { eq: 'value' })).toBe(true);
    expect(helper.matchPredicate('value', { eq: 'other' })).toBe(false);
    expect(helper.matchPredicate('value', { in: ['other', 'value'] })).toBe(
      true,
    );
    expect(helper.matchPredicate('value', { in: ['other'] })).toBe(false);
    expect(
      helper.matchPredicate(['aws_s3_bucket_notification'], {
        contains: 'aws_s3_bucket_notification',
      }),
    ).toBe(true);
    expect(
      helper.matchPredicate(['aws_s3_bucket_notification'], {
        contains: 'aws_cloudwatch_event_target',
      }),
    ).toBe(false);
    expect(
      helper.matchPredicate(
        ['aws_s3_bucket_notification', 'aws_cloudwatch_event_target'],
        {
          in: [
            'aws_lambda_event_source_mapping',
            'aws_cloudwatch_event_target',
          ],
        },
      ),
    ).toBe(true);
    expect(
      helper.matchPredicate(['aws_s3_bucket_notification'], {
        in: ['aws_lambda_event_source_mapping'],
      }),
    ).toBe(false);
    expect(helper.matchPredicate('value-text', { contains: 'text' })).toBe(
      true,
    );
    expect(helper.matchPredicate('value-text', { contains: 'missing' })).toBe(
      false,
    );
    expect(helper.matchPredicate(undefined, { contains: '' })).toBe(true);
    expect(helper.matchPredicate('value-text', { startsWith: 'value' })).toBe(
      true,
    );
    expect(
      helper.matchPredicate('value-text', {
        startsWith: ['missing', 'value'],
      }),
    ).toBe(true);
    expect(
      helper.matchPredicate('value-text', {
        startsWith: ['missing'],
      }),
    ).toBe(false);
    expect(helper.matchPredicate(undefined, { startsWith: '' })).toBe(true);
    expect(helper.matchPredicate('value-text', { endsWith: 'text' })).toBe(
      true,
    );
    expect(
      helper.matchPredicate('value-text', {
        endsWith: ['missing', 'text'],
      }),
    ).toBe(true);
    expect(
      helper.matchPredicate('value-text', {
        endsWith: ['missing'],
      }),
    ).toBe(false);
    expect(helper.matchPredicate(undefined, { endsWith: '' })).toBe(true);
    expect(helper.matchPredicate('value', { exists: true })).toBe(true);
    expect(helper.matchPredicate(undefined, { exists: true })).toBe(false);
    expect(helper.matchPredicate(undefined, { exists: false })).toBe(true);
    expect(helper.matchPredicate('value', { exists: false })).toBe(false);
    expect(helper.matchPredicate(83, { gt: 80 })).toBe(true);
    expect(helper.matchPredicate(83, { gte: 83 })).toBe(true);
    expect(helper.matchPredicate(83, { lt: 90 })).toBe(true);
    expect(helper.matchPredicate(83, { lte: 82 })).toBe(false);
    expect(helper.matchPredicate('83', { gt: 80 })).toBe(false);
    expect(helper.matchPredicate('value', {})).toBe(false);

    expect(helper.getValueAtPath({ projection: { adjacency: true } }, '')).toBe(
      undefined,
    );
    expect(
      helper.getValueAtPath(
        { projection: { adjacency: { source: 'derived' } } },
        'projection.adjacency.source',
      ),
    ).toBe('derived');
    expect(
      helper.getValueAtPath(
        { projection: { adjacency: { source: 'derived' } } },
        'projection.relationship.source',
      ),
    ).toBe(undefined);
  });
});
