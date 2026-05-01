import { AdapterOperations } from '../../Operations/Operations.js';
import {
  DefaultEdgeSemanticRoles,
  NodeId,
  TgEdgeSemanticHint,
  TgNodeAttributes,
} from '../../TgGraph.js';
import { EdgeRule } from '../Rule.js';
import { EdgeRuleConfig } from '../RuleConfig.js';

type EdgeSemanticOptions = {
  semantic: TgEdgeSemanticHint;
  overwrite?: boolean;
  enforceDirection?: boolean;
};

const isNonEmptySemanticHint = (
  value: unknown,
): value is TgEdgeSemanticHint => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const semantic = (value as Partial<TgEdgeSemanticHint>).semantic;
  const role = (value as Partial<TgEdgeSemanticHint>).role;

  return (
    typeof semantic === 'string' &&
    semantic.trim().length > 0 &&
    typeof role === 'string' &&
    Object.values(DefaultEdgeSemanticRoles).includes(
      role as (typeof DefaultEdgeSemanticRoles)[keyof typeof DefaultEdgeSemanticRoles],
    )
  );
};

export class EdgeSemantic extends EdgeRule {
  constructor(config: EdgeRuleConfig) {
    if (config.options === undefined) {
      throw new Error(`Rule '${EdgeSemantic.name}' requires options in config`);
    }

    const options = config.options as Partial<EdgeSemanticOptions>;
    if (!isNonEmptySemanticHint(options.semantic)) {
      throw new Error(`Rule '${EdgeSemantic.name}' requires options.semantic`);
    }

    if (
      options.overwrite !== undefined &&
      typeof options.overwrite !== 'boolean'
    ) {
      throw new Error(
        `Rule '${EdgeSemantic.name}' options.overwrite must be a boolean when provided`,
      );
    }

    if (
      options.enforceDirection !== undefined &&
      typeof options.enforceDirection !== 'boolean'
    ) {
      throw new Error(
        `Rule '${EdgeSemantic.name}' options.enforceDirection must be a boolean when provided`,
      );
    }

    super(config);
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
    const { from, to } = this.query;
    if (!from.match(nodeId, node, updated)) {
      return updated;
    }

    const options = this.config.options as EdgeSemanticOptions;
    const shouldOverwrite = options.overwrite ?? false;
    const shouldEnforceDirection = options.enforceDirection ?? false;
    const edges = updated.outEdges(nodeId);

    for (const edgeId of edges) {
      const targetId = updated.edgeTarget(edgeId);
      const target = updated.getNodeAttributes(targetId);
      if (!target || !to.match(targetId, target, updated)) {
        continue;
      }

      const current = updated.getEdgeAttributes(edgeId);
      if (!shouldOverwrite && current.hints?.semantic !== undefined) {
        continue;
      }

      updated = updated.setEdge(edgeId, nodeId, targetId, {
        ...current,
        hints: {
          ...current.hints,
          semantic: options.semantic,
        },
      });
    }

    if (!shouldEnforceDirection) {
      return updated;
    }

    const inboundEdgeIds = updated.inEdges(nodeId);
    for (const edgeId of inboundEdgeIds) {
      const sourceId = updated.edgeSource(edgeId);
      const source = updated.getNodeAttributes(sourceId);
      if (!source || !to.match(sourceId, source, updated)) {
        continue;
      }

      const current = updated.getEdgeAttributes(edgeId);
      if (
        !shouldOverwrite &&
        current.hints?.semantic !== undefined &&
        (current.hints.semantic.semantic !== options.semantic.semantic ||
          current.hints.semantic.role !== options.semantic.role)
      ) {
        continue;
      }

      updated = updated.removeEdge(edgeId).setEdge(edgeId, nodeId, sourceId, {
        ...current,
        hints: {
          ...current.hints,
          semantic: options.semantic,
        },
      });
    }

    return updated;
  }
}

EdgeRule.register(EdgeSemantic);
