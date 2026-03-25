import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from '../../Adapters/GraphologyAdapter.js';
import { GraphResolver } from '../../GraphResolver.js';
import {
  NodeId,
  TG_SCHEMA_VERSION,
  TgEdge,
  TgGraph,
  TgNode,
  TgNodeAttributes,
  asEdgeId,
  asNodeId,
} from '../../TgGraph.js';
import { RemoveLeafChain } from './RemoveLeafChain.js';

const IAM_ORPHAN_SCOPE = {
  or: [
    {
      and: [
        { attr: { key: 'terraform.kind', eq: 'resource' } },
        {
          attr: {
            key: 'terraform.resource',
            in: [
              'aws_iam_role',
              'aws_iam_role_policy_attachment',
              'aws_iam_policy_attachment',
              'aws_iam_policy',
              'aws_iam_role_policy',
            ],
          },
        },
      ],
    },
    {
      and: [
        { attr: { key: 'terraform.kind', eq: 'data' } },
        {
          attr: {
            key: 'terraform.resource',
            in: ['aws_iam_policy_document', 'aws_iam_policy'],
          },
        },
      ],
    },
  ],
};

const buildNode = (
  id: string,
  kind: 'resource' | 'data',
  resource: string,
): TgNode => ({
  id: asNodeId(id),
  label: id,
  terraform: {
    kind,
    address: id,
    resource,
    name: id,
  },
});

const buildEdge = (id: string, from: string, to: string): TgEdge => ({
  id: asEdgeId(id),
  from: asNodeId(from),
  to: asNodeId(to),
  attributes: {},
});

const applyRule = (graph: TgGraph) => {
  const adapter = new GraphologyAdapter(new DirectedGraph());
  const resolver = new GraphResolver(adapter);

  return resolver.resolve({
    graph,
    phases: [[new RemoveLeafChain({ node: IAM_ORPHAN_SCOPE })]],
  });
};

