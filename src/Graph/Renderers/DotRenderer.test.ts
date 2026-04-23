import { DirectedGraph } from 'graphology';
import { DotAdapter } from '../Adapters/DotAdapter.js';
import { RenderArtifact } from '../Renderer.js';
import {
  TG_SCHEMA_VERSION,
  TgGraph,
  TgNode,
  asEdgeId,
  asNodeId,
} from '../TgGraph.js';
import { DotRenderer } from './DotRenderer.js';

const toTextContent = (artifact: RenderArtifact): string => {
  if (typeof artifact.content !== 'string') {
    throw new Error('Expected renderer content to be string');
  }

  return artifact.content;
};

describe('DotRenderer.render', () => {
  it('shoud render nodes and edges with dot adapter attributes', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const edgeId = asEdgeId('edge-a-b');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {
        Environment: 'test',
      },
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
          adapter: {
            [DotAdapter.name]: { shape: 'box' },
          },
        },
        [nodeB]: {
          id: nodeB,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.b',
            resource: 'aws_s3_bucket',
            name: 'b',
          },
        },
      },
      edges: [
        {
          id: edgeId,
          from: nodeA,
          to: nodeB,
          attributes: {
            legend: {
              title: 'Bucket Relation',
              colour: '#c20202',
            },
            adapter: {
              [DotAdapter.name]: { style: 'dashed' },
            },
          },
        },
      ],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer();

    const artifact = renderer.render(adapter);
    const output = toTextContent(artifact);

    expect(artifact.mediaType).toBe('text/vnd.graphviz');
    expect(artifact.extension).toBe('dot');
    expect(output).toContain('"node-a"');
    expect(output).toContain('label="aws_s3_bucket.a"');
    expect(output).toContain('shape=box');
    expect(output).toContain('style=dashed');
    expect(output).toContain('color="#c20202"');
    expect(output).toContain('subgraph "cluster_Legend"');
    expect(output).toContain('label="Bucket Relation"');
    expect(output).toContain('Environment:');

    const keyIndex = output.indexOf('subgraph "cluster_Legend"');
    const nodeIndex = output.indexOf('"node-a"');
    expect(keyIndex).toBeGreaterThan(-1);
    expect(nodeIndex).toBeGreaterThan(-1);
    expect(keyIndex).toBeLessThan(nodeIndex);
  });

  it('shoud include ranks when provided', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
        },
        [nodeB]: {
          id: nodeB,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.b',
            resource: 'aws_s3_bucket',
            name: 'b',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const ranked = adapter.addRank([nodeA, nodeB], 'same');
    const renderer = new DotRenderer();

    const output = toTextContent(renderer.render(ranked));

    expect(output).toContain(`{ rank = same; "${nodeA}" "${nodeB}" }`);
  });

  it('shoud omit rank entries for nodes that are not present', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const missing = asNodeId('node-missing');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
        },
        [nodeB]: {
          id: nodeB,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.b',
            resource: 'aws_s3_bucket',
            name: 'b',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const ranked = adapter.addRank([nodeA, missing], 'same');
    const renderer = new DotRenderer();

    const output = toTextContent(renderer.render(ranked));

    expect(output).not.toContain(missing);
    expect(output).not.toContain(`{ rank = same; "${nodeA}" "${missing}" }`);
  });

  it('shoud include graph attributes such as rankdir when provided', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
        },
        [nodeB]: {
          id: nodeB,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.b',
            resource: 'aws_s3_bucket',
            name: 'b',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer({
      graph: { rankdir: 'LR' },
    });

    const output = toTextContent(renderer.render(adapter));

    expect(output).toContain('rankdir=LR');
  });

  it('shoud apply default spacing for TB/BT rankdir', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
        },
        [nodeB]: {
          id: nodeB,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.b',
            resource: 'aws_s3_bucket',
            name: 'b',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer({
      graph: { rankdir: 'TB' },
    });

    const output = toTextContent(renderer.render(adapter));

    expect(output).toContain('rankdir=TB');
    expect(output).toContain('nodesep=');
    expect(output).toContain('ranksep=');
  });

  it('shoud omit legend when no legend metadata is provided', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const edgeId = asEdgeId('edge-a-b');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
        },
        [nodeB]: {
          id: nodeB,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.b',
            resource: 'aws_s3_bucket',
            name: 'b',
          },
        },
      },
      edges: [
        {
          id: edgeId,
          from: nodeA,
          to: nodeB,
          attributes: {
            adapter: {
              [DotAdapter.name]: { style: 'dotted' },
            },
          },
        },
      ],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer();

    const output = toTextContent(renderer.render(adapter));

    expect(output).not.toContain('cluster_Legend');
  });

  it('shoud keep output unchanged when topology hints are absent', () => {
    const nodeA = asNodeId('node-a');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer();
    const output = toTextContent(renderer.render(adapter));

    expect(output).not.toContain('cluster_scope_');
  });

  it('shoud render nested topology scopes and parent scoped nodes', () => {
    const scopedNode = asNodeId('scoped-node');
    const unscopedNode = asNodeId('unscoped-node');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      hints: {
        topology: {
          scopes: {
            subnet: {
              id: 'subnet',
              label: 'Private Subnet',
              parentId: 'vpc',
              order: 2,
            },
            vpc: {
              id: 'vpc',
              label: 'Main VPC',
              order: 1,
            },
          },
        },
      },
      nodes: {
        [scopedNode]: {
          id: scopedNode,
          terraform: {
            kind: 'resource',
            address: 'aws_instance.scoped',
            resource: 'aws_instance',
            name: 'scoped',
          },
          hints: {
            topology: {
              scopeId: 'subnet',
            },
          },
        },
        [unscopedNode]: {
          id: unscopedNode,
          terraform: {
            kind: 'resource',
            address: 'aws_instance.unscoped',
            resource: 'aws_instance',
            name: 'unscoped',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer();
    const output = toTextContent(renderer.render(adapter));

    expect(output).toContain('subgraph cluster_scope_vpc');
    expect(output).toContain('subgraph cluster_scope_subnet');
    expect(output.indexOf('subgraph cluster_scope_vpc')).toBeLessThan(
      output.indexOf('subgraph cluster_scope_subnet'),
    );

    const subnetBlock = output.match(
      /subgraph cluster_scope_subnet \{([\s\S]*?)\n\s*\}/,
    );
    expect(subnetBlock).toBeTruthy();
    expect(subnetBlock?.[1]).toContain('"scoped-node"');
    expect(subnetBlock?.[1]).not.toContain('"unscoped-node"');
    expect(output).toContain('"unscoped-node"');
  });

  it('shoud order topology scopes by order then id', () => {
    const nodeAlpha = asNodeId('node-alpha');
    const nodeBeta = asNodeId('node-beta');
    const nodeZeta = asNodeId('node-zeta');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      hints: {
        topology: {
          scopes: {
            zeta: {
              id: 'zeta',
              order: 2,
            },
            alpha: {
              id: 'alpha',
              order: 2,
            },
            beta: {
              id: 'beta',
              order: 1,
            },
          },
        },
      },
      nodes: {
        [nodeAlpha]: {
          id: nodeAlpha,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.alpha',
            resource: 'aws_s3_bucket',
            name: 'alpha',
          },
          hints: {
            topology: {
              scopeId: 'alpha',
            },
          },
        },
        [nodeBeta]: {
          id: nodeBeta,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.beta',
            resource: 'aws_s3_bucket',
            name: 'beta',
          },
          hints: {
            topology: {
              scopeId: 'beta',
            },
          },
        },
        [nodeZeta]: {
          id: nodeZeta,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.zeta',
            resource: 'aws_s3_bucket',
            name: 'zeta',
          },
          hints: {
            topology: {
              scopeId: 'zeta',
            },
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer();
    const output = toTextContent(renderer.render(adapter));

    const beta = output.indexOf('subgraph cluster_scope_beta');
    const alpha = output.indexOf('subgraph cluster_scope_alpha');
    const zeta = output.indexOf('subgraph cluster_scope_zeta');

    expect(beta).toBeGreaterThan(-1);
    expect(alpha).toBeGreaterThan(-1);
    expect(zeta).toBeGreaterThan(-1);
    expect(beta).toBeLessThan(alpha);
    expect(alpha).toBeLessThan(zeta);
  });

  it('shoud ignore invalid scope refs and break cyclic scope parents', () => {
    const nodeA = asNodeId('node-a');
    const scopeNodeA = asNodeId('scope-node-a');
    const scopeNodeB = asNodeId('scope-node-b');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      hints: {
        topology: {
          scopes: {
            scopeA: {
              id: 'scope_a',
              parentId: 'scope_b',
            },
            scopeB: {
              id: 'scope_b',
              parentId: 'scope_a',
            },
          },
        },
      },
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
          hints: {
            topology: {
              scopeId: 'missing_scope',
            },
          },
        },
        [scopeNodeA]: {
          id: scopeNodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.scope_a',
            resource: 'aws_s3_bucket',
            name: 'scope_a',
          },
          hints: {
            topology: {
              scopeId: 'scope_a',
            },
          },
        },
        [scopeNodeB]: {
          id: scopeNodeB,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.scope_b',
            resource: 'aws_s3_bucket',
            name: 'scope_b',
          },
          hints: {
            topology: {
              scopeId: 'scope_b',
            },
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer();
    const output = toTextContent(renderer.render(adapter));

    expect(output).toContain('subgraph cluster_scope_scope_a');
    expect(output).toContain('subgraph cluster_scope_scope_b');
    expect(output).toContain('"node-a"');
    expect(output).toContain('"scope-node-a"');
    expect(output).toContain('"scope-node-b"');
    expect(output).not.toMatch(
      /subgraph cluster_scope_scope_a \{[^{}]*subgraph cluster_scope_scope_b \{/,
    );
    expect(output).not.toMatch(
      /subgraph cluster_scope_scope_b \{[^{}]*subgraph cluster_scope_scope_a \{/,
    );
  });

  it('shoud ignore invalid topology scope entries', () => {
    const nodeA = asNodeId('node-a');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      hints: {
        topology: {
          scopes: {
            valid: {
              id: 'valid',
              label: 'Valid',
            },
            invalid: {} as unknown as {
              id: string;
            },
          },
        },
      },
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
          hints: {
            topology: {
              scopeId: 'valid',
            },
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer();
    const output = toTextContent(renderer.render(adapter));

    expect(output).toContain('subgraph cluster_scope_valid');
    expect(output).not.toContain('cluster_scope_undefined');
  });

  it('shoud append cardinality suffix only when enabled', () => {
    const nodeMany = asNodeId('node-many');
    const nodeSingle = asNodeId('node-single');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeMany]: {
          id: nodeMany,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.many',
            resource: 'aws_s3_bucket',
            name: 'many',
          },
          hints: {
            cardinality: {
              count: 3,
              mode: 'count',
            },
          },
        },
        [nodeSingle]: {
          id: nodeSingle,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.single',
            resource: 'aws_s3_bucket',
            name: 'single',
          },
          hints: {
            cardinality: {
              count: 1,
              mode: 'count',
            },
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const disabledOutput = toTextContent(new DotRenderer().render(adapter));
    const enabledOutput = toTextContent(
      new DotRenderer({
        layout: { cardinalityLabel: 'suffix' },
      }).render(adapter),
    );

    expect(disabledOutput).toContain('label="aws_s3_bucket.many"');
    expect(disabledOutput).not.toContain('label="aws_s3_bucket.many x3"');
    expect(enabledOutput).toContain('label="aws_s3_bucket.many x3"');
    expect(enabledOutput).not.toContain('label="aws_s3_bucket.single x1"');
  });

  it('shoud no-op cardinality suffix for html and non-string labels', () => {
    const htmlNode = asNodeId('html-node');
    const numericNode = asNodeId('numeric-node');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [htmlNode]: {
          id: htmlNode,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.html',
            resource: 'aws_s3_bucket',
            name: 'html',
          },
          hints: {
            cardinality: {
              count: 3,
            },
          },
          adapter: {
            [DotAdapter.name]: {
              label: '<<table><tr><td>custom</td></tr></table>>',
            },
          },
        },
        [numericNode]: {
          id: numericNode,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.numeric',
            resource: 'aws_s3_bucket',
            name: 'numeric',
          },
          hints: {
            cardinality: {
              count: 3,
            },
          },
          adapter: {
            [DotAdapter.name]: {
              label: 42,
            },
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const output = toTextContent(
      new DotRenderer({
        layout: { cardinalityLabel: 'suffix' },
      }).render(adapter),
    );

    expect(output).toContain('<<table><tr><td>custom</td></tr></table>>');
    expect(output).not.toContain('custom x3');
    expect(output).toContain('label=42');
  });

  it('shoud unquote html labels even when legend and description are empty', () => {
    const htmlNode = asNodeId('node-html');
    const providerNode = asNodeId(
      'tg:1.0.0:provider:provider["registry.terraform.io/hashicorp/aws"]',
    );

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [htmlNode]: {
          id: htmlNode,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.html',
            resource: 'aws_s3_bucket',
            name: 'html',
          },
          adapter: {
            [DotAdapter.name]: {
              label: '<<table><tr><td>\\"hello\\"</td></tr></table>>',
              shape: 'plaintext',
            },
          },
        },
        [providerNode]: {
          id: providerNode,
          terraform: {
            kind: 'provider',
            address: 'provider["registry.terraform.io/hashicorp/aws"]',
            name: 'aws',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer();

    const output = toTextContent(renderer.render(adapter));

    expect(output).toContain(
      'label=<<table><tr><td>"hello"</td></tr></table>>',
    );
    expect(output).not.toContain(
      'label="<<table><tr><td>\\"hello\\"</td></tr></table>>"',
    );
    expect(output).toContain(
      'provider[\\"registry.terraform.io/hashicorp/aws\\"]',
    );
  });

  it('shoud render module and root node labels', () => {
    const moduleNode = asNodeId('module-node');
    const rootNode = asNodeId('root-node');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [moduleNode]: {
          id: moduleNode,
          terraform: {
            kind: 'module',
            address: 'module.app',
            resource: 'module',
            name: 'app',
          },
        },
        [rootNode]: {
          id: rootNode,
          terraform: {
            kind: 'root',
            address: 'root',
            resource: 'root',
            name: 'root',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer();

    const output = toTextContent(renderer.render(adapter));

    expect(output).toContain('label="module.app"');
    expect(output).toContain('label="root.root"');
  });

  it('shoud render data and meta node labels', () => {
    const dataNode = asNodeId('data-node');
    const metaNode = asNodeId('meta-node');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [dataNode]: {
          id: dataNode,
          terraform: {
            kind: 'data',
            address: 'data.aws_iam_policy_document.policy',
            resource: 'aws_iam_policy_document',
            name: 'policy',
          },
        },
        [metaNode]: {
          id: metaNode,
          terraform: {
            kind: 'meta',
            address: 'meta.plan',
            resource: 'meta',
            name: 'plan',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer();

    const output = toTextContent(renderer.render(adapter));

    expect(output).toContain('aws_iam_policy_document.policy');
    expect(output).toContain('meta.plan');
  });

  it('shoud render provider and terraform node labels', () => {
    const providerNode = asNodeId('provider-node');
    const terraformNode = asNodeId('terraform-node');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [providerNode]: {
          id: providerNode,
          terraform: {
            kind: 'provider',
            address: 'provider.aws',
            resource: 'provider',
            name: 'aws',
          },
        },
        [terraformNode]: {
          id: terraformNode,
          terraform: {
            kind: 'terraform',
            address: 'terraform',
            resource: 'terraform',
            name: 'terraform',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer();

    const output = toTextContent(renderer.render(adapter));

    expect(output).toContain('provider.aws');
    expect(output).toContain('terraform');
  });

  it('shoud render local, var, and output node labels', () => {
    const localNode = asNodeId('local-node');
    const varNode = asNodeId('var-node');
    const outputNode = asNodeId('output-node');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [localNode]: {
          id: localNode,
          terraform: {
            kind: 'local',
            address: 'local.value',
            resource: 'local',
            name: 'value',
          },
        },
        [varNode]: {
          id: varNode,
          terraform: {
            kind: 'var',
            address: 'var.bucket',
            resource: 'var',
            name: 'bucket',
          },
        },
        [outputNode]: {
          id: outputNode,
          terraform: {
            kind: 'output',
            address: 'output.plan',
            resource: 'output',
            name: 'plan',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer();

    const output = toTextContent(renderer.render(adapter));

    expect(output).toContain('local.value');
    expect(output).toContain('var.bucket');
    expect(output).toContain('output.plan');
  });

  it('shoud render multi-entry graph descriptions', () => {
    const nodeA = asNodeId('node-a');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {
        Environment: 'test',
        Owner: 'platform',
      },
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer();

    const output = toTextContent(renderer.render(adapter));

    expect(output).toContain('Environment:');
    expect(output).toContain('Owner:');
  });

  it('shoud render legend entries without explicit colour', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const edgeId = asEdgeId('edge-a-b');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
        },
        [nodeB]: {
          id: nodeB,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.b',
            resource: 'aws_s3_bucket',
            name: 'b',
          },
        },
      },
      edges: [
        {
          id: edgeId,
          from: nodeA,
          to: nodeB,
          attributes: {
            legend: {
              title: 'Implicit Relation',
              colour: '#222222',
            },
          },
        },
      ],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer();

    const output = toTextContent(renderer.render(adapter));

    expect(output).toContain('cluster_Legend');
    expect(output).toContain('Implicit Relation');
  });

  it('shoud handle duplicate legend titles', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const nodeC = asNodeId('node-c');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
        },
        [nodeB]: {
          id: nodeB,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.b',
            resource: 'aws_s3_bucket',
            name: 'b',
          },
        },
        [nodeC]: {
          id: nodeC,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.c',
            resource: 'aws_s3_bucket',
            name: 'c',
          },
        },
      },
      edges: [
        {
          id: asEdgeId('edge-a-b'),
          from: nodeA,
          to: nodeB,
          attributes: {
            legend: {
              title: 'Shared Relation',
              colour: '#333333',
            },
          },
        },
        {
          id: asEdgeId('edge-b-c'),
          from: nodeB,
          to: nodeC,
          attributes: {
            legend: {
              title: 'Shared Relation',
              colour: '#444444',
            },
          },
        },
      ],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer();

    const output = toTextContent(renderer.render(adapter));

    expect(output).toContain('cluster_Legend');
    expect(output).toContain('Shared Relation');
  });

  it('shoud render multiple legend entries', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const nodeC = asNodeId('node-c');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
        },
        [nodeB]: {
          id: nodeB,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.b',
            resource: 'aws_s3_bucket',
            name: 'b',
          },
        },
        [nodeC]: {
          id: nodeC,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.c',
            resource: 'aws_s3_bucket',
            name: 'c',
          },
        },
      },
      edges: [
        {
          id: asEdgeId('edge-a-b'),
          from: nodeA,
          to: nodeB,
          attributes: {
            legend: {
              title: 'Relation A',
              colour: '#111111',
            },
          },
        },
        {
          id: asEdgeId('edge-b-c'),
          from: nodeB,
          to: nodeC,
          attributes: {
            legend: {
              title: 'Relation B',
              colour: '#222222',
            },
          },
        },
      ],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer();

    const output = toTextContent(renderer.render(adapter));

    expect(output).toContain('cluster_Legend');
    expect(output).toContain('Relation A');
    expect(output).toContain('Relation B');
  });

  it('shoud include explicit graph spacing options', () => {
    const nodeA = asNodeId('node-a');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer({
      graph: {
        rankdir: 'LR',
        nodesep: 1.1,
        ranksep: 3.3,
        pad: 2,
      },
    });

    const output = toTextContent(renderer.render(adapter));

    expect(output).toContain('nodesep=1.1');
    expect(output).toContain('ranksep=3.3');
    expect(output).toContain('pad=2');
  });

  it('shoud apply default graph options when none are provided', () => {
    const nodeA = asNodeId('node-a');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer();

    const output = toTextContent(renderer.render(adapter));

    expect(output).toContain('rankdir=LR');
    expect(output).toContain('ranksep=2.5');
    expect(output).toContain('nodesep=0.6');
    expect(output).toContain('pad=1');
  });

  it('shoud skip ranks when no nodes are present', () => {
    const nodeA = asNodeId('node-a');
    const missing = asNodeId('missing-node');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const ranked = adapter.addRank([missing], 'same');
    const renderer = new DotRenderer();

    const output = toTextContent(renderer.render(ranked));

    expect(output).not.toContain('rank = same');
    expect(output).not.toContain(missing);
  });

  it('shoud fallback to address when node labels are incomplete', () => {
    const nodeA = asNodeId('node-a');

    const tg = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
          },
        },
      },
      edges: [],
    } as unknown as TgGraph;

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer();

    const output = toTextContent(renderer.render(adapter));

    expect(output).toContain('aws_s3_bucket.a');
  });

  it('shoud support non-same rank modes', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
        },
        [nodeB]: {
          id: nodeB,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.b',
            resource: 'aws_s3_bucket',
            name: 'b',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const ranked = adapter.addRank([nodeA, nodeB], 'min');
    const renderer = new DotRenderer();

    const output = toTextContent(renderer.render(ranked));
    const hasMinRank =
      output.includes('rank = min') || output.includes('rank=min');

    expect(hasMinRank).toBe(true);
  });

  it('shoud use parentModuleName when rendering resource labels', () => {
    const nodeA = asNodeId('node-a');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'module.network.aws_security_group.this',
            resource: 'aws_security_group',
            name: 'this',
            moduleAddress: 'module.network',
            parentModuleName: 'network',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer();

    const output = toTextContent(renderer.render(adapter));

    expect(output).toContain('label="aws_security_group.network"');
    expect(output).not.toContain('label="aws_security_group.this"');
  });

  it('shoud set nodesep and ranksep defaults for TB rankdir when not provided', () => {
    const nodeA = asNodeId('node-a');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer({
      graph: { rankdir: 'TB' },
    });

    const output = toTextContent(renderer.render(adapter));

    expect(output).toContain('rankdir=TB');
    expect(output).toContain('nodesep=2.5');
    expect(output).toContain('ranksep=0.6');
  });

  it('shoud keep explicit nodesep and ranksep when provided with TB rankdir', () => {
    const nodeA = asNodeId('node-a');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer({
      graph: {
        rankdir: 'TB',
        nodesep: 9.9,
        ranksep: 8.8,
      },
    });

    const output = toTextContent(renderer.render(adapter));

    expect(output).toContain('rankdir=TB');
    expect(output).toContain('nodesep=9.9');
    expect(output).toContain('ranksep=8.8');
  });
});

