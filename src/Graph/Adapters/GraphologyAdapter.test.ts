import Graph, { DirectedGraph, UndirectedGraph } from 'graphology';
import { JsonRenderer } from '../Renderers/JsonRenderer.js';
import {
  TG_SCHEMA_VERSION,
  TgGraph,
  asEdgeId,
  asNodeId,
  tgNodeIdFrom,
  tgProjectionNodeIdFrom,
} from '../TgGraph.js';
import { GraphologyAdapter } from './GraphologyAdapter.js';

const buildGraphFixture = () => {
  const graph = new DirectedGraph();
  const a = asNodeId('a');
  const b = asNodeId('b');
  graph.addNode(a, { label: 'A' });
  graph.addNode(b, { label: 'B' });
  const e1 = asEdgeId('e1');
  graph.addEdgeWithKey(e1, a, b, { weight: 2 });
  graph.setAttribute('tg:description', { note: 'test' });
  const tg = {
    schemaVersion: TG_SCHEMA_VERSION,
    nodes: {
      [a]: { id: a },
      [b]: { id: b },
    },
    edges: [
      {
        id: e1,
        from: a,
        to: b,
        attributes: { weight: 2 },
      },
    ],
    description: { note: 'test' },
  };
  return { graph, tg, a, b, e1 };
};

describe('GraphologyAdapter.getGraph', () => {
  it('shoud return a copy of the original graph without changing it', () => {
    const initialGraph = new UndirectedGraph();
    initialGraph.addNode('a-node', { attribute: 'value' });

    const graphology = new GraphologyAdapter(initialGraph);
    const copiedGraph = graphology.getGraph();

    expect(copiedGraph).not.toBe(initialGraph);
    expect(copiedGraph.export()).toStrictEqual(initialGraph.export());
  });

  it('shoud default to an empty directed graph when none is provided', () => {
    const adapter = new GraphologyAdapter();

    expect(adapter.nodeIds()).toEqual([]);
  });
});

describe('GraphologyAdapter.getRenderer', () => {
  it('shoud return a JsonRenderer instance', () => {
    const adapter = new GraphologyAdapter(new DirectedGraph());

    const renderer = adapter.getRenderer();

    expect(renderer).toBeInstanceOf(JsonRenderer);
  });
});

describe('GraphologyAdapter.getNodeAttributes', () => {
  it('shoud return node attributes when the node exists', () => {
    const { graph, a } = buildGraphFixture();

    const adapter = new GraphologyAdapter(graph);

    expect(adapter.getNodeAttributes(a)).toStrictEqual({
      label: 'A',
    });
  });

  it('shoud return undefined when the node does not exist', () => {
    const { graph } = buildGraphFixture();
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.getNodeAttributes(asNodeId('missing'))).toBeUndefined();
  });
});

describe('GraphologyAdapter.getGraphHints', () => {
  it('shoud return graph hints when present', () => {
    const graph = new DirectedGraph();
    graph.setAttribute('tg:hints', {
      topology: {
        scopes: {
          scopeA: {
            id: 'scope-a',
          },
        },
      },
    });

    const adapter = new GraphologyAdapter(graph);

    expect(adapter.getGraphHints()).toStrictEqual({
      topology: {
        scopes: {
          scopeA: {
            id: 'scope-a',
          },
        },
      },
    });
  });

  it('shoud return undefined when graph hints are missing', () => {
    const adapter = new GraphologyAdapter(new DirectedGraph());

    expect(adapter.getGraphHints()).toBeUndefined();
  });
});

describe('GraphologyAdapter.getEdgeAttributes', () => {
  it('shoud return edge attributes', () => {
    const { graph, e1 } = buildGraphFixture();
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.getEdgeAttributes(e1)).toStrictEqual({ weight: 2 });
  });
});

describe('GraphologyAdapter.edgeSource', () => {
  it('shoud return the source node id', () => {
    const { graph, a, e1 } = buildGraphFixture();
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.edgeSource(e1)).toBe(a);
  });
});

describe('GraphologyAdapter.edgeTarget', () => {
  it('shoud return the target node id', () => {
    const { graph, b, e1 } = buildGraphFixture();
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.edgeTarget(e1)).toBe(b);
  });
});

