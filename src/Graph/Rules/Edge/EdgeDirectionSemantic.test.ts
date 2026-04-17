import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from '../../Adapters/GraphologyAdapter.js';
import {
  TG_SCHEMA_VERSION,
  TgGraph,
  asEdgeId,
  asNodeId,
} from '../../TgGraph.js';
import { EdgeDirectionSemantic } from './EdgeDirectionSemantic.js';
import { DefaultEdgeDirectionSemantics } from './EdgeDirectionSemantics.js';

describe('EdgeDirectionSemantic.constructor', () => {
  it('shoud require options', () => {
    expect(
      () =>
        new EdgeDirectionSemantic({
          edge: { from: { any: true }, to: { any: true } },
        }),
    ).toThrow(`Rule 'EdgeDirectionSemantic' requires options in config`);
  });

  it('shoud require a semantic option', () => {
    expect(
      () =>
        new EdgeDirectionSemantic({
          edge: { from: { any: true }, to: { any: true } },
          options: {},
        }),
    ).toThrow(`Rule 'EdgeDirectionSemantic' requires options.semantic`);
  });

  it('shoud accept custom semantic values', () => {
    expect(
      () =>
        new EdgeDirectionSemantic({
          edge: { from: { any: true }, to: { any: true } },
          options: {
            semantic: 'provider.custom',
          },
        }),
    ).not.toThrow();
  });

  it('shoud reject empty semantic values', () => {
    expect(
      () =>
        new EdgeDirectionSemantic({
          edge: { from: { any: true }, to: { any: true } },
          options: {
            semantic: '   ',
          },
        }),
    ).toThrow(`Rule 'EdgeDirectionSemantic' requires options.semantic`);
  });

  it('shoud require overwrite to be a boolean when provided', () => {
    expect(
      () =>
        new EdgeDirectionSemantic({
          edge: { from: { any: true }, to: { any: true } },
          options: {
            semantic: DefaultEdgeDirectionSemantics.Invokes,
            overwrite: 'yes',
          },
        }),
    ).toThrow(
      `Rule 'EdgeDirectionSemantic' options.overwrite must be a boolean when provided`,
    );
  });

  it('shoud require enforceDirection to be a boolean when provided', () => {
    expect(
      () =>
        new EdgeDirectionSemantic({
          edge: { from: { any: true }, to: { any: true } },
          options: {
            semantic: DefaultEdgeDirectionSemantics.Invokes,
            enforceDirection: 'yes',
          },
        }),
    ).toThrow(
      `Rule 'EdgeDirectionSemantic' options.enforceDirection must be a boolean when provided`,
    );
  });
});

describe('EdgeDirectionSemantic.apply', () => {
  it('shoud set edge direction semantic for matching edges', () => {
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
          attributes: { weight: 1 },
        },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new EdgeDirectionSemantic({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
      options: {
        semantic: DefaultEdgeDirectionSemantics.Invokes,
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({
      weight: 1,
      directionSemantic: DefaultEdgeDirectionSemantics.Invokes,
    });
  });

  it('shoud set custom edge direction semantic values', () => {
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
          attributes: { weight: 1 },
        },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new EdgeDirectionSemantic({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
      options: {
        semantic: 'provider.custom',
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({
      weight: 1,
      directionSemantic: 'provider.custom',
    });
  });

  it('shoud preserve existing direction semantic by default', () => {
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
          attributes: {
            weight: 1,
            directionSemantic: DefaultEdgeDirectionSemantics.Accesses,
          },
        },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new EdgeDirectionSemantic({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
      options: {
        semantic: DefaultEdgeDirectionSemantics.Invokes,
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({
      weight: 1,
      directionSemantic: DefaultEdgeDirectionSemantics.Accesses,
    });
  });

  it('shoud overwrite existing direction semantic when configured', () => {
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
          attributes: {
            weight: 1,
            directionSemantic: DefaultEdgeDirectionSemantics.Accesses,
          },
        },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new EdgeDirectionSemantic({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
      options: {
        semantic: DefaultEdgeDirectionSemantics.Invokes,
        overwrite: true,
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({
      weight: 1,
      directionSemantic: DefaultEdgeDirectionSemantics.Invokes,
    });
  });

  it('shoud keep inbound matching edges unchanged when enforceDirection is false', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const edgeId = asEdgeId('edge-b-a');

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
          from: nodeB,
          to: nodeA,
          attributes: { weight: 1 },
        },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new EdgeDirectionSemantic({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
      options: {
        semantic: DefaultEdgeDirectionSemantics.Invokes,
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result.edgeSource(edgeId)).toBe(nodeB);
    expect(result.edgeTarget(edgeId)).toBe(nodeA);
    expect(result.getEdgeAttributes(edgeId)).toEqual({ weight: 1 });
  });

  it('shoud reverse inbound matching edges when enforceDirection is true', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const edgeId = asEdgeId('edge-b-a');

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
          from: nodeB,
          to: nodeA,
          attributes: { weight: 1 },
        },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new EdgeDirectionSemantic({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
      options: {
        semantic: DefaultEdgeDirectionSemantics.Invokes,
        enforceDirection: true,
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result.edgeSource(edgeId)).toBe(nodeA);
    expect(result.edgeTarget(edgeId)).toBe(nodeB);
    expect(result.getEdgeAttributes(edgeId)).toEqual({
      weight: 1,
      directionSemantic: DefaultEdgeDirectionSemantics.Invokes,
    });
  });

  it('shoud skip reversing inbound edges with conflicting semantics when overwrite is false', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const edgeId = asEdgeId('edge-b-a');

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
          from: nodeB,
          to: nodeA,
          attributes: {
            directionSemantic: DefaultEdgeDirectionSemantics.Accesses,
          },
        },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new EdgeDirectionSemantic({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
      options: {
        semantic: DefaultEdgeDirectionSemantics.Invokes,
        enforceDirection: true,
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result.edgeSource(edgeId)).toBe(nodeB);
    expect(result.edgeTarget(edgeId)).toBe(nodeA);
    expect(result.getEdgeAttributes(edgeId)).toEqual({
      directionSemantic: DefaultEdgeDirectionSemantics.Accesses,
    });
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

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new EdgeDirectionSemantic({
      edge: {
        from: { attr: { key: 'label', eq: 'A' } },
        to: { any: true },
      },
      options: {
        semantic: DefaultEdgeDirectionSemantics.Invokes,
      },
    });

    rule.match(nodeA, node, adapter);
    const mismatchedNode = { ...node, label: 'mismatch' };
    const result = rule.apply(nodeA, mismatchedNode, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({});
  });

  it('shoud skip outbound edges when the target does not match', () => {
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

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new EdgeDirectionSemantic({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-c' } },
      },
      options: {
        semantic: DefaultEdgeDirectionSemantics.Invokes,
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({});
  });

  it('shoud ignore inbound edges when the source does not match the target query', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const edgeId = asEdgeId('edge-b-a');

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
          from: nodeB,
          to: nodeA,
          attributes: {},
        },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new EdgeDirectionSemantic({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-c' } },
      },
      options: {
        semantic: DefaultEdgeDirectionSemantics.Invokes,
        enforceDirection: true,
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result.edgeSource(edgeId)).toBe(nodeB);
    expect(result.edgeTarget(edgeId)).toBe(nodeA);
  });

  it('shoud keep graph unchanged when apply is called without a match', () => {
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

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new EdgeDirectionSemantic({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-b' } },
      },
      options: {
        semantic: DefaultEdgeDirectionSemantics.Invokes,
      },
    });

    const result = rule.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({});
  });
});
