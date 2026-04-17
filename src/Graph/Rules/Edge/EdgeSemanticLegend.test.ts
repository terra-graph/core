import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from '../../Adapters/GraphologyAdapter.js';
import {
  TG_SCHEMA_VERSION,
  TgGraph,
  asEdgeId,
  asNodeId,
} from '../../TgGraph.js';
import { DefaultEdgeDirectionSemantics } from './EdgeDirectionSemantics.js';
import { EdgeSemanticLegend } from './EdgeSemanticLegend.js';

describe('EdgeSemanticLegend.constructor', () => {
  it('shoud require options', () => {
    expect(
      () =>
        new EdgeSemanticLegend({
          edge: { from: { any: true }, to: { any: true } },
        }),
    ).toThrow(`Rule 'EdgeSemanticLegend' requires options in config`);
  });

  it('shoud require legendBySemantic to be an object', () => {
    expect(
      () =>
        new EdgeSemanticLegend({
          edge: { from: { any: true }, to: { any: true } },
          options: {
            legendBySemantic: null,
          },
        }),
    ).toThrow(`Rule 'EdgeSemanticLegend' requires options.legendBySemantic`);
  });

  it('shoud allow custom semantic keys', () => {
    expect(
      () =>
        new EdgeSemanticLegend({
          edge: { from: { any: true }, to: { any: true } },
          options: {
            legendBySemantic: {
              'provider.custom': {
                title: 'Provider custom',
                colour: '#000000',
              },
            },
          },
        }),
    ).not.toThrow();
  });

  it('shoud require title and colour for each semantic entry', () => {
    expect(
      () =>
        new EdgeSemanticLegend({
          edge: { from: { any: true }, to: { any: true } },
          options: {
            legendBySemantic: {
              [DefaultEdgeDirectionSemantics.Invokes]: { title: 'Invokes' },
            },
          },
        }),
    ).toThrow(
      `Rule 'EdgeSemanticLegend' requires title and colour for semantic 'invokes'`,
    );
  });

  it('shoud reject empty semantic keys', () => {
    expect(
      () =>
        new EdgeSemanticLegend({
          edge: { from: { any: true }, to: { any: true } },
          options: {
            legendBySemantic: {
              '': { title: 'Invalid', colour: '#000000' },
            },
          },
        }),
    ).toThrow(
      `Rule 'EdgeSemanticLegend' requires title and colour for semantic ''`,
    );
  });

  it('shoud require overwrite to be a boolean when provided', () => {
    expect(
      () =>
        new EdgeSemanticLegend({
          edge: { from: { any: true }, to: { any: true } },
          options: {
            legendBySemantic: {
              [DefaultEdgeDirectionSemantics.Invokes]: {
                title: 'Invokes',
                colour: '#1f77b4',
              },
            },
            overwrite: 'yes',
          },
        }),
    ).toThrow(
      `Rule 'EdgeSemanticLegend' options.overwrite must be a boolean when provided`,
    );
  });
});

