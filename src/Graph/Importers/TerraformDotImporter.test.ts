import { Graph as GraphLibGraph } from 'graphlib';
import dot from 'graphlib-dot';
import { DotAdapter } from '../Adapters/DotAdapter.js';
import { TG_SCHEMA_VERSION, edgeIdFrom, tgNodeIdFrom } from '../TgGraph.js';
import { TerraformDotImporter } from './TerraformDotImporter.js';

const DOT_INPUT = `
digraph {
  "node-a" [label="A" color="red" shape="box"];
  "node-b" [label="B"];
  "node-c";
  "node-a" -> "node-b" [weight=2, style="dashed"];
  "node-b" -> "node-c";
}
`;

const TERRAFORM_ADDRESS_INPUT = `
digraph {
  "cluster_module.module_name" [label="module.module_name"];
  "module.module_name.aws_s3_bucket.bucket" [label="aws_s3_bucket.bucket"];
  "module.module_name.data.aws_iam_policy_document.policy" [label="data.aws_iam_policy_document.policy"];
  "module.module_name.aws_s3_bucket.bucket" -> "module.module_name.data.aws_iam_policy_document.policy";
}
`;

const MIXED_TERRAFORM_INPUT = `
digraph {
  "cluster_module.app";
  "module.parent.module.child";
  "module.parent.module.child.aws_s3_bucket.bucket" [label="aws_s3_bucket.bucket"];
  "aws_instance.example";
  "data.aws_iam_policy_document.policy";
  "local";
  "local.value";
  "var";
  "output.example";
  "meta.plan";
  "root" [label="[root] root (expand)"];
  "terraform";
}
`;

const INDEXED_RESOURCE_INPUT = `
digraph {
  "module.app.aws_instance.web[0]" [label="aws_instance.web[0]"];
}
`;

type TerraformDotImporterInternals = {
  normalizeAddress: (value: string) => string;
  extractModulePrefix: (value: string) => string | undefined;
  resolveAddress: (rawNodeId: string, label?: string) => string;
  resolveNodeId: (
    rawNodeId: string,
    nodeAttributes: Record<string, unknown> | undefined,
    nodeIdMap: Map<string, string>,
  ) => string;
  resolveKind: (address: string) => string;
  describeNode: (
    address: string,
    kind: string,
  ) => { name: string; parentModuleName?: string; parentModuleNodeId?: string };
  parentModuleHelpers: (moduleAddress?: string) => {
    parentModuleName?: string;
    parentModuleNodeId?: string;
  };
};