describe('GraphologyAdapter.neighbors', () => {
  it('shoud return neighboring node ids', () => {
    const { graph, a, b } = buildGraphFixture();
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.neighbors(a)).toEqual(expect.arrayContaining([b]));
  });
});

describe('GraphologyAdapter.predecessors', () => {
  it('shoud return predecessor node ids', () => {
    const { graph, a, b } = buildGraphFixture();
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.predecessors(b)).toEqual(expect.arrayContaining([a]));
  });
});

describe('GraphologyAdapter.successors', () => {
  it('shoud return successor node ids', () => {
    const { graph, a, b } = buildGraphFixture();
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.successors(a)).toEqual(expect.arrayContaining([b]));
  });
});

describe('GraphologyAdapter.inEdges', () => {
  it('shoud return inbound edge ids', () => {
    const { graph, b, e1 } = buildGraphFixture();
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.inEdges(b)).toEqual([e1]);
  });
});

describe('GraphologyAdapter.outEdges', () => {
  it('shoud return outbound edge ids', () => {
    const { graph, a, e1 } = buildGraphFixture();
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.outEdges(a)).toEqual([e1]);
  });
});

describe('GraphologyAdapter.edgesBetween', () => {
  it('shoud return edge ids between nodes', () => {
    const { graph, a, b, e1 } = buildGraphFixture();
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.edgesBetween(a, b)).toEqual([e1]);
  });
});

describe('GraphologyAdapter.setNodeAttributes', () => {
  it('shoud return a new adapter with updated node attributes', () => {
    const { graph, a } = buildGraphFixture();
    const adapter = new GraphologyAdapter(graph);

    const updated = adapter.setNodeAttributes(a, { label: 'A2' });

    expect(updated.getNodeAttributes(a)).toStrictEqual({ label: 'A2' });
    expect(adapter.getNodeAttributes(a)).toStrictEqual({ label: 'A' });
  });
});

describe('GraphologyAdapter.setGraphHints', () => {
  it('shoud set graph hints and return a new adapter', () => {
    const { graph } = buildGraphFixture();
    const adapter = new GraphologyAdapter(graph);

    const updated = adapter.setGraphHints({
      topology: {
        scopes: {
          scopeA: {
            id: 'scope-a',
          },
        },
      },
    });

    expect(updated).not.toBe(adapter);
    expect(updated.getGraphHints()).toStrictEqual({
      topology: {
        scopes: {
          scopeA: {
            id: 'scope-a',
          },
        },
      },
    });
    expect(adapter.getGraphHints()).toBeUndefined();
  });

  it('shoud clear graph hints when set to undefined', () => {
    const graph = new DirectedGraph();
    graph.setAttribute('tg:hints', {
      topology: {
        scopes: {
          scopeA: {
            id: 'scope-a',
          },
        },
      },
    });

    const adapter = new GraphologyAdapter(graph);
    const updated = adapter.setGraphHints(undefined);

    expect(updated.getGraphHints()).toBeUndefined();
    expect(adapter.getGraphHints()).toStrictEqual({
      topology: {
        scopes: {
          scopeA: {
            id: 'scope-a',
          },
        },
      },
    });
  });
});

describe('GraphologyAdapter.setEdge', () => {
  it('shoud return a new adapter with a new edge', () => {
    const { graph, a, b, e1 } = buildGraphFixture();
    const adapter = new GraphologyAdapter(graph);
    const e2 = asEdgeId('e2');

    const updated = adapter.setEdge(e2, b, a, { weight: 1 });

    expect(updated.edgesBetween(b, a)).toEqual(
      expect.arrayContaining([e1, e2]),
    );
    expect(adapter.edgesBetween(b, a)).toEqual([e1]);
  });
});

describe('GraphologyAdapter.removeNode', () => {
  it('shoud return a new adapter without the node', () => {
    const { graph, a } = buildGraphFixture();
    const adapter = new GraphologyAdapter(graph);

    const updated = adapter.removeNode(a);

    expect(updated.getNodeAttributes(a)).toBeUndefined();
    expect(adapter.getNodeAttributes(a)).toStrictEqual({ label: 'A' });
  });
});