describe('DotRenderer.buildNodeLabel', () => {
  it('shoud prefer parentModuleName for resources', () => {
    const renderer = new DotRenderer();
    const subject = renderer as unknown as {
      buildNodeLabel: (node: TgNode) => string;
    };

    const node: TgNode = {
      id: asNodeId('node-a'),
      terraform: {
        kind: 'resource',
        address: 'module.network.aws_security_group.this',
        resource: 'aws_security_group',
        name: 'this',
        parentModuleName: 'network',
      },
    };

    expect(subject.buildNodeLabel(node)).toBe('aws_security_group.network');
  });

  it('shoud ignore parentModuleName for modules', () => {
    const renderer = new DotRenderer();
    const subject = renderer as unknown as {
      buildNodeLabel: (node: TgNode) => string;
    };

    const node: TgNode = {
      id: asNodeId('module-node'),
      terraform: {
        kind: 'module',
        address: 'module.app',
        resource: 'module',
        name: 'app',
        parentModuleName: 'parent',
      },
    };

    expect(subject.buildNodeLabel(node)).toBe('module.app');
  });

  it('shoud append label endings when present', () => {
    const renderer = new DotRenderer();
    const subject = renderer as unknown as {
      buildNodeLabel: (node: TgNode) => string;
    };

    const node: TgNode = {
      id: asNodeId('node-b'),
      terraform: {
        kind: 'resource',
        address: 'aws_s3_bucket.bucket',
        resource: 'aws_s3_bucket',
        name: 'bucket',
      },
      hints: {
        label: {
          end: 'id',
        },
      },
    };

    expect(subject.buildNodeLabel(node)).toBe('aws_s3_bucket.bucket.id');
  });

  it('shoud fall back to name only when resource is missing', () => {
    const renderer = new DotRenderer();
    const subject = renderer as unknown as {
      buildNodeLabel: (node: TgNode) => string;
    };

    const node: TgNode = {
      id: asNodeId('node-c'),
      terraform: {
        kind: 'resource',
        address: 'aws_s3_bucket.bucket',
        resource: '',
        name: 'bucket',
      },
    };

    expect(subject.buildNodeLabel(node)).toBe('bucket');
  });

  it('shoud fall back to resource only when name is missing', () => {
    const renderer = new DotRenderer();
    const subject = renderer as unknown as {
      buildNodeLabel: (node: TgNode) => string;
    };

    const node: TgNode = {
      id: asNodeId('node-d'),
      terraform: {
        kind: 'resource',
        address: 'aws_s3_bucket.bucket',
        resource: 'aws_s3_bucket',
        name: '',
      },
    };

    expect(subject.buildNodeLabel(node)).toBe('aws_s3_bucket');
  });

  it('shoud fall back to node id when terraform data is missing', () => {
    const renderer = new DotRenderer();
    const subject = renderer as unknown as {
      buildNodeLabel: (node: TgNode) => string;
    };

    const node = {
      id: asNodeId('node-e'),
    } as TgNode;

    expect(subject.buildNodeLabel(node)).toBe('node-e');
  });
});

