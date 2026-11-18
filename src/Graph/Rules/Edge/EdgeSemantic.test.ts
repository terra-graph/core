import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from '../../Adapters/GraphologyAdapter.js';
import {
  DefaultEdgeSemanticRoles,
  TG_SCHEMA_VERSION,
  TgGraph,
  asEdgeId,
  asNodeId,
} from '../../TgGraph.js';
import { EdgeSemantic } from './EdgeSemantic.js';
import { DefaultEdgeSemantics } from './EdgeSemantics.js';

const customSemantic = (semantic: string) => ({
  semantic,
  role: DefaultEdgeSemanticRoles.Primary,
});

describe('EdgeSemantic.constructor', () => {
  it('shoud require options', () => {
    expect(
      () =>
        new EdgeSemantic({
          edge: { from: { any: true }, to: { any: true } },
        }),
    ).toThrow(`Rule 'EdgeSemantic' requires options in config`);
  });

  it('shoud require a semantic object', () => {
    expect(
      () =>
        new EdgeSemantic({
          edge: { from: { any: true }, to: { any: true } },
          options: {},
        }),
    ).toThrow(`Rule 'EdgeSemantic' requires options.semantic`);

    expect(
      () =>
        new EdgeSemantic({
          edge: { from: { any: true }, to: { any: true } },
          options: {
            semantic: 'invokes' as never,
          },
        }),
    ).toThrow(`Rule 'EdgeSemantic' requires options.semantic`);

    expect(
      () =>
        new EdgeSemantic({
          edge: { from: { any: true }, to: { any: true } },
          options: {
            semantic: null as never,
          },
        }),
    ).toThrow(`Rule 'EdgeSemantic' requires options.semantic`);
  });

  it('shoud reject malformed semantic objects', () => {
    expect(
      () =>
        new EdgeSemantic({
          edge: { from: { any: true }, to: { any: true } },
          options: {
            semantic: {
              semantic: 123,
              role: DefaultEdgeSemanticRoles.Primary,
            } as never,
          },
        }),
    ).toThrow(`Rule 'EdgeSemantic' requires options.semantic`);

    expect(
      () =>
        new EdgeSemantic({
          edge: { from: { any: true }, to: { any: true } },
          options: {
            semantic: { semantic: 'invokes', role: 'invalid' } as never,
          },
        }),
    ).toThrow(`Rule 'EdgeSemantic' requires options.semantic`);

    expect(
      () =>
        new EdgeSemantic({
          edge: { from: { any: true }, to: { any: true } },
          options: {
            semantic: customSemantic('   '),
          },
        }),
    ).toThrow(`Rule 'EdgeSemantic' requires options.semantic`);
  });

  it('shoud require boolean overwrite and enforceDirection values', () => {
    expect(
      () =>
        new EdgeSemantic({
          edge: { from: { any: true }, to: { any: true } },
          options: {
            semantic: DefaultEdgeSemantics.Invokes,
            overwrite: 'yes' as never,
          },
        }),
    ).toThrow(
      `Rule 'EdgeSemantic' options.overwrite must be a boolean when provided`,
    );

    expect(
      () =>
        new EdgeSemantic({
          edge: { from: { any: true }, to: { any: true } },
          options: {
            semantic: DefaultEdgeSemantics.Invokes,
            enforceDirection: 'yes' as never,
          },
        }),
    ).toThrow(
      `Rule 'EdgeSemantic' options.enforceDirection must be a boolean when provided`,
    );
  });
});