describe('GraphologyAdapter.removeEdge', () => {
  it('shoud return a new adapter without the edge', () => {
    const { graph, a, b, e1 } = buildGraphFixture();
    const adapter = new GraphologyAdapter(graph);

    const updated = adapter.removeEdge(e1);

    expect(updated.edgesBetween(a, b)).toEqual([]);
    expect(adapter.edgesBetween(a, b)).toEqual([e1]);
  });
});

const buildTgGraph = () => {
  const { a, b, e1 } = buildGraphFixture();
  return {
    tg: {
      schemaVersion: TG_SCHEMA_VERSION,
      nodes: {
        [a]: { id: a },
        [b]: { id: b },
      },
      edges: [
        {
          id: e1,
          from: a,
          to: b,
          attributes: { weight: 2 },
        },
      ],
      description: { note: 'test' },
    },
    a,
    b,
    e1,
  };
};

describe('GraphologyAdapter.withTgGraph', () => {
  it('shoud return a new adapter with the graph data applied', () => {
    const { tg } = buildTgGraph();

    const updated = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);

    expect(updated.toTgGraph()).toStrictEqual(tg);
  });

  it('shoud default missing edge attributes to an empty object', () => {
    const { a, b, e1 } = buildGraphFixture();
    const tg = {
      schemaVersion: TG_SCHEMA_VERSION,
      nodes: {
        [a]: { id: a },
        [b]: { id: b },
      },
      edges: [
        {
          id: e1,
          from: a,
          to: b,
        },
      ],
      description: {},
    };

    const updated = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);

    expect(updated.toTgGraph()).toStrictEqual({
      ...tg,
      edges: [
        {
          ...tg.edges[0],
          attributes: {},
        },
      ],
    });
  });

  it('shoud default schemaVersion when missing', () => {
    const tg = {
      nodes: {},
      edges: [],
      description: {},
    } as unknown as Omit<TgGraph, 'schemaVersion'>;

    const updated = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      tg as TgGraph,
    );

    expect(updated.toTgGraph().schemaVersion).toBe(TG_SCHEMA_VERSION);
  });

  it('shoud preserve graph and node topology/cardinality hints', () => {
    const nodeId = asNodeId('node-a');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      hints: {
        topology: {
          scopes: {
            network: {
              id: 'network',
              label: 'Network',
            },
            subnet: {
              id: 'subnet',
              label: 'Subnet',
              parentId: 'network',
              order: 2,
            },
          },
        },
      },
      nodes: {
        [nodeId]: {
          id: nodeId,
          terraform: {
            kind: 'resource',
            address: 'aws_instance.main',
            resource: 'aws_instance',
            name: 'main',
          },
          hints: {
            topology: {
              scopeId: 'subnet',
              lane: 'private',
              order: 1,
            },
            cardinality: {
              count: 3,
              mode: 'count',
              keys: ['0', '1', '2'],
            },
          },
        },
      },
      edges: [],
    };

    const updated = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);

    expect(updated.toTgGraph()).toStrictEqual(tg);
  });
});