describe('DotRenderer.applyLegend', () => {
  it('shoud return output unchanged when no graph block is present', () => {
    const renderer = new DotRenderer();
    const subject = renderer as unknown as {
      applyLegend: (output: string, tg: TgGraph) => string;
    };

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {
        Owner: 'platform',
      },
      nodes: {},
      edges: [],
    };

    const output = 'digraph';

    expect(subject.applyLegend(output, tg)).toBe(output);
  });

  it('shoud include description-only legend entries', () => {
    const renderer = new DotRenderer();
    const subject = renderer as unknown as {
      applyLegend: (output: string, tg: TgGraph) => string;
    };

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {
        Owner: 'platform',
      },
      nodes: {},
      edges: [],
    };

    const output = 'digraph { }';
    const next = subject.applyLegend(output, tg);

    expect(next).toContain('cluster_Legend');
    expect(next).toContain('Owner:');
  });

  it('shoud strip quoted html labels with whitespace padding', () => {
    const renderer = new DotRenderer();
    const subject = renderer as unknown as {
      applyLegend: (output: string, tg: TgGraph) => string;
    };

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {
        Environment: 'test',
      },
      nodes: {},
      edges: [],
    };

    const output = `digraph { "node-html" [label="
  <<table><tr><td>\\\"hello\\\"</td></tr></table>>
  "]; }`;
    const next = subject.applyLegend(output, tg);

    expect(next).toContain('label=<<table><tr><td>"hello"</td></tr></table>>');
    expect(next).not.toContain(
      'label="\n  <<table><tr><td>\\"hello\\"</td></tr></table>>\n  "',
    );
  });

  it('shoud preserve escaped quotes in non-label sections', () => {
    const renderer = new DotRenderer();
    const subject = renderer as unknown as {
      applyLegend: (output: string, tg: TgGraph) => string;
    };

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {
        Environment: 'test',
      },
      nodes: {},
      edges: [],
    };

    const output =
      'digraph { "tg:1.0.0:provider:provider[\\"registry.terraform.io/hashicorp/aws\\"]" [label="provider"]; }';
    const next = subject.applyLegend(output, tg);

    expect(next).toContain(
      'provider[\\"registry.terraform.io/hashicorp/aws\\"]',
    );
  });
});