describe('EdgeSemanticLegend.apply', () => {
  it('shoud set legend values for mapped edge semantics', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const nodeC = asNodeId('node-c');
    const invokesEdgeId = asEdgeId('edge-a-b');
    const accessesEdgeId = asEdgeId('edge-a-c');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA, label: 'A' },
        [nodeB]: { id: nodeB, label: 'B' },
        [nodeC]: { id: nodeC, label: 'C' },
      },
      edges: [
        {
          id: invokesEdgeId,
          from: nodeA,
          to: nodeB,
          attributes: {
            directionSemantic: DefaultEdgeDirectionSemantics.Invokes,
          },
        },
        {
          id: accessesEdgeId,
          from: nodeA,
          to: nodeC,
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

    const rule = new EdgeSemanticLegend({
      edge: {
        from: { any: true },
        to: { any: true },
      },
      options: {
        legendBySemantic: {
          [DefaultEdgeDirectionSemantics.Invokes]: {
            title: 'Invokes',
            colour: '#1f77b4',
          },
        },
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(invokesEdgeId)).toEqual({
      directionSemantic: DefaultEdgeDirectionSemantics.Invokes,
      legend: {
        title: 'Invokes',
        colour: '#1f77b4',
      },
    });
    expect(result.getEdgeAttributes(accessesEdgeId)).toEqual({
      directionSemantic: DefaultEdgeDirectionSemantics.Accesses,
    });
  });

  it('shoud keep existing legend when overwrite is false', () => {
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
            directionSemantic: DefaultEdgeDirectionSemantics.Invokes,
            legend: {
              title: 'Existing',
              colour: '#999999',
            },
          },
        },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new EdgeSemanticLegend({
      edge: {
        from: { any: true },
        to: { any: true },
      },
      options: {
        legendBySemantic: {
          [DefaultEdgeDirectionSemantics.Invokes]: {
            title: 'Invokes',
            colour: '#1f77b4',
          },
        },
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({
      directionSemantic: DefaultEdgeDirectionSemantics.Invokes,
      legend: {
        title: 'Existing',
        colour: '#999999',
      },
    });
  });

  it('shoud overwrite existing legend when configured', () => {
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
            directionSemantic: DefaultEdgeDirectionSemantics.Invokes,
            legend: {
              title: 'Existing',
              colour: '#999999',
            },
          },
        },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new EdgeSemanticLegend({
      edge: {
        from: { any: true },
        to: { any: true },
      },
      options: {
        legendBySemantic: {
          [DefaultEdgeDirectionSemantics.Invokes]: {
            title: 'Invokes',
            colour: '#1f77b4',
          },
        },
        overwrite: true,
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({
      directionSemantic: DefaultEdgeDirectionSemantics.Invokes,
      legend: {
        title: 'Invokes',
        colour: '#1f77b4',
      },
    });
  });

  it('shoud ignore edges without a direction semantic', () => {
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

    const rule = new EdgeSemanticLegend({
      edge: {
        from: { any: true },
        to: { any: true },
      },
      options: {
        legendBySemantic: {
          [DefaultEdgeDirectionSemantics.Invokes]: {
            title: 'Invokes',
            colour: '#1f77b4',
          },
        },
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({ weight: 1 });
  });

  it('shoud ignore edges with empty direction semantics', () => {
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
            directionSemantic: '   ',
          },
        },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new EdgeSemanticLegend({
      edge: {
        from: { any: true },
        to: { any: true },
      },
      options: {
        legendBySemantic: {
          [DefaultEdgeDirectionSemantics.Invokes]: {
            title: 'Invokes',
            colour: '#1f77b4',
          },
        },
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({
      directionSemantic: '   ',
    });
  });

  it('shoud set legend values for custom semantic keys', () => {
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
            directionSemantic: 'provider.custom',
          },
        },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new EdgeSemanticLegend({
      edge: {
        from: { any: true },
        to: { any: true },
      },
      options: {
        legendBySemantic: {
          'provider.custom': {
            title: 'Provider custom',
            colour: '#123456',
          },
        },
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({
      directionSemantic: 'provider.custom',
      legend: {
        title: 'Provider custom',
        colour: '#123456',
      },
    });
  });

  it('shoud ignore edges when no legend is mapped for the semantic', () => {
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

    const rule = new EdgeSemanticLegend({
      edge: {
        from: { any: true },
        to: { any: true },
      },
      options: {
        legendBySemantic: {
          [DefaultEdgeDirectionSemantics.Invokes]: {
            title: 'Invokes',
            colour: '#1f77b4',
          },
        },
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({
      directionSemantic: DefaultEdgeDirectionSemantics.Accesses,
    });
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
          attributes: {
            directionSemantic: DefaultEdgeDirectionSemantics.Invokes,
          },
        },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new EdgeSemanticLegend({
      edge: {
        from: { any: true },
        to: { any: true },
      },
      options: {
        legendBySemantic: {
          [DefaultEdgeDirectionSemantics.Invokes]: {
            title: 'Invokes',
            colour: '#1f77b4',
          },
        },
      },
    });

    const result = rule.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({
      directionSemantic: DefaultEdgeDirectionSemantics.Invokes,
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
          attributes: {
            directionSemantic: DefaultEdgeDirectionSemantics.Invokes,
          },
        },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new EdgeSemanticLegend({
      edge: {
        from: { attr: { key: 'label', eq: 'A' } },
        to: { any: true },
      },
      options: {
        legendBySemantic: {
          [DefaultEdgeDirectionSemantics.Invokes]: {
            title: 'Invokes',
            colour: '#1f77b4',
          },
        },
      },
    });

    rule.match(nodeA, node, adapter);
    const mismatchedNode = { ...node, label: 'mismatch' };
    const result = rule.apply(nodeA, mismatchedNode, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({
      directionSemantic: DefaultEdgeDirectionSemantics.Invokes,
    });
  });

  it('shoud skip targets that do not match the query', () => {
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
            directionSemantic: DefaultEdgeDirectionSemantics.Invokes,
          },
        },
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeA);
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new EdgeSemanticLegend({
      edge: {
        from: { nodeId: { eq: 'node-a' } },
        to: { nodeId: { eq: 'node-c' } },
      },
      options: {
        legendBySemantic: {
          [DefaultEdgeDirectionSemantics.Invokes]: {
            title: 'Invokes',
            colour: '#1f77b4',
          },
        },
      },
    });

    rule.match(nodeA, node, adapter);
    const result = rule.apply(nodeA, node, adapter);

    expect(result.getEdgeAttributes(edgeId)).toEqual({
      directionSemantic: DefaultEdgeDirectionSemantics.Invokes,
    });
  });
});