describe('GraphologyAdapter.toTgGraph', () => {
  it('shoud return a TgGraph representation of the current graph', () => {
    const { tg, graph } = buildGraphFixture();
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.toTgGraph()).toStrictEqual(tg);
  });

  it('shoud omit labels from the canonical tg model', () => {
    const graph = new DirectedGraph();
    const a = asNodeId('a');
    graph.addNode(a, { label: 'A' });
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.toTgGraph()).toStrictEqual({
      schemaVersion: TG_SCHEMA_VERSION,
      nodes: {
        [a]: { id: a },
      },
      edges: [],
      description: {},
    });
  });

  it('shoud include terraform fields when present on the node attributes', () => {
    const graph = new DirectedGraph();
    const a = asNodeId('a');
    graph.addNode(a, {
      label: 'A',
      terraform: {
        kind: 'resource',
        address: 'aws_s3_bucket.main',
        resource: 'aws_s3_bucket',
        name: 'main',
      },
    });
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.toTgGraph()).toStrictEqual({
      schemaVersion: TG_SCHEMA_VERSION,
      nodes: {
        [a]: {
          id: a,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.main',
            resource: 'aws_s3_bucket',
            name: 'main',
          },
        },
      },
      edges: [],
      description: {},
    });
  });

  it('shoud preserve provider agnostic terraform state fields when present', () => {
    const graph = new DirectedGraph();
    const a = asNodeId('a');
    graph.addNode(a, {
      terraform: {
        kind: 'resource',
        address: 'aws_iam_policy.example',
        resource: 'aws_iam_policy',
        name: 'example',
        state: {
          source: 'plan_show',
          effective: {
            address: 'aws_iam_policy.example',
            mode: 'managed',
            type: 'aws_iam_policy',
            name: 'example',
            provider_name: 'registry.terraform.io/hashicorp/aws',
            values: {
              name: 'example',
            },
          },
          instances: [
            {
              address: 'aws_iam_policy.example',
              mode: 'managed',
              type: 'aws_iam_policy',
              name: 'example',
              provider_name: 'registry.terraform.io/hashicorp/aws',
              values: {
                name: 'example',
              },
            },
          ],
        },
      },
    });
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.toTgGraph()).toStrictEqual({
      schemaVersion: TG_SCHEMA_VERSION,
      nodes: {
        [a]: {
          id: a,
          terraform: {
            kind: 'resource',
            address: 'aws_iam_policy.example',
            resource: 'aws_iam_policy',
            name: 'example',
            state: {
              source: 'plan_show',
              effective: {
                address: 'aws_iam_policy.example',
                mode: 'managed',
                type: 'aws_iam_policy',
                name: 'example',
                provider_name: 'registry.terraform.io/hashicorp/aws',
                values: {
                  name: 'example',
                },
              },
              instances: [
                {
                  address: 'aws_iam_policy.example',
                  mode: 'managed',
                  type: 'aws_iam_policy',
                  name: 'example',
                  provider_name: 'registry.terraform.io/hashicorp/aws',
                  values: {
                    name: 'example',
                  },
                },
              ],
            },
          },
        },
      },
      edges: [],
      description: {},
    });
  });

  it('shoud omit terraform.state when source/effective/instances are invalid', () => {
    const graph = new DirectedGraph();
    const invalidSource = asNodeId('invalid-source');
    const invalidEffective = asNodeId('invalid-effective');
    const invalidInstances = asNodeId('invalid-instances');

    graph.addNode(invalidSource, {
      terraform: {
        kind: 'resource',
        address: 'aws_s3_bucket.invalid_source',
        resource: 'aws_s3_bucket',
        name: 'invalid_source',
        state: {
          source: 'unsupported',
          effective: {
            address: 'aws_s3_bucket.invalid_source',
            values: {},
          },
          instances: [],
        },
      },
    });

    graph.addNode(invalidEffective, {
      terraform: {
        kind: 'resource',
        address: 'aws_s3_bucket.invalid_effective',
        resource: 'aws_s3_bucket',
        name: 'invalid_effective',
        state: {
          source: 'state_show',
          effective: 'not-an-object',
          instances: [],
        },
      },
    });

    graph.addNode(invalidInstances, {
      terraform: {
        kind: 'resource',
        address: 'aws_s3_bucket.invalid_instances',
        resource: 'aws_s3_bucket',
        name: 'invalid_instances',
        state: {
          source: 'state_show',
          effective: {
            address: 'aws_s3_bucket.invalid_instances',
            values: {},
          },
          instances: { not: 'an-array' },
        },
      },
    });

    const tg = new GraphologyAdapter(graph).toTgGraph();

    expect(tg.nodes[invalidSource].terraform).toEqual({
      kind: 'resource',
      address: 'aws_s3_bucket.invalid_source',
      resource: 'aws_s3_bucket',
      name: 'invalid_source',
    });

    expect(tg.nodes[invalidEffective].terraform).toEqual({
      kind: 'resource',
      address: 'aws_s3_bucket.invalid_effective',
      resource: 'aws_s3_bucket',
      name: 'invalid_effective',
    });

    expect(tg.nodes[invalidInstances].terraform).toEqual({
      kind: 'resource',
      address: 'aws_s3_bucket.invalid_instances',
      resource: 'aws_s3_bucket',
      name: 'invalid_instances',
    });
  });

  it('shoud accept null effective state and filter invalid state instances', () => {
    const graph = new DirectedGraph();
    const a = asNodeId('a');

    graph.addNode(a, {
      terraform: {
        kind: 'resource',
        address: 'aws_instance.app',
        resource: 'aws_instance',
        name: 'app',
        state: {
          source: 'state_show',
          effective: null,
          instances: [
            null,
            'not-an-object',
            {
              mode: 'managed',
            },
            {
              address: 'aws_instance.app["blue"]',
              module_address: 'module.app',
              mode: 'managed',
              type: 'aws_instance',
              name: 'app',
              index: 'blue',
              provider_name: 'registry.terraform.io/hashicorp/aws',
              deposed: 'deposed-key',
              previous_address: 'aws_instance.app["green"]',
              values: { id: 'i-blue' },
            },
            {
              address: 'aws_instance.app["red"]',
            },
          ],
        },
      },
    });

    const tg = new GraphologyAdapter(graph).toTgGraph();

    expect(tg.nodes[a]).toEqual({
      id: a,
      terraform: {
        kind: 'resource',
        address: 'aws_instance.app',
        resource: 'aws_instance',
        name: 'app',
        state: {
          source: 'state_show',
          effective: null,
          instances: [
            {
              address: 'aws_instance.app["blue"]',
              module_address: 'module.app',
              mode: 'managed',
              type: 'aws_instance',
              name: 'app',
              index: 'blue',
              provider_name: 'registry.terraform.io/hashicorp/aws',
              deposed: 'deposed-key',
              previous_address: 'aws_instance.app["green"]',
              values: { id: 'i-blue' },
            },
            {
              address: 'aws_instance.app["red"]',
              values: null,
            },
          ],
        },
      },
    });
  });

  it('shoud return an empty-node payload when neither label nor terraform exist', () => {
    const graph = new DirectedGraph();
    const a = asNodeId('a');
    graph.addNode(a, {});
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.toTgGraph()).toStrictEqual({
      schemaVersion: TG_SCHEMA_VERSION,
      nodes: {
        [a]: { id: a },
      },
      edges: [],
      description: {},
    });
  });

  it('shoud derive terraform details from namespaced node ids', () => {
    const graph = new DirectedGraph();
    const nodeId = tgNodeIdFrom(
      'resource',
      'module.example.aws_s3_bucket.main',
    );
    graph.addNode(nodeId, { label: 'bucket' });
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.toTgGraph()).toStrictEqual({
      schemaVersion: TG_SCHEMA_VERSION,
      nodes: {
        [nodeId]: {
          id: nodeId,
          terraform: {
            kind: 'resource',
            address: 'module.example.aws_s3_bucket.main',
            resource: 'aws_s3_bucket',
            name: 'main',
            moduleAddress: 'module.example',
            parentModuleName: 'example',
            parentModuleNodeId: tgNodeIdFrom('module', 'module.example'),
          },
        },
      },
      edges: [],
      description: {},
    });
  });

  it('shoud derive terraform details for data nodes', () => {
    const graph = new DirectedGraph();
    const nodeId = tgNodeIdFrom('data', 'data.aws_iam_policy.policy');
    graph.addNode(nodeId, { label: 'policy' });
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.toTgGraph().nodes[nodeId]).toEqual({
      id: nodeId,
      terraform: {
        kind: 'data',
        address: 'data.aws_iam_policy.policy',
        resource: 'aws_iam_policy',
        name: 'policy',
      },
    });
  });

  it('shoud derive terraform details for nested module nodes', () => {
    const graph = new DirectedGraph();
    const nodeId = tgNodeIdFrom('module', 'module.alpha.module.beta');
    graph.addNode(nodeId, { label: 'module.beta' });
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.toTgGraph().nodes[nodeId]).toEqual({
      id: nodeId,
      terraform: {
        kind: 'module',
        address: 'module.alpha.module.beta',
        resource: 'module',
        name: 'beta',
        moduleAddress: 'module.alpha',
        parentModuleName: 'alpha',
        parentModuleNodeId: tgNodeIdFrom('module', 'module.alpha'),
      },
    });
  });

  it('shoud derive terraform details for top-level module nodes', () => {
    const graph = new DirectedGraph();
    const nodeId = tgNodeIdFrom('module', 'module.alpha');
    graph.addNode(nodeId, { label: 'module.alpha' });
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.toTgGraph().nodes[nodeId]).toEqual({
      id: nodeId,
      terraform: {
        kind: 'module',
        address: 'module.alpha',
        resource: 'module',
        name: 'alpha',
      },
    });
  });

  it('shoud derive terraform details for local and provider nodes', () => {
    const graph = new DirectedGraph();
    const localNodeId = tgNodeIdFrom('local', 'region');
    const providerNodeId = tgNodeIdFrom(
      'provider',
      'provider[registry.terraform.io/hashicorp/aws]',
    );

    graph.addNode(localNodeId, { label: 'region' });
    graph.addNode(providerNodeId, { label: 'provider.aws' });

    const adapter = new GraphologyAdapter(graph);
    const tg = adapter.toTgGraph();

    expect(tg.nodes[localNodeId]).toEqual({
      id: localNodeId,
      terraform: {
        kind: 'local',
        address: 'region',
        resource: 'local',
        name: 'region',
      },
    });
    expect(tg.nodes[providerNodeId]).toEqual({
      id: providerNodeId,
      terraform: {
        kind: 'provider',
        address: 'provider[registry.terraform.io/hashicorp/aws]',
        resource: 'provider',
        name: 'provider[registry.terraform.io/hashicorp/aws]',
      },
    });
  });

  it('shoud derive terraform details for root and meta nodes', () => {
    const graph = new DirectedGraph();
    const rootNodeId = tgNodeIdFrom('root', 'root');
    const metaNodeId = tgNodeIdFrom('meta', 'meta.block');
    graph.addNode(rootNodeId, { label: 'root' });
    graph.addNode(metaNodeId, { label: 'meta.block' });
    const adapter = new GraphologyAdapter(graph);
    const tg = adapter.toTgGraph();

    expect(tg.nodes[rootNodeId]).toEqual({
      id: rootNodeId,
      terraform: {
        kind: 'root',
        address: 'root',
        resource: 'root',
        name: 'root',
      },
    });
    expect(tg.nodes[metaNodeId]).toEqual({
      id: metaNodeId,
      terraform: {
        kind: 'meta',
        address: 'meta.block',
        resource: 'meta',
        name: 'meta.block',
      },
    });
  });

  it('shoud use address fallback when provider or meta join is empty', () => {
    const graph = new DirectedGraph();
    const providerNodeId = tgNodeIdFrom('provider', 'provider.aws');
    const metaNodeId = tgNodeIdFrom('meta', 'meta.block');
    graph.addNode(providerNodeId, { label: 'provider' });
    graph.addNode(metaNodeId, { label: 'meta' });
    const adapter = new GraphologyAdapter(graph);
    const originalJoin = Array.prototype.join;
    let overrides = 0;

    Array.prototype.join = function (separator?: string) {
      if (overrides < 2 && (this[0] === 'provider' || this[0] === 'meta')) {
        overrides += 1;
        return '';
      }
      return originalJoin.call(this, separator);
    };

    try {
      const tg = adapter.toTgGraph();

      expect(tg.nodes[providerNodeId]).toEqual({
        id: providerNodeId,
        terraform: {
          kind: 'provider',
          address: 'provider.aws',
          resource: 'provider',
          name: 'provider.aws',
        },
      });
      expect(tg.nodes[metaNodeId]).toEqual({
        id: metaNodeId,
        terraform: {
          kind: 'meta',
          address: 'meta.block',
          resource: 'meta',
          name: 'meta.block',
        },
      });
    } finally {
      Array.prototype.join = originalJoin;
    }
  });

  it('shoud fall back to terraform kind for unknown types', () => {
    const graph = new DirectedGraph();
    const nodeId = tgNodeIdFrom('terraform', 'terraform');
    graph.addNode(nodeId, { label: 'terraform' });
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.toTgGraph().nodes[nodeId]).toEqual({
      id: nodeId,
      terraform: {
        kind: 'terraform',
        address: 'terraform',
        resource: 'terraform',
        name: 'terraform',
      },
    });
  });

  it('shoud preserve projection nodes without inferring terraform metadata', () => {
    const graph = new DirectedGraph();
    const nodeId = tgProjectionNodeIdFrom('core', 'api.public_gateway');
    graph.addNode(nodeId, {
      projection: {
        layer: 'core',
        address: 'api.public_gateway',
        label: 'API Gateway',
        category: 'service',
        derivation: {
          source: 'plugin',
          strategyId: 'aws.api_gateway',
          primaryAnchorNodeId: asNodeId('trigger-node'),
          anchors: [
            {
              nodeId: asNodeId('trigger-node'),
              address: 'aws_apigatewayv2_api.public',
              role: 'trigger',
            },
          ],
        },
      },
    });
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.toTgGraph().nodes[nodeId]).toEqual({
      id: nodeId,
      projection: {
        layer: 'core',
        address: 'api.public_gateway',
        label: 'API Gateway',
        category: 'service',
        derivation: {
          source: 'plugin',
          strategyId: 'aws.api_gateway',
          primaryAnchorNodeId: asNodeId('trigger-node'),
          anchors: [
            {
              nodeId: asNodeId('trigger-node'),
              address: 'aws_apigatewayv2_api.public',
              role: 'trigger',
            },
          ],
        },
      },
    });
  });

  it('shoud honor provided terraform parentModuleNodeId', () => {
    const graph = new DirectedGraph();
    const nodeId = asNodeId('custom-node');
    const parentModuleNodeId = tgNodeIdFrom('module', 'module.alpha');
    graph.addNode(nodeId, {
      label: 'custom',
      terraform: {
        kind: 'resource',
        address: 'module.alpha.aws_s3_bucket.main',
        resource: 'aws_s3_bucket',
        name: 'main',
        moduleAddress: 'module.alpha',
        parentModuleName: 'alpha',
        parentModuleNodeId,
      },
    });
    const adapter = new GraphologyAdapter(graph);

    expect(adapter.toTgGraph().nodes[nodeId]).toEqual({
      id: nodeId,
      terraform: {
        kind: 'resource',
        address: 'module.alpha.aws_s3_bucket.main',
        resource: 'aws_s3_bucket',
        name: 'main',
        moduleAddress: 'module.alpha',
        parentModuleName: 'alpha',
        parentModuleNodeId,
      },
    });
  });

  it('shoud fall back to the module address when segments are empty', () => {
    const graph = new DirectedGraph();
    const nodeId = tgNodeIdFrom('module', 'module.alpha');
    graph.addNode(nodeId, { label: 'module.alpha' });
    const adapter = new GraphologyAdapter(graph);
    const originalSplit = String.prototype.split;

    String.prototype.split = function (...args: unknown[]) {
      if (this === 'module.alpha') {
        return [];
      }
      return (originalSplit as (...parts: unknown[]) => string[]).apply(
        this as unknown as string,
        args,
      );
    };

    try {
      const node = adapter.toTgGraph().nodes[nodeId];
      expect(node.terraform).toEqual({
        kind: 'module',
        address: 'module.alpha',
        resource: 'module',
        name: 'module.alpha',
      });
    } finally {
      String.prototype.split = originalSplit;
    }
  });
});

describe('GraphologyAdapter.parentModuleHelpers', () => {
  it('shoud fall back to moduleAddress when split yields no parts', () => {
    const adapter = new GraphologyAdapter(new DirectedGraph());
    const originalSplit = String.prototype.split as (
      ...args: unknown[]
    ) => string[];

    String.prototype.split = function (...args: unknown[]) {
      if (this === 'module.empty') {
        return [];
      }
      return originalSplit.apply(this as unknown as string, args);
    };

    try {
      const helpers = (
        adapter as unknown as {
          parentModuleHelpers: (moduleAddress: string) => {
            parentModuleName: string;
            parentModuleNodeId: string;
          };
        }
      ).parentModuleHelpers('module.empty');

      expect(helpers).toEqual({
        parentModuleName: 'module.empty',
        parentModuleNodeId: tgNodeIdFrom('module', 'module.empty'),
      });
    } finally {
      String.prototype.split = originalSplit;
    }
  });
});