describe('EdgeSemantic.apply', () => {
  const nodeA = asNodeId('node-a');
  const nodeB = asNodeId('node-b');
  const nodeC = asNodeId('node-c');

  const buildAdapter = (graph: TgGraph) =>
    new GraphologyAdapter(new DirectedGraph()).withTgGraph(graph);

  const baseGraph = (edge: TgGraph['edges'][number]): TgGraph => ({
    schemaVersion: TG_SCHEMA_VERSION,
    description: {},
    nodes: {
      [nodeA]: { id: nodeA, label: 'A' },
      [nodeB]: { id: nodeB, label: 'B' },
      [nodeC]: { id: nodeC, label: 'C' },
    },
    edges: [edge],
  });

  it('shoud assign semantics to matching outbound edges', () => {
    const edgeId = asEdgeId('edge-a-b');
    const adapter = buildAdapter(
      baseGraph({
        id: edgeId,
        from: nodeA,
        to: nodeB,
        attributes: { weight: 1 },
      }),
    );
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) throw new Error('Missing node');

    const rule = new EdgeSemantic({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
      options: {
        semantic: DefaultEdgeSemantics.Invokes,
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({
      weight: 1,
      hints: { semantic: DefaultEdgeSemantics.Invokes },
    });
  });

  it('shoud support custom semantics', () => {
    const edgeId = asEdgeId('edge-a-b');
    const adapter = buildAdapter(
      baseGraph({
        id: edgeId,
        from: nodeA,
        to: nodeB,
        attributes: {},
      }),
    );
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) throw new Error('Missing node');

    const rule = new EdgeSemantic({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
      options: {
        semantic: customSemantic('provider.custom'),
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({
      hints: { semantic: customSemantic('provider.custom') },
    });
  });

  it('shoud preserve or overwrite existing semantics based on configuration', () => {
    const edgeId = asEdgeId('edge-a-b');
    const graph = baseGraph({
      id: edgeId,
      from: nodeA,
      to: nodeB,
      attributes: {
        hints: { semantic: DefaultEdgeSemantics.Accesses },
      },
    });

    const adapter = buildAdapter(graph);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) throw new Error('Missing node');

    const preserveRule = new EdgeSemantic({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
      options: {
        semantic: DefaultEdgeSemantics.Invokes,
      },
    });

    preserveRule.match(nodeA, node, adapter);
    const preserved = preserveRule.apply(nodeA, node, adapter);
    expect(preserved.getEdgeAttributes(edgeId)).toEqual({
      hints: { semantic: DefaultEdgeSemantics.Accesses },
    });

    const overwriteRule = new EdgeSemantic({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
      options: {
        semantic: DefaultEdgeSemantics.Invokes,
        overwrite: true,
      },
    });

    overwriteRule.match(nodeA, node, adapter);
    const overwritten = overwriteRule.apply(nodeA, node, adapter);
    expect(overwritten.getEdgeAttributes(edgeId)).toEqual({
      hints: { semantic: DefaultEdgeSemantics.Invokes },
    });
  });

  it('shoud skip target mismatches and unmatched apply calls', () => {
    const edgeId = asEdgeId('edge-a-b');
    const adapter = buildAdapter(
      baseGraph({
        id: edgeId,
        from: nodeA,
        to: nodeB,
        attributes: {},
      }),
    );
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) throw new Error('Missing node');

    const rule = new EdgeSemantic({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-c' } },
      },
      options: {
        semantic: DefaultEdgeSemantics.Invokes,
      },
    });

    rule.match(nodeA, node, adapter);
    const skipped = rule.apply(nodeA, node, adapter);
    expect(skipped.getEdgeAttributes(edgeId)).toEqual({});

    const freshRule = new EdgeSemantic({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-c' } },
      },
      options: {
        semantic: DefaultEdgeSemantics.Invokes,
      },
    });

    const unmatched = freshRule.apply(nodeA, node, adapter);
    expect(unmatched.getEdgeAttributes(edgeId)).toEqual({});
  });

  it('shoud return early if the source node no longer matches', () => {
    const edgeId = asEdgeId('edge-a-b');
    const adapter = buildAdapter(
      baseGraph({
        id: edgeId,
        from: nodeA,
        to: nodeB,
        attributes: {},
      }),
    );
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) throw new Error('Missing node');

    const rule = new EdgeSemantic({
      edge: {
        from: { attr: { key: 'label', eq: 'A' } },
        to: { any: true },
      },
      options: {
        semantic: DefaultEdgeSemantics.Invokes,
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, { ...node, label: 'mismatch' }, adapter);
    expect(result.getEdgeAttributes(edgeId)).toEqual({});
  });

  it('shoud reverse inbound edges when enforceDirection is enabled', () => {
    const edgeId = asEdgeId('edge-b-a');
    const adapter = buildAdapter(
      baseGraph({
        id: edgeId,
        from: nodeB,
        to: nodeA,
        attributes: { weight: 1 },
      }),
    );
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) throw new Error('Missing node');

    const rule = new EdgeSemantic({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
      options: {
        semantic: DefaultEdgeSemantics.Invokes,
        enforceDirection: true,
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);
    expect(result.edgeSource(edgeId)).toBe(nodeA);
    expect(result.edgeTarget(edgeId)).toBe(nodeB);
    expect(result.getEdgeAttributes(edgeId)).toEqual({
      weight: 1,
      hints: { semantic: DefaultEdgeSemantics.Invokes },
    });
  });

  it('shoud leave inbound edges unchanged when enforceDirection is disabled or conflicting', () => {
    const edgeId = asEdgeId('edge-b-a');
    const adapter = buildAdapter(
      baseGraph({
        id: edgeId,
        from: nodeB,
        to: nodeA,
        attributes: {
          hints: { semantic: DefaultEdgeSemantics.Accesses },
        },
      }),
    );
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) throw new Error('Missing node');

    const noEnforce = new EdgeSemantic({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
      options: {
        semantic: DefaultEdgeSemantics.Invokes,
      },
    });

    noEnforce.match(nodeA, node, adapter);
    const unchanged = noEnforce.apply(nodeA, node, adapter);
    expect(unchanged.edgeSource(edgeId)).toBe(nodeB);
    expect(unchanged.edgeTarget(edgeId)).toBe(nodeA);

    const conflicting = new EdgeSemantic({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
      options: {
        semantic: DefaultEdgeSemantics.Invokes,
        enforceDirection: true,
      },
    });

    conflicting.match(nodeA, node, adapter);
    const preserved = conflicting.apply(nodeA, node, adapter);
    expect(preserved.edgeSource(edgeId)).toBe(nodeB);
    expect(preserved.edgeTarget(edgeId)).toBe(nodeA);
    expect(preserved.getEdgeAttributes(edgeId)).toEqual({
      hints: { semantic: DefaultEdgeSemantics.Accesses },
    });

    const overwrite = new EdgeSemantic({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
      options: {
        semantic: DefaultEdgeSemantics.Invokes,
        enforceDirection: true,
        overwrite: true,
      },
    });

    overwrite.match(nodeA, node, adapter);
    const reversed = overwrite.apply(nodeA, node, adapter);
    expect(reversed.edgeSource(edgeId)).toBe(nodeA);
    expect(reversed.edgeTarget(edgeId)).toBe(nodeB);
    expect(reversed.getEdgeAttributes(edgeId)).toEqual({
      hints: { semantic: DefaultEdgeSemantics.Invokes },
    });

    const sameSemanticDifferentRoleAdapter = buildAdapter(
      baseGraph({
        id: edgeId,
        from: nodeB,
        to: nodeA,
        attributes: {
          hints: {
            semantic: {
              semantic: DefaultEdgeSemantics.Invokes.semantic,
              role: DefaultEdgeSemanticRoles.Supporting,
            },
          },
        },
      }),
    );
    const sameSemanticNode =
      sameSemanticDifferentRoleAdapter.getNodeAttributes(nodeA);
    if (!sameSemanticNode) throw new Error('Missing node');

    conflicting.match(
      nodeA,
      sameSemanticNode,
      sameSemanticDifferentRoleAdapter,
    );
    const sameSemanticPreserved = conflicting.apply(
      nodeA,
      sameSemanticNode,
      sameSemanticDifferentRoleAdapter,
    );
    expect(sameSemanticPreserved.edgeSource(edgeId)).toBe(nodeB);
    expect(sameSemanticPreserved.edgeTarget(edgeId)).toBe(nodeA);
    expect(sameSemanticPreserved.getEdgeAttributes(edgeId)).toEqual({
      hints: {
        semantic: {
          semantic: DefaultEdgeSemantics.Invokes.semantic,
          role: DefaultEdgeSemanticRoles.Supporting,
        },
      },
    });
  });

  it('shoud ignore inbound edges when the source does not match the target query', () => {
    const edgeId = asEdgeId('edge-b-a');
    const adapter = buildAdapter(
      baseGraph({
        id: edgeId,
        from: nodeB,
        to: nodeA,
        attributes: {},
      }),
    );
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) throw new Error('Missing node');

    const rule = new EdgeSemantic({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-c' } },
      },
      options: {
        semantic: DefaultEdgeSemantics.Invokes,
        enforceDirection: true,
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);
    expect(result.edgeSource(edgeId)).toBe(nodeB);
    expect(result.edgeTarget(edgeId)).toBe(nodeA);
  });
});