describe('RemoveLeafChain.apply', () => {
  it('shoud remove the full chain when an aws_iam_role is a leaf', () => {
    const result = applyRule({
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        data: buildNode('data', 'data', 'aws_iam_policy_document'),
        rolePolicy: buildNode('rolePolicy', 'resource', 'aws_iam_role_policy'),
        attachment: buildNode(
          'attachment',
          'resource',
          'aws_iam_role_policy_attachment',
        ),
        role: buildNode('role', 'resource', 'aws_iam_role'),
      },
      edges: [
        buildEdge('data-rolePolicy', 'data', 'rolePolicy'),
        buildEdge('rolePolicy-attachment', 'rolePolicy', 'attachment'),
        buildEdge('attachment-role', 'attachment', 'role'),
      ],
    });

    expect(result.getNodeAttributes(asNodeId('data'))).toBeUndefined();
    expect(result.getNodeAttributes(asNodeId('rolePolicy'))).toBeUndefined();
    expect(result.getNodeAttributes(asNodeId('attachment'))).toBeUndefined();
    expect(result.getNodeAttributes(asNodeId('role'))).toBeUndefined();
  });

  it('shoud remove the full chain when an attachment is a leaf', () => {
    const result = applyRule({
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        data: buildNode('data', 'data', 'aws_iam_policy_document'),
        policy: buildNode('policy', 'resource', 'aws_iam_policy'),
        role: buildNode('role', 'resource', 'aws_iam_role'),
        attachment: buildNode(
          'attachment',
          'resource',
          'aws_iam_policy_attachment',
        ),
      },
      edges: [
        buildEdge('data-policy', 'data', 'policy'),
        buildEdge('policy-attachment', 'policy', 'attachment'),
        buildEdge('role-attachment', 'role', 'attachment'),
      ],
    });

    expect(result.getNodeAttributes(asNodeId('data'))).toBeUndefined();
    expect(result.getNodeAttributes(asNodeId('policy'))).toBeUndefined();
    expect(result.getNodeAttributes(asNodeId('role'))).toBeUndefined();
    expect(result.getNodeAttributes(asNodeId('attachment'))).toBeUndefined();
  });

  it('shoud remove an orphaned data.aws_iam_policy_document leaf node', () => {
    const result = applyRule({
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        data: buildNode('data', 'data', 'aws_iam_policy_document'),
      },
      edges: [],
    });

    expect(result.getNodeAttributes(asNodeId('data'))).toBeUndefined();
  });

  it('shoud remove an orphaned data.aws_iam_policy leaf node', () => {
    const result = applyRule({
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        data: buildNode('data', 'data', 'aws_iam_policy'),
      },
      edges: [],
    });

    expect(result.getNodeAttributes(asNodeId('data'))).toBeUndefined();
  });

  it('shoud preserve shared IAM nodes that still lead to non-IAM resources', () => {
    const result = applyRule({
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        policy: buildNode('policy', 'resource', 'aws_iam_policy'),
        deadAttachment: buildNode(
          'deadAttachment',
          'resource',
          'aws_iam_policy_attachment',
        ),
        deadRole: buildNode('deadRole', 'resource', 'aws_iam_role'),
        liveAttachment: buildNode(
          'liveAttachment',
          'resource',
          'aws_iam_policy_attachment',
        ),
        liveRole: buildNode('liveRole', 'resource', 'aws_iam_role'),
        lambda: buildNode('lambda', 'resource', 'aws_lambda_function'),
      },
      edges: [
        buildEdge('policy-deadAttachment', 'policy', 'deadAttachment'),
        buildEdge('deadAttachment-deadRole', 'deadAttachment', 'deadRole'),
        buildEdge('policy-liveAttachment', 'policy', 'liveAttachment'),
        buildEdge('liveAttachment-liveRole', 'liveAttachment', 'liveRole'),
        buildEdge('liveRole-lambda', 'liveRole', 'lambda'),
      ],
    });

    expect(
      result.getNodeAttributes(asNodeId('deadAttachment')),
    ).toBeUndefined();
    expect(result.getNodeAttributes(asNodeId('deadRole'))).toBeUndefined();
    expect(result.getNodeAttributes(asNodeId('policy'))).toBeDefined();
    expect(result.getNodeAttributes(asNodeId('liveAttachment'))).toBeDefined();
    expect(result.getNodeAttributes(asNodeId('liveRole'))).toBeDefined();
    expect(result.getNodeAttributes(asNodeId('lambda'))).toBeDefined();
  });

  it('shoud stop chain removal at non-IAM boundaries', () => {
    const result = applyRule({
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        lambda: buildNode('lambda', 'resource', 'aws_lambda_function'),
        attachment: buildNode(
          'attachment',
          'resource',
          'aws_iam_policy_attachment',
        ),
      },
      edges: [buildEdge('lambda-attachment', 'lambda', 'attachment')],
    });

    expect(result.getNodeAttributes(asNodeId('attachment'))).toBeUndefined();
    expect(result.getNodeAttributes(asNodeId('lambda'))).toBeDefined();
  });

  it('shoud iteratively prune newly orphaned predecessors to a fixpoint', () => {
    const result = applyRule({
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        data: buildNode('data', 'data', 'aws_iam_policy_document'),
        policyA: buildNode('policyA', 'resource', 'aws_iam_policy'),
        policyB: buildNode('policyB', 'resource', 'aws_iam_policy'),
        attachment: buildNode(
          'attachment',
          'resource',
          'aws_iam_policy_attachment',
        ),
        role: buildNode('role', 'resource', 'aws_iam_role'),
      },
      edges: [
        buildEdge('data-policyA', 'data', 'policyA'),
        buildEdge('data-policyB', 'data', 'policyB'),
        buildEdge('policyA-attachment', 'policyA', 'attachment'),
        buildEdge('policyB-attachment', 'policyB', 'attachment'),
        buildEdge('attachment-role', 'attachment', 'role'),
      ],
    });

    expect(result.getNodeAttributes(asNodeId('data'))).toBeUndefined();
    expect(result.getNodeAttributes(asNodeId('policyA'))).toBeUndefined();
    expect(result.getNodeAttributes(asNodeId('policyB'))).toBeUndefined();
    expect(result.getNodeAttributes(asNodeId('attachment'))).toBeUndefined();
    expect(result.getNodeAttributes(asNodeId('role'))).toBeUndefined();
  });
});

