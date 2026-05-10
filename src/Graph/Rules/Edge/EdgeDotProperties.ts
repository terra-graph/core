import { DotAdapter } from '../../Adapters/DotAdapter.js';
import { AdapterOperations } from '../../Operations/Operations.js';
import { NodeId, TgNodeAttributes } from '../../TgGraph.js';
import { EdgeRule } from '../Rule.js';
import { EdgeRuleConfig } from '../RuleConfig.js';

export class EdgeDotProperties extends EdgeRule {
  constructor(config: EdgeRuleConfig) {
    if (config.options === undefined) {
      throw new Error(
        `Rule '${EdgeDotProperties.name}' requires options in config`,
      );
    }
    super(config);
  }

  public override supports(adapter: AdapterOperations): boolean {
    return adapter instanceof DotAdapter;
  }

  public override apply(
    nodeId: NodeId,
    node: TgNodeAttributes,
    graph: AdapterOperations,
  ): AdapterOperations {
    if (!this.wasMatched(nodeId)) {
      return graph;
    }

    let updated = graph;
    if (!this.query.matchSourceNode(nodeId, node, updated)) {
      return updated;
    }

    const adapterKey = DotAdapter.name;
    const properties = this.config.options ?? {};

    const edges = updated.outEdges(nodeId);
    for (const edgeId of edges) {
      const targetId = updated.edgeTarget(edgeId);
      const target = updated.getNodeAttributes(targetId);
      if (!target) {
        continue;
      }

      const current = updated.getEdgeAttributes(edgeId);
      if (!this.matchesEdge(nodeId, node, targetId, target, current, updated)) {
        continue;
      }
      updated = updated.setEdge(edgeId, nodeId, targetId, {
        ...current,
        adapter: {
          ...(current.adapter ?? {}),
          [adapterKey]: {
            ...(current.adapter?.[adapterKey] ?? {}),
            ...properties,
          },
        },
      });
    }

    return updated;
  }
}

EdgeRule.register(EdgeDotProperties);