describe('TerraformDotImporter.fromString', () => {
  it('parses nodes and edges with dot adapter attributes', () => {
    const importer = new TerraformDotImporter();
    const result = importer.fromString(DOT_INPUT);

    const nodeA = tgNodeIdFrom('terraform', 'node-a');
    const nodeB = tgNodeIdFrom('terraform', 'node-b');
    const nodeC = tgNodeIdFrom('terraform', 'node-c');

    expect(result.nodes[nodeA]).toEqual(
      expect.objectContaining({
        id: nodeA,
        terraform: {
          kind: 'terraform',
          address: 'node-a',
          resource: 'terraform',
          name: 'node-a',
          moduleAddress: undefined,
        },
        adapter: {
          [DotAdapter.name]: expect.objectContaining({
            color: 'red',
            shape: 'box',
          }),
        },
      }),
    );

    expect(result.nodes[nodeB]).toEqual(
      expect.objectContaining({
        id: nodeB,
      }),
    );
    expect(result.nodes[nodeB].adapter).toBeUndefined();

    expect(result.nodes[nodeC]).toEqual(
      expect.objectContaining({
        id: nodeC,
      }),
    );

    const edgeAB = edgeIdFrom(nodeA, nodeB);
    const edgeBC = edgeIdFrom(nodeB, nodeC);
    const edgesById = Object.fromEntries(
      result.edges.map((edge) => [edge.id, edge]),
    );

    expect(edgesById[edgeAB]).toEqual(
      expect.objectContaining({
        from: nodeA,
        to: nodeB,
        attributes: {
          adapter: {
            [DotAdapter.name]: expect.objectContaining({
              weight: '2',
              style: 'dashed',
            }),
          },
        },
      }),
    );

    expect(edgesById[edgeBC]).toEqual(
      expect.objectContaining({
        from: nodeB,
        to: nodeC,
        attributes: undefined,
      }),
    );

    expect(result.schemaVersion).toBe(TG_SCHEMA_VERSION);
  });

  it('uses the provided description', () => {
    const importer = new TerraformDotImporter();
    const result = importer.fromString(DOT_INPUT, {
      description: { source: 'terraform' },
    });

    expect(result.description).toEqual({ source: 'terraform' });
  });

  it('creates namespaced terraform-address ids by node kind', () => {
    const importer = new TerraformDotImporter();
    const result = importer.fromString(TERRAFORM_ADDRESS_INPUT);

    const moduleId = tgNodeIdFrom('module', 'module.module_name');
    const resourceId = tgNodeIdFrom(
      'resource',
      'module.module_name.aws_s3_bucket.bucket',
    );
    const dataId = tgNodeIdFrom(
      'data',
      'module.module_name.data.aws_iam_policy_document.policy',
    );
    const edgeId = edgeIdFrom(resourceId, dataId);

    expect(result.nodes[moduleId]).toEqual(
      expect.objectContaining({
        id: moduleId,
        terraform: {
          kind: 'module',
          address: 'module.module_name',
          resource: 'module',
          name: 'module_name',
          moduleAddress: undefined,
        },
      }),
    );
    expect(result.nodes[resourceId]).toEqual(
      expect.objectContaining({
        id: resourceId,
        terraform: {
          kind: 'resource',
          address: 'module.module_name.aws_s3_bucket.bucket',
          resource: 'aws_s3_bucket',
          name: 'bucket',
          moduleAddress: 'module.module_name',
          parentModuleName: 'module_name',
          parentModuleNodeId: moduleId,
        },
      }),
    );
    expect(result.nodes[dataId]).toEqual(
      expect.objectContaining({
        id: dataId,
        terraform: {
          kind: 'data',
          address: 'module.module_name.data.aws_iam_policy_document.policy',
          resource: 'aws_iam_policy_document',
          name: 'policy',
          moduleAddress: 'module.module_name',
          parentModuleName: 'module_name',
          parentModuleNodeId: moduleId,
        },
      }),
    );
    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: edgeId,
          from: resourceId,
          to: dataId,
        }),
      ]),
    );
  });

  it('shoud parse terraform node kinds and module helpers', () => {
    const importer = new TerraformDotImporter();
    const result = importer.fromString(MIXED_TERRAFORM_INPUT);

    const moduleAppId = tgNodeIdFrom('module', 'module.app');
    expect(result.nodes[moduleAppId]).toEqual(
      expect.objectContaining({
        terraform: expect.objectContaining({
          kind: 'module',
          address: 'module.app',
          name: 'app',
        }),
      }),
    );

    const moduleChildId = tgNodeIdFrom('module', 'module.parent.module.child');
    const moduleParentId = tgNodeIdFrom('module', 'module.parent');
    expect(result.nodes[moduleChildId]).toEqual(
      expect.objectContaining({
        terraform: expect.objectContaining({
          kind: 'module',
          moduleAddress: 'module.parent',
          parentModuleName: 'parent',
          parentModuleNodeId: moduleParentId,
          name: 'child',
        }),
      }),
    );

    const resourceId = tgNodeIdFrom(
      'resource',
      'module.parent.module.child.aws_s3_bucket.bucket',
    );
    expect(result.nodes[resourceId]).toEqual(
      expect.objectContaining({
        terraform: expect.objectContaining({
          kind: 'resource',
          resource: 'aws_s3_bucket',
          name: 'bucket',
          parentModuleName: 'child',
          parentModuleNodeId: moduleChildId,
        }),
      }),
    );

    const dataId = tgNodeIdFrom('data', 'data.aws_iam_policy_document.policy');
    const dataNode = result.nodes[dataId];
    if (!dataNode?.terraform) {
      throw new Error('Missing terraform metadata for data node');
    }
    const dataTerraform = dataNode.terraform;
    expect(dataTerraform.kind).toBe('data');
    expect(dataTerraform.resource).toBe('aws_iam_policy_document');
    expect(dataTerraform.name).toBe('policy');

    const localId = tgNodeIdFrom('local', 'local');
    const localValueId = tgNodeIdFrom('local', 'local.value');
    const localNode = result.nodes[localId];
    const localValueNode = result.nodes[localValueId];
    if (!localNode?.terraform || !localValueNode?.terraform) {
      throw new Error('Missing terraform metadata for local nodes');
    }
    const localTerraform = localNode.terraform;
    const localValueTerraform = localValueNode.terraform;
    expect(localTerraform.name).toBe('local');
    expect(localValueTerraform.name).toBe('value');

    const varId = tgNodeIdFrom('var', 'var');
    const outputId = tgNodeIdFrom('output', 'output.example');
    const varNode = result.nodes[varId];
    const outputNode = result.nodes[outputId];
    if (!varNode?.terraform || !outputNode?.terraform) {
      throw new Error('Missing terraform metadata for var/output nodes');
    }
    const varTerraform = varNode.terraform;
    const outputTerraform = outputNode.terraform;
    expect(varTerraform.kind).toBe('var');
    expect(varTerraform.name).toBe('var');
    expect(outputTerraform.kind).toBe('output');
    expect(outputTerraform.name).toBe('example');

    const metaId = tgNodeIdFrom('meta', 'meta.plan');
    const metaNode = result.nodes[metaId];
    if (!metaNode?.terraform) {
      throw new Error('Missing terraform metadata for meta node');
    }
    const metaTerraform = metaNode.terraform;
    expect(metaTerraform.name).toBe('meta.plan');

    const rootId = tgNodeIdFrom('root', 'root');
    const terraformId = tgNodeIdFrom('terraform', 'terraform');
    const rootNode = result.nodes[rootId];
    const terraformNode = result.nodes[terraformId];
    if (!rootNode?.terraform || !terraformNode?.terraform) {
      throw new Error('Missing terraform metadata for root/terraform nodes');
    }
    const rootTerraform = rootNode.terraform;
    const terraformTerraform = terraformNode.terraform;
    expect(rootTerraform.name).toBe('root');
    expect(terraformTerraform.kind).toBe('terraform');
  });

  it('shoud include named edge suffixes when available', () => {
    const graph = new GraphLibGraph({ directed: true, multigraph: true });
    graph.setNode('root');
    graph.setNode('terraform');
    graph.setEdge('root', 'terraform', { weight: '3' }, 'edge-1');

    const readSpy = jest
      .spyOn(dot, 'read')
      .mockReturnValue(graph as unknown as GraphLibGraph);

    try {
      const importer = new TerraformDotImporter();
      const result = importer.fromString('digraph {}');

      const rootId = tgNodeIdFrom('root', 'root');
      const terraformId = tgNodeIdFrom('terraform', 'terraform');
      expect(result.edges).toEqual([
        expect.objectContaining({
          id: edgeIdFrom(rootId, terraformId, 'edge-1'),
          from: rootId,
          to: terraformId,
          attributes: {
            adapter: {
              [DotAdapter.name]: {
                weight: '3',
              },
            },
          },
        }),
      ]);
    } finally {
      readSpy.mockRestore();
    }
  });

  it('shoud keep full terraform addresses on imported node metadata', () => {
    const importer = new TerraformDotImporter();
    const result = importer.fromString(INDEXED_RESOURCE_INPUT);
    const nodeId = tgNodeIdFrom('resource', 'module.app.aws_instance.web[0]');

    expect(result.nodes[nodeId]).toEqual(
      expect.objectContaining({
        terraform: expect.objectContaining({
          address: 'module.app.aws_instance.web[0]',
        }),
      }),
    );
  });

  it('shoud ignore non-string labels and handle empty edge attributes', () => {
    const graph = new GraphLibGraph({ directed: true, multigraph: true });
    graph.setNode('node-1', { label: 42 });
    graph.setNode('node-2');
    graph.setEdge('node-1', 'node-2');

    const readSpy = jest
      .spyOn(dot, 'read')
      .mockReturnValue(graph as unknown as GraphLibGraph);

    try {
      const importer = new TerraformDotImporter();
      const result = importer.fromString('digraph {}');

      const node1Id = tgNodeIdFrom('terraform', 'node-1');
      const node2Id = tgNodeIdFrom('terraform', 'node-2');
      expect(result.nodes[node1Id]).toEqual(
        expect.objectContaining({
          terraform: expect.objectContaining({
            address: 'node-1',
          }),
        }),
      );

      expect(result.edges).toEqual([
        expect.objectContaining({
          id: edgeIdFrom(node1Id, node2Id),
          from: node1Id,
          to: node2Id,
          attributes: undefined,
        }),
      ]);
    } finally {
      readSpy.mockRestore();
    }
  });

  it('shoud cover helper branches for normalization and fallbacks', () => {
    const importer = new TerraformDotImporter();
    const internals = importer as unknown as TerraformDotImporterInternals;

    expect(internals.normalizeAddress('[root] module.app (expand)')).toBe(
      'module.app',
    );
    expect(internals.extractModulePrefix('module.')).toBeUndefined();
    expect(
      internals.extractModulePrefix(
        'module.app.module.child.aws_s3_bucket.bucket',
      ),
    ).toBe('module.app.module.child');
    expect(internals.resolveAddress('module.', 'aws_s3_bucket.bucket')).toBe(
      'module.',
    );
    expect(internals.resolveAddress('module.app', 'module.app')).toBe(
      'module.app',
    );

    const nodeIdMap = new Map<string, string>();
    const resolvedId = internals.resolveNodeId(
      'module.app.aws_s3_bucket.bucket',
      { label: 'aws_s3_bucket.bucket' },
      nodeIdMap,
    );
    expect(resolvedId).toBe(
      tgNodeIdFrom('resource', 'module.app.aws_s3_bucket.bucket'),
    );
    expect(nodeIdMap.get('module.app.aws_s3_bucket.bucket')).toBe(resolvedId);

    const existingId = tgNodeIdFrom('module', 'module.app');
    nodeIdMap.set('module.app', existingId);
    expect(
      internals.resolveNodeId('module.app', { label: 'module.app' }, nodeIdMap),
    ).toBe(existingId);

    const fallbackId = internals.resolveNodeId(
      'unknown',
      { label: 123 },
      new Map<string, string>(),
    );
    expect(fallbackId).toBe(tgNodeIdFrom('terraform', 'unknown'));

    expect(internals.parentModuleHelpers(undefined)).toEqual({});
    expect(internals.parentModuleHelpers('module.app')).toEqual({
      parentModuleName: 'app',
      parentModuleNodeId: tgNodeIdFrom('module', 'module.app'),
    });

    const originalSplit = String.prototype.split as (
      ...args: unknown[]
    ) => string[];
    String.prototype.split = function (...args: unknown[]): string[] {
      const [separator] = args;
      if (this.toString() === 'module.app' && separator === '.') {
        return [];
      }
      return originalSplit.apply(this, args);
    };
    try {
      expect(internals.parentModuleHelpers('module.app')).toEqual({
        parentModuleName: 'module.app',
        parentModuleNodeId: tgNodeIdFrom('module', 'module.app'),
      });
    } finally {
      String.prototype.split = originalSplit as typeof String.prototype.split;
    }

    expect(
      internals.resolveKind('provider["registry.terraform.io/hashicorp/aws"]'),
    ).toBe('provider');

    expect(internals.describeNode('', 'provider').name).toBe('');
    expect(internals.describeNode('', 'meta').name).toBe('');
    expect(internals.describeNode('', 'module').name).toBe('');
  });
});