describe('DotRenderer.applyRanks', () => {
  it('shoud return output unchanged when closing brace is missing', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
        },
        [nodeB]: {
          id: nodeB,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.b',
            resource: 'aws_s3_bucket',
            name: 'b',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const ranked = adapter.addRank([nodeA, nodeB], 'same');
    const renderer = new DotRenderer();
    const subject = renderer as unknown as {
      applyRanks: (output: string, adapter: DotAdapter) => string;
    };

    const output = 'digraph {';

    expect(subject.applyRanks(output, ranked)).toBe(output);
  });

  it('shoud escape quoted node ids when writing rank blocks', () => {
    const nodeA = asNodeId('node-"a"');
    const nodeB = asNodeId('node-b');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
        },
        [nodeB]: {
          id: nodeB,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.b',
            resource: 'aws_s3_bucket',
            name: 'b',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const ranked = adapter.addRank([nodeA, nodeB], 'same');
    const renderer = new DotRenderer();
    const subject = renderer as unknown as {
      applyRanks: (output: string, adapter: DotAdapter) => string;
    };

    const output = 'digraph { }';
    const next = subject.applyRanks(output, ranked);

    expect(next).toContain('"node-\\"a\\"" "node-b"');
  });
});

describe('DotRenderer.scopeParentCreatesCycle', () => {
  it('shoud return false when parent id is empty', () => {
    const renderer = new DotRenderer();
    const subject = renderer as unknown as {
      scopeParentCreatesCycle: (
        scopeId: string,
        parentId: string,
        scopesById: Map<string, { id: string; parentId?: string }>,
      ) => boolean;
    };

    expect(subject.scopeParentCreatesCycle('scope-a', '', new Map())).toBe(
      false,
    );
  });
});

