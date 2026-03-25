import { DirectedGraph } from 'graphology';
import { DotAdapter } from '../../Adapters/DotAdapter.js';
import { GraphologyAdapter } from '../../Adapters/GraphologyAdapter.js';
import { TG_SCHEMA_VERSION, TgGraph, asNodeId } from '../../TgGraph.js';
import { NodeDotProperties } from './NodeDotProperties.js';

describe('NodeDotProperties.constructor', () => {
  it('shoud require options', () => {
    expect(
      () =>
        new NodeDotProperties({
          node: { nodeId: { eq: 'node-a' } },
        }),
    ).toThrow(`Rule 'NodeDotProperties' requires options in config`);
  });
});

describe('NodeDotProperties.supports', () => {
  it('shoud only support DotAdapter instances', () => {
    const rule = new NodeDotProperties({
      node: { nodeId: { eq: 'node-a' } },
      options: { peripheries: 1 },
    });

    const dotAdapter = new DotAdapter(new DirectedGraph());
    const graphAdapter = new GraphologyAdapter(new DirectedGraph());

    expect(rule.supports(dotAdapter)).toBe(true);
    expect(rule.supports(graphAdapter)).toBe(false);
  });
});

describe('NodeDotProperties.apply', () => {
  it('shoud store dot adapter options for module nodes', () => {
    const moduleId = asNodeId('cluster_module.example');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [moduleId]: { id: moduleId, label: 'module.example' },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(moduleId);
    if (!node) {
      throw new Error('Missing node attributes for module');
    }

    const hook = new NodeDotProperties({
      node: { nodeId: { eq: moduleId.toString() } },
      options: {
        peripheries: 0,
        label: '',
        height: 0,
        width: 0,
      },
    });

    hook.match(moduleId, node, adapter);
    const result = hook.apply(moduleId, node, adapter);

    expect(result.getNodeAttributes(moduleId)).toEqual({
      ...node,
      adapter: {
        [DotAdapter.name]: {
          peripheries: 0,
          label: '',
          height: 0,
          width: 0,
        },
      },
    });
  });

  it('shoud merge dot adapter options with existing adapter values', () => {
    const moduleId = asNodeId('cluster_module.example');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [moduleId]: {
          id: moduleId,
          label: 'module.example',
          adapter: {
            [DotAdapter.name]: {
              color: 'red',
            },
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(moduleId);
    if (!node) {
      throw new Error('Missing node attributes for module');
    }

    const hook = new NodeDotProperties({
      node: { nodeId: { eq: moduleId.toString() } },
      options: {
        style: 'dashed',
      },
    });

    hook.match(moduleId, node, adapter);
    const result = hook.apply(moduleId, node, adapter);

    expect(result.getNodeAttributes(moduleId)).toEqual({
      ...node,
      adapter: {
        [DotAdapter.name]: {
          color: 'red',
          style: 'dashed',
        },
      },
    });
  });

  it('shoud keep graph unchanged when the rule does not match', () => {
    const moduleId = asNodeId('cluster_module.example');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [moduleId]: { id: moduleId, label: 'module.example' },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(moduleId);
    if (!node) {
      throw new Error('Missing node attributes for module');
    }

    const hook = new NodeDotProperties({
      node: { nodeId: { eq: 'different-node' } },
      options: {
        peripheries: 2,
      },
    });

    hook.match(moduleId, node, adapter);
    const result = hook.apply(moduleId, node, adapter);

    expect(result.getNodeAttributes(moduleId)).toEqual(node);
  });

  it('shoud keep graph unchanged when apply is called without a match', () => {
    const moduleId = asNodeId('cluster_module.example');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [moduleId]: { id: moduleId, label: 'module.example' },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(moduleId);
    if (!node) {
      throw new Error('Missing node attributes for module');
    }

    const hook = new NodeDotProperties({
      node: { nodeId: { eq: moduleId.toString() } },
      options: {
        peripheries: 1,
      },
    });

    const result = hook.apply(moduleId, node, adapter);

    expect(result.getNodeAttributes(moduleId)).toEqual(node);
  });

  it('shoud preserve other adapter entries when dot adapter data is missing', () => {
    const moduleId = asNodeId('cluster_module.example');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [moduleId]: {
          id: moduleId,
          label: 'module.example',
          adapter: {
            OtherAdapter: { style: 'bold' },
          },
        },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(moduleId);
    if (!node) {
      throw new Error('Missing node attributes for module');
    }

    const hook = new NodeDotProperties({
      node: { nodeId: { eq: moduleId.toString() } },
      options: {
        peripheries: 2,
      },
    });

    hook.match(moduleId, node, adapter);
    const result = hook.apply(moduleId, node, adapter);

    expect(result.getNodeAttributes(moduleId)).toEqual({
      ...node,
      adapter: {
        OtherAdapter: { style: 'bold' },
        [DotAdapter.name]: {
          peripheries: 2,
        },
      },
    });
  });

  it('shoud fall back to empty properties when options are cleared', () => {
    const moduleId = asNodeId('cluster_module.example');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [moduleId]: { id: moduleId, label: 'module.example' },
      },
      edges: [],
    };

    const adapter = new DotAdapter(new DirectedGraph()).withTgGraph(tg);
    const node = adapter.getNodeAttributes(moduleId);
    if (!node) {
      throw new Error('Missing node attributes for module');
    }

    const hook = new NodeDotProperties({
      node: { nodeId: { eq: moduleId.toString() } },
      options: {
        peripheries: 1,
      },
    });
    (
      hook as unknown as { config: { options?: Record<string, unknown> } }
    ).config.options = undefined;

    hook.match(moduleId, node, adapter);
    const result = hook.apply(moduleId, node, adapter);

    expect(result.getNodeAttributes(moduleId)).toEqual({
      ...node,
      adapter: {
        [DotAdapter.name]: {},
      },
    });
  });
});
