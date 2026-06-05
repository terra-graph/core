import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from '../../Adapters/GraphologyAdapter.js';
import { TG_SCHEMA_VERSION, TgGraph, tgNodeIdFrom } from '../../TgGraph.js';
import { NodeProperties } from './NodeProperties.js';

type NodePropertiesStatics = {
  deepMerge(base: unknown, patch: unknown): unknown;
};

describe('NodeProperties.constructor', () => {
  it('shoud require options', () => {
    expect(
      () =>
        new NodeProperties({
          node: { nodeId: { eq: 'node-a' } },
        }),
    ).toThrow(`Rule 'NodeProperties' requires options in config`);
  });
});

describe('NodeProperties.apply', () => {
  it('shoud set nested properties using references from node attributes', () => {
    const nodeId = tgNodeIdFrom('resource', 'module.identity.aws_iam_role.api');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeId]: {
          id: nodeId,
          terraform: {
            kind: 'resource',
            address: 'module.identity.aws_iam_role.api',
            resource: 'aws_iam_role',
            name: 'api',
            moduleAddress: 'module.identity',
          },
          hints: {
            label: {},
          },
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeId);
    if (!node) {
      throw new Error('Missing node attributes for module role');
    }

    const hook = new NodeProperties({
      node: { nodeId: { eq: String(nodeId) } },
      options: {
        hints: {
          label: {
            end: { from: 'terraform.name' },
          },
        },
      },
    });

    hook.match(nodeId, node, adapter);
    const result = hook.apply(nodeId, node, adapter);

    expect(result.getNodeAttributes(nodeId)).toEqual({
      ...node,
      hints: {
        label: {
          end: 'api',
        },
      },
    });
  });

  it('shoud keep graph unchanged when the rule does not match', () => {
    const nodeId = tgNodeIdFrom('resource', 'aws_iam_role.api');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeId]: {
          id: nodeId,
          terraform: {
            kind: 'resource',
            address: 'aws_iam_role.api',
            resource: 'aws_iam_role',
            name: 'api',
          },
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeId);
    if (!node) {
      throw new Error('Missing node attributes for role');
    }

    const hook = new NodeProperties({
      node: { nodeId: { eq: 'different-node' } },
      options: {
        hints: {
          label: {
            end: { from: 'terraform.name' },
          },
        },
      },
    });

    hook.match(nodeId, node, adapter);
    const result = hook.apply(nodeId, node, adapter);

    expect(result.getNodeAttributes(nodeId)).toEqual(node);
  });

  it('shoud resolve nodeId references', () => {
    const nodeId = tgNodeIdFrom('resource', 'aws_iam_role.api');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeId]: {
          id: nodeId,
          label: 'role',
          terraform: {
            kind: 'resource',
            address: 'aws_iam_role.api',
            resource: 'aws_iam_role',
            name: 'api',
          },
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeId);
    if (!node) {
      throw new Error('Missing node attributes for role');
    }

    const hook = new NodeProperties({
      node: { nodeId: { eq: String(nodeId) } },
      options: {
        hints: {
          label: {
            end: { from: 'nodeId' },
          },
        },
      },
    });

    hook.match(nodeId, node, adapter);
    const result = hook.apply(nodeId, node, adapter);

    expect(result.getNodeAttributes(nodeId)).toEqual({
      ...node,
      hints: {
        label: {
          end: String(nodeId),
        },
      },
    });
  });

  it('shoud resolve arrays of option values', () => {
    const nodeId = tgNodeIdFrom('resource', 'aws_iam_role.api');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeId]: {
          id: nodeId,
          label: 'role',
          terraform: {
            kind: 'resource',
            address: 'aws_iam_role.api',
            resource: 'aws_iam_role',
            name: 'api',
          },
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeId);
    if (!node) {
      throw new Error('Missing node attributes for role');
    }

    const hook = new NodeProperties({
      node: { nodeId: { eq: String(nodeId) } },
      options: {
        tags: [{ from: 'terraform.resource' }, 'static'],
      },
    });

    hook.match(nodeId, node, adapter);
    const result = hook.apply(nodeId, node, adapter);

    expect(result.getNodeAttributes(nodeId)).toEqual({
      ...node,
      tags: ['aws_iam_role', 'static'],
    });
  });

  it('shoud keep graph unchanged when resolved options are undefined', () => {
    const nodeId = tgNodeIdFrom('resource', 'aws_iam_role.api');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeId]: {
          id: nodeId,
          label: 'role',
          terraform: {
            kind: 'resource',
            address: 'aws_iam_role.api',
            resource: 'aws_iam_role',
            name: 'api',
          },
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeId);
    if (!node) {
      throw new Error('Missing node attributes for role');
    }

    const hook = new NodeProperties({
      node: { nodeId: { eq: String(nodeId) } },
      options: { from: 'terraform.missing' },
    });

    hook.match(nodeId, node, adapter);
    const result = hook.apply(nodeId, node, adapter);

    expect(result).toBe(adapter);
    expect(result.getNodeAttributes(nodeId)).toEqual(node);
  });

  it('shoud overwrite scalar values when merging', () => {
    const nodeId = tgNodeIdFrom('resource', 'aws_iam_role.api');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeId]: {
          id: nodeId,
          label: 'role',
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeId);
    if (!node) {
      throw new Error('Missing node attributes for role');
    }

    const hook = new NodeProperties({
      node: { nodeId: { eq: String(nodeId) } },
      options: {
        label: 'override',
      },
    });

    hook.match(nodeId, node, adapter);
    const result = hook.apply(nodeId, node, adapter);

    expect(result.getNodeAttributes(nodeId)).toEqual({
      ...node,
      label: 'override',
    });
  });

  it('shoud ignore empty reference paths', () => {
    const nodeId = tgNodeIdFrom('resource', 'aws_iam_role.api');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeId]: {
          id: nodeId,
          label: 'role',
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeId);
    if (!node) {
      throw new Error('Missing node attributes for role');
    }

    const hook = new NodeProperties({
      node: { nodeId: { eq: String(nodeId) } },
      options: { from: '' },
    });

    hook.match(nodeId, node, adapter);
    const result = hook.apply(nodeId, node, adapter);

    expect(result).toBe(adapter);
    expect(result.getNodeAttributes(nodeId)).toEqual(node);
  });

  it('shoud keep graph unchanged when options resolve to a top-level array', () => {
    const nodeId = tgNodeIdFrom('resource', 'aws_iam_role.api');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeId]: {
          id: nodeId,
          label: 'role',
          terraform: {
            kind: 'resource',
            address: 'aws_iam_role.api',
            resource: 'aws_iam_role',
            name: 'api',
          },
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeId);
    if (!node) {
      throw new Error('Missing node attributes for role');
    }

    const hook = new NodeProperties({
      node: { nodeId: { eq: String(nodeId) } },
      options: [{ from: 'terraform.resource' }] as unknown as Record<
        string,
        unknown
      >,
    });

    hook.match(nodeId, node, adapter);
    const result = hook.apply(nodeId, node, adapter);

    expect(result).toBe(adapter);
    expect(result.getNodeAttributes(nodeId)).toEqual(node);
  });

  it('shoud drop keys whose values resolve to undefined', () => {
    const nodeId = tgNodeIdFrom('resource', 'aws_iam_role.api');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeId]: {
          id: nodeId,
          label: 'role',
          terraform: {
            kind: 'resource',
            address: 'aws_iam_role.api',
            resource: 'aws_iam_role',
            name: 'api',
          },
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeId);
    if (!node) {
      throw new Error('Missing node attributes for role');
    }

    const hook = new NodeProperties({
      node: { nodeId: { eq: String(nodeId) } },
      options: {
        hints: { from: 'terraform.missing' },
      },
    });

    hook.match(nodeId, node, adapter);
    const result = hook.apply(nodeId, node, adapter);

    expect(result).toBe(adapter);
    expect(result.getNodeAttributes(nodeId)).toEqual(node);
  });

  it('shoud treat missing options as an empty patch', () => {
    const nodeId = tgNodeIdFrom('resource', 'aws_iam_role.api');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeId]: {
          id: nodeId,
          label: 'role',
        },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(nodeId);
    if (!node) {
      throw new Error('Missing node attributes for role');
    }

    const hook = new NodeProperties({
      node: { nodeId: { eq: String(nodeId) } },
      options: {
        label: 'override',
      },
    });
    (
      hook as unknown as { config: { options?: Record<string, unknown> } }
    ).config.options = undefined;

    hook.match(nodeId, node, adapter);
    const result = hook.apply(nodeId, node, adapter);

    expect(result).toBe(adapter);
    expect(result.getNodeAttributes(nodeId)).toEqual(node);
  });

  it('should expose scalar merge fallback for helper coverage', () => {
    const helpers = NodeProperties as unknown as NodePropertiesStatics;
    expect(helpers.deepMerge('base', { value: true })).toEqual({
      value: true,
    });
  });
});