describe('DotRenderer.resolveGraphOptions', () => {
  it('shoud merge defaults with provided graph options', () => {
    type DotGraphAttributes = {
      rankdir?: 'TB' | 'BT' | 'LR' | 'RL';
      ranksep?: number;
      nodesep?: number;
      pad?: number;
    } & Record<string, string | number | boolean | undefined>;

    const subject = DotRenderer as unknown as {
      resolveGraphOptions: (input?: DotGraphAttributes) => DotGraphAttributes;
    };

    const resolved = subject.resolveGraphOptions({ rankdir: 'LR', pad: 3 });

    expect(resolved.rankdir).toBe('LR');
    expect(resolved.pad).toBe(3);
    expect(resolved.nodesep).toBe(0.6);
    expect(resolved.ranksep).toBe(2.5);
  });
});

describe('DotRenderer.applyLegend (empty)', () => {
  it('shoud return output unchanged when no legends or description exist', () => {
    const renderer = new DotRenderer();
    const subject = renderer as unknown as {
      applyLegend: (output: string, tg: TgGraph) => string;
    };

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {},
      edges: [],
    };

    const output = 'digraph { }';

    expect(subject.applyLegend(output, tg)).toBe(output);
  });
});

describe('DotRenderer.applyRanks (empty ranks)', () => {
  it('shoud return output unchanged when no ranks are defined', () => {
    const adapter = new DotAdapter(new DirectedGraph());
    const renderer = new DotRenderer();
    const subject = renderer as unknown as {
      applyRanks: (output: string, adapter: DotAdapter) => string;
    };

    const output = 'digraph { }';

    expect(subject.applyRanks(output, adapter)).toBe(output);
  });

  it('shoud return output unchanged when ranks collapse to single nodes', () => {
    const nodeA = asNodeId('node-a');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const ranked = adapter.addRank([nodeA, asNodeId('missing-node')], 'same');

    const renderer = new DotRenderer();
    const subject = renderer as unknown as {
      applyRanks: (output: string, adapter: DotAdapter) => string;
    };

    const output = 'digraph { }';

    expect(subject.applyRanks(output, ranked)).toBe(output);
  });
});

