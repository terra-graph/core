import { mock } from 'jest-mock-extended';
import { TgNodeAttributes, asEdgeId, asNodeId } from '../../../TgGraph.js';
import { Operations } from '../../Operations.js';
import { NodeQuery } from './NodeQuery.js';
import { QueryDsl } from './QuerySchema.js';

describe('NodeQuery.match', () => {
  it('shoud return true for any node when using any', () => {
    const query = NodeQuery.from({ any: true });
    const graph = mock<Operations>();
    const nodeId = asNodeId('node-a');
    const node: TgNodeAttributes = { label: 'resource.name' };

    expect(query.match(nodeId, node, graph)).toBe(true);
  });

  it('shoud support children.exists with false', () => {
    const parentId = asNodeId('cluster_module.a');

    const query = NodeQuery.from({
      and: [
        { nodeId: { startsWith: 'cluster_module' } },
        { children: { exists: false } },
      ],
    });
    const graph = mock<Operations>();

    graph.successors.mockReturnValue([asNodeId('module.a.resource.one')]);

    const resultWithChild = query.match(parentId, { label: 'module.a' }, graph);
    expect(resultWithChild).toBe(false);

    graph.successors.mockReturnValue([]);
    const resultWithoutChild = query.match(
      parentId,
      { label: 'module.a' },
      graph,
    );
    expect(resultWithoutChild).toBe(true);
  });

  it('shoud support children.count', () => {
    const parentId = asNodeId('cluster_module.a');

    const query = NodeQuery.from({
      and: [
        { nodeId: { startsWith: 'cluster_module' } },
        { children: { count: 2 } },
      ],
    });
    const graph = mock<Operations>();

    graph.successors.mockReturnValue([
      asNodeId('module.a.resource.one'),
      asNodeId('module.a.resource.two'),
    ]);

    expect(query.match(parentId, { label: 'module.a' }, graph)).toBe(true);
  });

  it('shoud evaluate children independently of module naming conventions', () => {
    const sourceId = asNodeId('alpha');

    const query = NodeQuery.from({ children: { exists: true } });
    const graph = mock<Operations>();

    graph.successors.mockReturnValue([asNodeId('beta')]);

    expect(query.match(sourceId, { label: 'random.node' }, graph)).toBe(true);
  });

  it('shoud support OR and NOT predicates together', () => {
    const sourceId = asNodeId('node-a');
    const graph = mock<Operations>();

    const query = NodeQuery.from({
      and: [
        {
          or: [{ nodeId: { eq: 'node-a' } }, { nodeId: { eq: 'node-z' } }],
        },
        { not: { nodeId: { eq: 'node-b' } } },
      ],
    });

    expect(query.match(sourceId, { label: 'node-a' }, graph)).toBe(true);
    expect(query.match(asNodeId('node-b'), { label: 'node-b' }, graph)).toBe(
      false,
    );
  });

  it('shoud support inbound edge predicates', () => {
    const sourceId = asNodeId('node-a');
    const targetId = asNodeId('node-b');
    const sourceEdge = asEdgeId('edge-a-b');
    const graph = mock<Operations>();

    graph.inEdges.mockReturnValue([sourceEdge]);
    graph.edgeSource.mockReturnValue(sourceId);
    graph.getNodeAttributes.mockImplementation((nodeId) => {
      if (nodeId === sourceId) {
        return { label: 'node-a' };
      }
      return undefined;
    });

    const query = NodeQuery.from({
      edge: {
        in: {
          nodeId: { eq: 'node-a' },
        },
      },
    });

    expect(query.match(targetId, { label: 'node-b' }, graph)).toBe(true);
  });

  it('shoud return false when edge predicates cannot resolve node attributes', () => {
    const sourceId = asNodeId('node-a');
    const targetId = asNodeId('node-b');
    const sourceEdge = asEdgeId('edge-a-b');
    const graph = mock<Operations>();

    graph.inEdges.mockReturnValue([sourceEdge]);
    graph.edgeSource.mockReturnValue(sourceId);
    graph.getNodeAttributes.mockReturnValue(undefined);

    const query = NodeQuery.from({
      edge: {
        in: {
          nodeId: { eq: 'node-a' },
        },
      },
    });

    expect(query.match(targetId, { label: 'node-b' }, graph)).toBe(false);
  });

  it('shoud return false when outbound targets are missing', () => {
    const sourceId = asNodeId('node-a');
    const targetId = asNodeId('node-b');
    const sourceEdge = asEdgeId('edge-a-b');
    const graph = mock<Operations>();

    graph.outEdges.mockReturnValue([sourceEdge]);
    graph.edgeTarget.mockReturnValue(targetId);
    graph.getNodeAttributes.mockReturnValue(undefined);

    const query = NodeQuery.from({
      edge: {
        out: {
          nodeId: { eq: 'node-b' },
        },
      },
    });

    expect(query.match(sourceId, { label: 'node-a' }, graph)).toBe(false);
  });

  it('shoud evaluate inbound and outbound edge predicates together', () => {
    const sourceId = asNodeId('node-a');
    const targetId = asNodeId('node-b');
    const sourceEdge = asEdgeId('edge-a-b');
    const graph = mock<Operations>();

    graph.inEdges.mockReturnValue([sourceEdge]);
    graph.outEdges.mockReturnValue([sourceEdge]);
    graph.edgeSource.mockReturnValue(sourceId);
    graph.edgeTarget.mockReturnValue(targetId);
    graph.getNodeAttributes.mockImplementation((nodeId) => {
      if (nodeId === sourceId) {
        return { label: 'node-a' };
      }
      if (nodeId === targetId) {
        return { label: 'node-b' };
      }
      return undefined;
    });

    const query = NodeQuery.from({
      edge: {
        in: {
          nodeId: { startsWith: 'node' },
        },
        out: {
          nodeId: { endsWith: 'b' },
        },
      },
    });

    expect(query.match(sourceId, { label: 'node-a' }, graph)).toBe(true);
  });

  it('shoud support outbound edge predicates', () => {
    const sourceId = asNodeId('node-a');
    const targetId = asNodeId('node-b');
    const sourceEdge = asEdgeId('edge-a-b');
    const graph = mock<Operations>();

    graph.outEdges.mockReturnValue([sourceEdge]);
    graph.edgeTarget.mockReturnValue(targetId);
    graph.getNodeAttributes.mockImplementation((nodeId) => {
      if (nodeId === targetId) {
        return { label: 'node-b' };
      }
      return undefined;
    });

    const query = NodeQuery.from({
      edge: {
        out: {
          nodeId: { eq: 'node-b' },
        },
      },
    });

    expect(query.match(sourceId, { label: 'node-a' }, graph)).toBe(true);
  });

  it('shoud match attr predicates beyond equality', () => {
    const graph = mock<Operations>();
    const nodeId = asNodeId('node-a');
    const node: TgNodeAttributes = {
      meta: {
        kind: 'resource',
        name: 'alpha.beta',
        status: 'ready',
      },
    } as TgNodeAttributes;

    expect(
      NodeQuery.from({
        attr: { key: 'meta.kind', in: ['resource', 'other'] },
      }).match(nodeId, node, graph),
    ).toBe(true);

    expect(
      NodeQuery.from({
        attr: { key: 'meta.name', contains: 'beta' },
      }).match(nodeId, node, graph),
    ).toBe(true);

    expect(
      NodeQuery.from({
        attr: { key: 'meta.name', startsWith: ['nope', 'alpha'] },
      }).match(nodeId, node, graph),
    ).toBe(true);

    expect(
      NodeQuery.from({
        attr: { key: 'meta.name', endsWith: ['beta', 'zzz'] },
      }).match(nodeId, node, graph),
    ).toBe(true);

    expect(
      NodeQuery.from({
        attr: { key: 'meta.missing', exists: false },
      }).match(nodeId, node, graph),
    ).toBe(true);

    expect(
      NodeQuery.from({
        attr: { key: 'meta.kind', exists: true },
      }).match(nodeId, node, graph),
    ).toBe(true);
  });

  it('should treat contains and in as array membership predicates for array values', () => {
    const graph = mock<Operations>();
    const nodeId = asNodeId('node-a');
    const node: TgNodeAttributes = {
      meta: {
        tags: ['alpha', 'beta'],
      },
    } as TgNodeAttributes;

    expect(
      NodeQuery.from({
        attr: { key: 'meta.tags', contains: 'beta' },
      }).match(nodeId, node, graph),
    ).toBe(true);

    expect(
      NodeQuery.from({
        attr: { key: 'meta.tags', contains: 'missing' },
      }).match(nodeId, node, graph),
    ).toBe(false);

    expect(
      NodeQuery.from({
        attr: { key: 'meta.tags', in: ['missing', 'alpha'] },
      }).match(nodeId, node, graph),
    ).toBe(true);

    expect(
      NodeQuery.from({
        attr: { key: 'meta.tags', in: ['missing'] },
      }).match(nodeId, node, graph),
    ).toBe(false);
  });

  it('shoud support string startsWith and endsWith predicates', () => {
    const graph = mock<Operations>();
    const nodeId = asNodeId('node-a');
    const node: TgNodeAttributes = {
      meta: {
        name: 'alpha.beta',
      },
    } as TgNodeAttributes;

    expect(
      NodeQuery.from({
        attr: { key: 'meta.name', startsWith: 'alpha' },
      }).match(nodeId, node, graph),
    ).toBe(true);

    expect(
      NodeQuery.from({
        attr: { key: 'meta.name', endsWith: 'beta' },
      }).match(nodeId, node, graph),
    ).toBe(true);
  });

  it('shoud handle string predicates when values are missing', () => {
    const graph = mock<Operations>();
    const nodeId = asNodeId('node-a');
    const node: TgNodeAttributes = {
      meta: {},
    } as TgNodeAttributes;

    expect(
      NodeQuery.from({
        attr: { key: 'meta.missing', contains: 'beta' },
      }).match(nodeId, node, graph),
    ).toBe(false);

    expect(
      NodeQuery.from({
        attr: { key: 'meta.missing', startsWith: 'alpha' },
      }).match(nodeId, node, graph),
    ).toBe(false);

    expect(
      NodeQuery.from({
        attr: { key: 'meta.missing', endsWith: 'beta' },
      }).match(nodeId, node, graph),
    ).toBe(false);
  });

  it('shoud return false for invalid children predicates', () => {
    const graph = mock<Operations>();
    graph.successors.mockReturnValue([]);
    const query = new NodeQuery({ children: {} } as QueryDsl);

    expect(query.match(asNodeId('node-a'), { label: 'node-a' }, graph)).toBe(
      false,
    );
  });

  it('shoud treat non-object path segments as missing', () => {
    const graph = mock<Operations>();
    const nodeId = asNodeId('node-a');
    const node: TgNodeAttributes = {
      meta: {
        name: 'alpha',
      },
    } as TgNodeAttributes;

    expect(
      NodeQuery.from({
        attr: { key: 'meta.name.value', exists: false },
      }).match(nodeId, node, graph),
    ).toBe(true);
  });

  it('shoud match nodeId predicates beyond equality', () => {
    const graph = mock<Operations>();
    const nodeId = asNodeId('node-a');

    expect(
      NodeQuery.from({
        nodeId: { in: ['node-a', 'node-b'] },
      }).match(nodeId, { label: 'node-a' }, graph),
    ).toBe(true);

    expect(
      NodeQuery.from({
        nodeId: { contains: 'ode-' },
      }).match(nodeId, { label: 'node-a' }, graph),
    ).toBe(true);

    expect(
      NodeQuery.from({
        nodeId: { endsWith: 'a' },
      }).match(nodeId, { label: 'node-a' }, graph),
    ).toBe(true);
  });

  it('shoud return false for unsupported dsl entries', () => {
    const graph = mock<Operations>();
    const query = new NodeQuery({} as QueryDsl);

    expect(query.match(asNodeId('node-a'), { label: 'node-a' }, graph)).toBe(
      false,
    );
  });

  it('shoud treat empty attribute paths as undefined', () => {
    const graph = mock<Operations>();
    const nodeId = asNodeId('node-a');
    const query = new NodeQuery({
      attr: { key: '', eq: 'value' },
    } as QueryDsl);

    expect(query.match(nodeId, { label: 'node-a' }, graph)).toBe(false);
  });

  it('shoud return false when predicates have no operators', () => {
    const graph = mock<Operations>();
    const nodeId = asNodeId('node-a');
    const query = new NodeQuery({
      attr: { key: 'meta.kind' },
    } as QueryDsl);

    expect(
      query.match(
        nodeId,
        { meta: { kind: 'resource' } } as TgNodeAttributes,
        graph,
      ),
    ).toBe(false);
  });

  it('shoud provide fromJson as a parsing shortcut', () => {
    const query = NodeQuery.fromJson({ any: true });
    const graph = mock<Operations>();

    expect(
      query.match(asNodeId('node-any'), { label: 'anything' }, graph),
    ).toBe(true);
  });
});

describe('NodeQuery.getDsl', () => {
  it('shoud return the parsed dsl', () => {
    const input = { any: true } as const;
    const query = NodeQuery.from(input);

    expect(query.getDsl()).toEqual(input);
  });
});

describe('NodeQuery.toMatcher', () => {
  it('shoud expose a matcher function', () => {
    const query = NodeQuery.from({
      attr: { key: 'meta.kind', eq: 'resource' },
    });
    const matcher = query.toMatcher();
    const graph = mock<Operations>();

    expect(
      matcher(
        asNodeId('node-a'),
        { meta: { kind: 'resource' } } as TgNodeAttributes,
        graph,
      ),
    ).toBe(true);
  });
});
