import { DirectedGraph } from 'graphology';
import { mock } from 'jest-mock-extended';
import { GraphologyAdapter } from './Adapters/GraphologyAdapter.js';
import { GraphResolver, type PhaseRunnerContext } from './GraphResolver.js';
import { AdapterOperations } from './Operations/Operations.js';
import { RuleModifyError } from './RuleError.js';
import { RemoveNode } from './Rules/Node/RemoveNode.js';
import { NodeRule } from './Rules/Rule.js';
import { TG_SCHEMA_VERSION, TgGraph, asNodeId } from './TgGraph.js';
import { NodeId, TgNodeAttributes } from './TgGraph.js';

describe('GraphResolver.resolve', () => {
  const createGraph = (): TgGraph => {
    const a = asNodeId('resolver.node-a');
    const b = asNodeId('resolver.node-b');
    return {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [a]: { id: a, label: 'resolver.node-a' },
        [b]: { id: b, label: 'resolver.node-b' },
      },
      edges: [],
    };
  };

  class CountingRule extends NodeRule {
    public applyCalls = 0;

    public override apply(
      nodeId: NodeId,
      _node: TgNodeAttributes,
      graph: AdapterOperations,
    ) {
      if (!this.wasMatched(nodeId)) {
        return graph;
      }
      this.applyCalls += 1;
      return graph;
    }
  }

  class ThrowingMatchRule extends NodeRule {
    public override apply(
      _nodeId: NodeId,
      _node: TgNodeAttributes,
      graph: AdapterOperations,
    ) {
      return graph;
    }

    protected override matches(
      _nodeId: NodeId,
      _node: TgNodeAttributes,
      _graph: AdapterOperations,
    ): boolean {
      throw new Error('match failed');
    }
  }

  class ThrowingApplyRule extends NodeRule {
    public throwCalls = 0;
    public override apply(
      nodeId: NodeId,
      _node: TgNodeAttributes,
      _graph: AdapterOperations,
    ): AdapterOperations {
      this.throwCalls += 1;
      throw new Error(`apply failed on ${nodeId}`);
    }
  }

  class UnsupportedApplyRule extends NodeRule {
    public applyCalls = 0;

    public override supports(): boolean {
      return false;
    }

    public override apply(
      _nodeId: NodeId,
      _node: TgNodeAttributes,
      _graph: AdapterOperations,
    ) {
      this.applyCalls += 1;
      return _graph;
    }
  }

  it('shoud initialize the adapter and skip processing when there are no rules', () => {
    const resolver = new GraphResolver(
      new GraphologyAdapter(new DirectedGraph()),
      mock<PhaseRunnerContext>(),
    );
    const input = createGraph();

    const result = resolver.resolve({
      graph: input,
      phases: [],
    });
    const tg = result.toTgGraph();
    const expectedNodeIds = Object.keys(input.nodes);

    expect(tg.edges).toHaveLength(0);
    expect(Object.keys(tg.nodes)).toHaveLength(expectedNodeIds.length);
    for (const nodeId of expectedNodeIds) {
      expect(tg.nodes[nodeId]).toEqual({
        id: nodeId,
      });
    }
  });

  it('shoud treat missing phases as an empty plan', () => {
    const resolver = new GraphResolver(
      new GraphologyAdapter(new DirectedGraph()),
    );
    const input = createGraph();

    const result = resolver.resolve({
      graph: input,
      phases: undefined as unknown as [],
    });

    expect(result.nodeIds()).toHaveLength(2);
  });

  it('shoud default logPrefix when calling modify directly', () => {
    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(
      createGraph(),
    );
    const resolver = new GraphResolver(adapter);

    const result = (
      resolver as unknown as {
        modify: (
          adapter: AdapterOperations,
          rules: NodeRule[],
          context?: PhaseRunnerContext,
          logPrefix?: string,
        ) => AdapterOperations;
      }
    ).modify(adapter, [], undefined);

    expect(result).toBe(adapter);
  });

  it('shoud apply rules across all phases and all matching nodes', () => {
    const adapter = new GraphologyAdapter(new DirectedGraph());
    const resolver = new GraphResolver(adapter);
    const input = createGraph();

    const phaseOne = new CountingRule({
      node: { any: true },
    });
    const phaseTwo = new CountingRule({
      node: { any: true },
    });

    const result = resolver.resolve({
      graph: input,
      phases: [[phaseOne], [phaseTwo]],
    });

    expect(result.nodeIds()).toHaveLength(2);
    expect(phaseOne.applyCalls).toBe(2);
    expect(phaseTwo.applyCalls).toBe(2);
  });

  it('shoud skip applying a node when the node fails rule matching', () => {
    const adapter = new GraphologyAdapter(new DirectedGraph());
    const resolver = new GraphResolver(adapter);
    const input = createGraph();
    const matcher = new CountingRule({
      node: { nodeId: { eq: String(asNodeId('resolver.node-a')) } },
    });

    const result = resolver.resolve({
      graph: input,
      phases: [[matcher]],
    });

    expect(result.nodeIds()).toHaveLength(2);
    expect(matcher.applyCalls).toBe(1);
  });

  it('shoud report phase progress through the logger', () => {
    const logger = jest.fn();
    const resolver = new GraphResolver(
      new GraphologyAdapter(new DirectedGraph()),
      { logger },
    );
    const input = createGraph();

    const result = resolver.resolve({
      graph: input,
      phases: [
        [new RemoveNode({ node: { any: true } })],
        [new RemoveNode({ node: { any: true } })],
      ],
    });

    expect(logger).toHaveBeenCalledWith('applying phase-1: 2 nodes');
    expect(logger).toHaveBeenCalledWith('applying phase-2: 0 nodes');
    expect(result.nodeIds()).toHaveLength(0);
  });

  it('shoud skip match logging when describe is missing', () => {
    const logger = jest.fn();
    const resolver = new GraphResolver(
      new GraphologyAdapter(new DirectedGraph()),
      { logger },
    );
    const input = createGraph();

    class SilentRule extends NodeRule {
      public override apply(
        _nodeId: NodeId,
        _node: TgNodeAttributes,
        graph: AdapterOperations,
      ) {
        return graph;
      }
    }

    const rule = new SilentRule({ node: { any: true } });
    (rule as unknown as { describe?: undefined }).describe = undefined;

    resolver.resolve({
      graph: input,
      phases: [[rule]],
    });

    expect(logger).toHaveBeenCalledWith('applying phase-1: 2 nodes');
    expect(logger).toHaveBeenCalledTimes(1);
  });

  it('shoud skip rules when supports returns false', () => {
    const resolver = new GraphResolver(
      new GraphologyAdapter(new DirectedGraph()),
    );
    const input = createGraph();
    const rule = new UnsupportedApplyRule({
      node: { any: true },
    });

    const result = resolver.resolve({
      graph: input,
      phases: [[rule]],
    });

    expect(result.nodeIds()).toHaveLength(2);
    expect(rule.applyCalls).toBe(0);
  });

  it('shoud stop applying later rules for a node after removeNode', () => {
    const resolver = new GraphResolver(
      new GraphologyAdapter(new DirectedGraph()),
    );
    const input = createGraph();
    const throwingRule = new ThrowingApplyRule({
      node: { any: true },
    });

    const result = resolver.resolve({
      graph: input,
      phases: [[new RemoveNode({ node: { any: true } }), throwingRule]],
    });

    expect(result.nodeIds()).toHaveLength(0);
    expect(throwingRule.throwCalls).toBe(0);
  });

  it('shoud wrap match failures when no error handler is provided', () => {
    const resolver = new GraphResolver(
      new GraphologyAdapter(new DirectedGraph()),
    );
    const input = createGraph();
    const rule = new ThrowingMatchRule({
      node: { any: true },
    });

    expect(() =>
      resolver.resolve({
        graph: input,
        phases: [[rule]],
      }),
    ).toThrow('Rule was unable to match node');
  });

  it('shoud wrap apply failures when no error handler is provided', () => {
    const resolver = new GraphResolver(
      new GraphologyAdapter(new DirectedGraph()),
    );
    const input = createGraph();
    const rule = new ThrowingApplyRule({
      node: { any: true },
    });

    expect(() =>
      resolver.resolve({
        graph: input,
        phases: [[rule]],
      }),
    ).toThrow('Rule was unable to modify node');
  });

  it('shoud pass RuleMatch errors through without wrapping when already a RuleModifyError', () => {
    class DirectModifyMatchRule extends NodeRule {
      public override apply(
        _nodeId: NodeId,
        _node: TgNodeAttributes,
        graph: AdapterOperations,
      ) {
        return graph;
      }

      protected override matches(
        nodeId: NodeId,
        node: TgNodeAttributes,
        _graph: AdapterOperations,
      ): boolean {
        throw new RuleModifyError(
          { cause: new Error('inner match failure') },
          {
            nodeId: nodeId as string,
            nodeAttributes: node,
          },
        );
      }
    }

    const errorHandler = jest.fn();
    const resolver = new GraphResolver(
      new GraphologyAdapter(new DirectedGraph()),
      {
        errorHandler,
      },
    );
    const input = createGraph();

    const result = resolver.resolve({
      graph: input,
      phases: [[new DirectModifyMatchRule({ node: { any: true } })]],
    });

    expect(result.nodeIds()).toHaveLength(2);
    expect(errorHandler).toHaveBeenCalledTimes(2);
    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Rule was unable to modify node'),
      }),
    );
  });

  it('shoud delegate rule errors to the provided error handler', () => {
    const errorHandler = jest.fn();
    const resolver = new GraphResolver(
      new GraphologyAdapter(new DirectedGraph()),
      {
        errorHandler,
      },
    );
    const input = createGraph();

    const matchErrorRule = new ThrowingMatchRule({
      node: { any: true },
    });
    const applyErrorRule = new ThrowingApplyRule({
      node: { any: true },
    });

    const result = resolver.resolve({
      graph: input,
      phases: [[matchErrorRule], [applyErrorRule]],
    });

    expect(errorHandler).toHaveBeenCalledTimes(4);
    expect(result.nodeIds()).toHaveLength(2);
  });

  it('shoud continue execution after handler-covered match and apply errors', () => {
    const errorHandler = jest.fn();
    const resolver = new GraphResolver(
      new GraphologyAdapter(new DirectedGraph()),
      {
        errorHandler,
      },
    );
    const input = createGraph();

    const matchErrorRule = new ThrowingMatchRule({
      node: { any: true },
    });
    const recoverRule = new RemoveNode({
      node: { any: true },
    });
    const applyErrorRule = new ThrowingApplyRule({
      node: { any: true },
    });

    const result = resolver.resolve({
      graph: input,
      phases: [[matchErrorRule], [applyErrorRule, recoverRule]],
    });

    expect(errorHandler).toHaveBeenCalledTimes(4);
    expect(result.nodeIds()).toHaveLength(0);
  });
});