describe('DotRenderer.toDotEdgeAttributes', () => {
  it('shoud apply legend colour to dot edge attributes', () => {
    const renderer = new DotRenderer();
    const subject = renderer as unknown as {
      toDotEdgeAttributes: (
        edge: TgGraph['edges'][number],
      ) => Record<string, unknown>;
    };

    const edge = {
      id: asEdgeId('edge-a-b'),
      from: asNodeId('node-a'),
      to: asNodeId('node-b'),
      attributes: {
        legend: { title: 'Depends On', colour: '#333333' },
        adapter: {
          [DotAdapter.name]: { penwidth: 2 },
        },
      },
    } as TgGraph['edges'][number];

    expect(subject.toDotEdgeAttributes(edge)).toEqual({
      penwidth: 2,
      color: '#333333',
    });
  });

  it('shoud return adapter attributes when no legend is present', () => {
    const renderer = new DotRenderer();
    const subject = renderer as unknown as {
      toDotEdgeAttributes: (
        edge: TgGraph['edges'][number],
      ) => Record<string, unknown>;
    };

    const edge = {
      id: asEdgeId('edge-a-b'),
      from: asNodeId('node-a'),
      to: asNodeId('node-b'),
      attributes: {
        adapter: {
          [DotAdapter.name]: { style: 'dashed' },
        },
      },
    } as TgGraph['edges'][number];

    expect(subject.toDotEdgeAttributes(edge)).toEqual({
      style: 'dashed',
    });
  });
});

