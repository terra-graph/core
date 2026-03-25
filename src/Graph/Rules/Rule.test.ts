import { mock } from 'jest-mock-extended';
import { AdapterOperations } from '../Operations/Operations.js';
import { NodeId, TgNodeAttributes, asNodeId } from '../TgGraph.js';
import { BaseRule, EdgeRule, NodeRule } from './Rule.js';
import {
  EdgeRuleConfig,
  NodeRuleConfig,
  RuleConfig,
  SerializedRule,
} from './RuleConfig.js';

describe('BaseRule.fromSerialized', () => {
  class SerializableRule extends BaseRule<RuleConfig> {
    protected get query() {
      return {};
    }

    protected matches(
      _nodeId: NodeId,
      _node: TgNodeAttributes,
      _graph: AdapterOperations,
    ) {
      return false;
    }

    public override apply(
      _nodeId: NodeId,
      _node: TgNodeAttributes,
      graph: AdapterOperations,
    ) {
      return graph;
    }
  }

  BaseRule.register(SerializableRule);

  it('shoud deserialize a registered rule', () => {
    const serialized: SerializedRule = {
      id: 'SerializableRule',
      config: {
        node: { any: true },
        options: { value: 'ok' },
      },
    };
    const rule = BaseRule.fromSerialized(serialized);

    expect(rule).toBeInstanceOf(SerializableRule);
    expect(rule.serialize()).toEqual(serialized);
  });

  it('shoud throw when resolving an unregistered rule', () => {
    expect(() =>
      BaseRule.fromSerialized({
        id: 'UnknownRule',
        config: { node: { any: true } },
      }),
    ).toThrow("Rule 'UnknownRule' is not registered");
  });
});

describe('NodeRule.match and apply', () => {
  class MatchAwareNodeRule extends NodeRule {
    public applyCount = 0;

    public override apply(
      nodeId: NodeId,
      _node: TgNodeAttributes,
      graph: AdapterOperations,
    ) {
      if (!this.wasMatched(nodeId)) {
        return graph;
      }
      this.applyCount += 1;
      return graph;
    }
  }

  it('shoud require node configuration', () => {
    expect(
      () => new MatchAwareNodeRule({} as unknown as NodeRuleConfig),
    ).toThrow("Rule 'MatchAwareNodeRule' requires a node config");
  });

  it('shoud match and apply only after a successful match', () => {
    const nodeA = asNodeId('node.a');
    const nodeB = asNodeId('node.b');
    const graph = mock<AdapterOperations>();
    const rule = new MatchAwareNodeRule({
      node: { nodeId: { eq: String(nodeA) } },
    });

    expect(rule.match(nodeA, { label: 'node.a' }, graph)).toBe(true);
    const afterFirstMatch = rule.apply(nodeA, { label: 'node.a' }, graph);

    expect(rule.match(nodeB, { label: 'node.b' }, graph)).toBe(false);
    const afterSecondMatch = rule.apply(nodeB, { label: 'node.b' }, graph);

    expect(afterFirstMatch).toBe(graph);
    expect(afterSecondMatch).toBe(graph);
    expect(rule.applyCount).toBe(1);
  });
});

describe('EdgeRule.match', () => {
  class MatchAwareEdgeRule extends EdgeRule {
    public applyCount = 0;

    public override apply(
      nodeId: NodeId,
      _node: TgNodeAttributes,
      graph: AdapterOperations,
    ) {
      if (!this.wasMatched(nodeId)) {
        return graph;
      }
      this.applyCount += 1;
      return graph;
    }
  }

  it('shoud require edge configuration', () => {
    expect(
      () => new MatchAwareEdgeRule({} as unknown as EdgeRuleConfig),
    ).toThrow("Rule 'MatchAwareEdgeRule' requires an edge config");
  });

  it('shoud match only from-node for edge rules', () => {
    const from = asNodeId('edge.from');
    const to = asNodeId('edge.to');
    const graph = mock<AdapterOperations>();
    const rule = new MatchAwareEdgeRule({
      edge: {
        from: { nodeId: { eq: String(from) } },
        to: { nodeId: { eq: String(to) } },
      },
    });

    expect(rule.match(from, { label: 'from' }, graph)).toBe(true);
    expect(rule.match(to, { label: 'to' }, graph)).toBe(false);
    expect(rule.applyCount).toBe(0);
  });
});

describe('BaseRule.fromSerialized (invalid inputs)', () => {
  it('shoud throw when serialized rule is undefined', () => {
    expect(() =>
      BaseRule.fromSerialized(undefined as unknown as SerializedRule),
    ).toThrow('Invalid serialized rule');
  });

  it('shoud throw when serialized rule has an empty id', () => {
    expect(() =>
      BaseRule.fromSerialized({
        id: '',
        config: {
          node: { any: true },
          options: { render: () => 'x' },
        },
      } as unknown as SerializedRule),
    ).toThrow('Invalid serialized rule');
  });
});

describe('BaseRule.describe and supports', () => {
  class DescribeRule extends NodeRule {
    public override apply(
      _nodeId: NodeId,
      _node: TgNodeAttributes,
      graph: AdapterOperations,
    ) {
      return graph;
    }
  }

  it('shoud default describe to the rule id', () => {
    const rule = new DescribeRule({ node: { any: true } });
    const nodeId = asNodeId('node.describe');

    expect(rule.describe(nodeId, { label: 'node.describe' })).toBe(
      'DescribeRule',
    );
  });

  it('shoud default supports to true', () => {
    const rule = new DescribeRule({ node: { any: true } });
    const graph = mock<AdapterOperations>();

    expect(rule.supports(graph)).toBe(true);
  });
});