describe('RemoveLeafChain.apply (direct)', () => {
  it('shoud skip scoped nodes that are not leaf nodes', () => {
    const nodeA = buildNode('node-a', 'resource', 'aws_iam_role');
    const nodeB = buildNode('node-b', 'resource', 'aws_lambda_function');

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA.id]: nodeA,
        [nodeB.id]: nodeB,
      },
      edges: [buildEdge('edge-a-b', 'node-a', 'node-b')],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      graph,
    );
    const node = adapter.getNodeAttributes(asNodeId('node-a'));
    if (!node) {
      throw new Error('Missing node attributes for node-a');
    }

    const rule = new RemoveLeafChain({
      node: { nodeId: { eq: 'node-a' } },
    });

    rule.match(asNodeId('node-a'), node, adapter);
    const result = rule.apply(asNodeId('node-a'), node, adapter);

    expect(result.getNodeAttributes(asNodeId('node-a'))).toBeDefined();
    expect(result.getNodeAttributes(asNodeId('node-b'))).toBeDefined();
  });

  it('shoud avoid removing predecessors when not all successors are removable', () => {
    const nodeA = buildNode('node-a', 'resource', 'aws_iam_role');
    const nodeB = buildNode('node-b', 'resource', 'aws_iam_policy');
    const nodeC = buildNode('node-c', 'resource', 'aws_lambda_function');

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA.id]: nodeA,
        [nodeB.id]: nodeB,
        [nodeC.id]: nodeC,
      },
      edges: [
        buildEdge('edge-a-b', 'node-a', 'node-b'),
        buildEdge('edge-a-c', 'node-a', 'node-c'),
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      graph,
    );
    const node = adapter.getNodeAttributes(asNodeId('node-b'));
    if (!node) {
      throw new Error('Missing node attributes for node-b');
    }

    const rule = new RemoveLeafChain({
      node: { nodeId: { in: ['node-a', 'node-b'] } },
    });

    rule.match(asNodeId('node-b'), node, adapter);
    const result = rule.apply(asNodeId('node-b'), node, adapter);

    expect(result.getNodeAttributes(asNodeId('node-b'))).toBeUndefined();
    expect(result.getNodeAttributes(asNodeId('node-a'))).toBeDefined();
    expect(result.getNodeAttributes(asNodeId('node-c'))).toBeDefined();
  });

  it('shoud only apply once per rule instance', () => {
    const node = buildNode('leaf', 'resource', 'aws_iam_role');

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [node.id]: node,
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      graph,
    );
    const nodeAttributes = adapter.getNodeAttributes(asNodeId('leaf'));
    if (!nodeAttributes) {
      throw new Error('Missing node attributes for leaf');
    }

    const rule = new RemoveLeafChain({ node: { any: true } });

    rule.match(asNodeId('leaf'), nodeAttributes, adapter);
    const first = rule.apply(asNodeId('leaf'), nodeAttributes, adapter);
    const second = rule.apply(asNodeId('leaf'), nodeAttributes, first);

    expect(first.getNodeAttributes(asNodeId('leaf'))).toBeUndefined();
    expect(second).toBe(first);
  });

  it('shoud skip falsy node ids when collecting removable nodes', () => {
    const emptyNode = buildNode('', 'resource', 'aws_iam_role');

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [emptyNode.id]: emptyNode,
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      graph,
    );
    const nodeAttributes = adapter.getNodeAttributes(asNodeId(''));
    if (!nodeAttributes) {
      throw new Error('Missing node attributes for empty id');
    }

    const rule = new RemoveLeafChain({ node: { any: true } });

    rule.match(asNodeId(''), nodeAttributes, adapter);
    const result = rule.apply(asNodeId(''), nodeAttributes, adapter);

    expect(result.getNodeAttributes(asNodeId(''))).toBeDefined();
  });

  it('shoud handle duplicate queue entries when removing leaf chains', () => {
    const nodeA = buildNode('node-a', 'resource', 'aws_iam_role');
    const nodeB = buildNode('node-b', 'resource', 'aws_iam_policy');
    const nodeC = buildNode('node-c', 'resource', 'aws_iam_policy');

    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA.id]: nodeA,
        [nodeB.id]: nodeB,
        [nodeC.id]: nodeC,
      },
      edges: [
        buildEdge('edge-a-b', 'node-a', 'node-b'),
        buildEdge('edge-a-c', 'node-a', 'node-c'),
      ],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      graph,
    );
    const nodeAttributes = adapter.getNodeAttributes(asNodeId('node-b'));
    if (!nodeAttributes) {
      throw new Error('Missing node attributes for node-b');
    }

    const rule = new RemoveLeafChain({ node: { any: true } });

    rule.match(asNodeId('node-b'), nodeAttributes, adapter);
    const result = rule.apply(asNodeId('node-b'), nodeAttributes, adapter);

    expect(result.getNodeAttributes(asNodeId('node-a'))).toBeUndefined();
    expect(result.getNodeAttributes(asNodeId('node-b'))).toBeUndefined();
    expect(result.getNodeAttributes(asNodeId('node-c'))).toBeUndefined();
  });

  it('shoud skip removals when nodes disappear after collection', () => {
    const nodeA = buildNode('node-a', 'resource', 'aws_iam_role');
    const nodeAttributes = nodeA as TgNodeAttributes;
    class FlakyRemovalAdapter {
      public removed = false;
      private callCount = 0;

      public nodeIds(): NodeId[] {
        return [nodeA.id];
      }

      public outEdges(): string[] {
        return [];
      }

      public predecessors(): NodeId[] {
        return [];
      }

      public edgeTarget(): NodeId {
        return nodeA.id;
      }

      public getNodeAttributes(): TgNodeAttributes | undefined {
        this.callCount += 1;
        if (this.callCount > 2) {
          return undefined;
        }
        return nodeAttributes;
      }

      public removeNode(): this {
        this.removed = true;
        return this;
      }
    }

    const adapter = new FlakyRemovalAdapter();

    const rule = new RemoveLeafChain({
      node: { attr: { key: 'label', eq: 'node-a' } },
    });

    rule.match(
      asNodeId('node-a'),
      nodeAttributes,
      adapter as unknown as GraphologyAdapter,
    );
    rule.apply(
      asNodeId('node-a'),
      nodeAttributes,
      adapter as unknown as GraphologyAdapter,
    );

    expect(adapter.removed).toBe(false);
  });

  it('shoud skip nodes that fall out of scope during processing', () => {
    const nodeA = buildNode('node-a', 'resource', 'aws_iam_role');
    const nodeAttributes = nodeA as TgNodeAttributes;

    class FlakyScopeAdapter {
      public removed = false;
      private callCount = 0;

      public nodeIds(): NodeId[] {
        return [nodeA.id];
      }

      public outEdges(): string[] {
        return [];
      }

      public predecessors(): NodeId[] {
        return [];
      }

      public edgeTarget(): NodeId {
        return nodeA.id;
      }

      public getNodeAttributes(): TgNodeAttributes | undefined {
        this.callCount += 1;
        if (this.callCount > 1) {
          return undefined;
        }
        return nodeAttributes;
      }

      public removeNode(): this {
        this.removed = true;
        return this;
      }
    }

    const adapter = new FlakyScopeAdapter();

    const rule = new RemoveLeafChain({
      node: { attr: { key: 'label', eq: 'node-a' } },
    });

    rule.match(
      asNodeId('node-a'),
      nodeAttributes,
      adapter as unknown as GraphologyAdapter,
    );
    rule.apply(
      asNodeId('node-a'),
      nodeAttributes,
      adapter as unknown as GraphologyAdapter,
    );

    expect(adapter.removed).toBe(false);
  });
});