describe('DotRenderer.render (graph options)', () => {
  it('shoud apply graph options on render', () => {
    const nodeA = asNodeId('node-a');

    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: {
          id: nodeA,
          terraform: {
            kind: 'resource',
            address: 'aws_s3_bucket.a',
            resource: 'aws_s3_bucket',
            name: 'a',
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new DotRenderer({
      graph: {
        rankdir: 'LR',
        pad: 4,
      },
    });

    const output = toTextContent(renderer.render(adapter));

    expect(output).toContain('rankdir=LR');
    expect(output).toContain('pad=4');
  });
});

describe('DotRenderer.resolveGraphOptions (defaults)', () => {
  it('shoud return defaults when no input is provided', () => {
    type DotGraphAttributes = {
      rankdir?: 'TB' | 'BT' | 'LR' | 'RL';
      ranksep?: number;
      nodesep?: number;
      pad?: number;
    } & Record<string, string | number | boolean | undefined>;

    const subject = DotRenderer as unknown as {
      resolveGraphOptions: (input?: DotGraphAttributes) => DotGraphAttributes;
    };

    const resolved = subject.resolveGraphOptions();

    expect(resolved.rankdir).toBe('LR');
    expect(resolved.ranksep).toBe(2.5);
    expect(resolved.nodesep).toBe(0.6);
    expect(resolved.pad).toBe(1);
  });
});
