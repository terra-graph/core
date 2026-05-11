import { AdapterOperations } from '../../Operations/Operations.js';
import {
  NodeId,
  TgEdgeAttributes,
  TgNodeAttributes,
  TgProjectionRelationshipRelation,
} from '../../TgGraph.js';
import { EdgeRule } from '../Rule.js';
import { EdgeRuleConfig } from '../RuleConfig.js';

type ProjectionRelationshipSemanticOptions = {
  relation: TgProjectionRelationshipRelation;
  overwrite?: boolean;
  enforceDirection?: boolean;
};

type NormalizedProjectionRelationshipSemanticOptions = {
  relation: TgProjectionRelationshipRelation;
  overwrite: boolean;
  enforceDirection: boolean;
};

const hasProjectionSemanticsCandidate = (
  edge: TgEdgeAttributes,
): edge is TgEdgeAttributes & {
  projection: NonNullable<TgEdgeAttributes['projection']> & {
    adjacency?: NonNullable<
      NonNullable<TgEdgeAttributes['projection']>['adjacency']
    >;
    relationship?: NonNullable<
      NonNullable<TgEdgeAttributes['projection']>['relationship']
    >;
  };
} =>
  edge.projection?.adjacency !== undefined ||
  edge.projection?.relationship !== undefined;

const isNonEmptyRelation = (
  value: unknown,
): value is TgProjectionRelationshipRelation =>
  typeof value === 'string' && value.trim().length > 0;

const buildRelationshipAttributes = (
  edge: TgEdgeAttributes,
  relation: TgProjectionRelationshipRelation,
) => ({
  ...edge.projection?.relationship,
  relation,
  source:
    edge.projection?.relationship?.source ?? edge.projection?.adjacency?.source,
  evidence:
    edge.projection?.relationship?.evidence ??
    edge.projection?.adjacency?.evidence,
});

export class ProjectionRelationshipSemantic extends EdgeRule {
  constructor(config: EdgeRuleConfig) {
    if (config.options === undefined) {
      throw new Error(
        `Rule '${ProjectionRelationshipSemantic.name}' requires options in config`,
      );
    }

    const options =
      config.options as Partial<ProjectionRelationshipSemanticOptions>;
    if (!isNonEmptyRelation(options.relation)) {
      throw new Error(
        `Rule '${ProjectionRelationshipSemantic.name}' requires options.relation`,
      );
    }

    if (
      options.overwrite !== undefined &&
      typeof options.overwrite !== 'boolean'
    ) {
      throw new Error(
        `Rule '${ProjectionRelationshipSemantic.name}' options.overwrite must be a boolean when provided`,
      );
    }

    if (
      options.enforceDirection !== undefined &&
      typeof options.enforceDirection !== 'boolean'
    ) {
      throw new Error(
        `Rule '${ProjectionRelationshipSemantic.name}' options.enforceDirection must be a boolean when provided`,
      );
    }

    super({
      ...config,
      options: {
        ...options,
        overwrite: options.overwrite ?? true,
        enforceDirection: options.enforceDirection ?? true,
      },
    });
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

    const options = this.config
      .options as NormalizedProjectionRelationshipSemanticOptions;
    const shouldOverwrite = options.overwrite;
    const shouldEnforceDirection = options.enforceDirection;

    for (const edgeId of updated.outEdges(nodeId)) {
      const targetId = updated.edgeTarget(edgeId);
      const target = updated.getNodeAttributes(targetId);
      if (!target) {
        continue;
      }

      const current = updated.getEdgeAttributes(edgeId);
      if (!this.matchesEdge(nodeId, node, targetId, target, current, updated)) {
        continue;
      }
      if (!hasProjectionSemanticsCandidate(current)) {
        continue;
      }
      const currentRelation = current.projection.relationship?.relation;
      if (!shouldOverwrite && isNonEmptyRelation(currentRelation)) {
        continue;
      }

      updated = updated.setEdge(edgeId, nodeId, targetId, {
        ...current,
        projection: {
          ...current.projection,
          relationship: buildRelationshipAttributes(current, options.relation),
        },
      });
    }

    if (shouldEnforceDirection) {
      for (const edgeId of updated.inEdges(nodeId)) {
        const sourceId = updated.edgeSource(edgeId);
        const source = updated.getNodeAttributes(sourceId);
        if (!source) {
          continue;
        }

        const current = updated.getEdgeAttributes(edgeId);
        if (
          !this.matchesEdge(nodeId, node, sourceId, source, current, updated)
        ) {
          continue;
        }
        if (!hasProjectionSemanticsCandidate(current)) {
          continue;
        }
        const currentRelation = current.projection.relationship?.relation;
        if (
          !shouldOverwrite &&
          isNonEmptyRelation(currentRelation) &&
          currentRelation !== options.relation
        ) {
          continue;
        }

        updated = updated.removeEdge(edgeId).setEdge(edgeId, nodeId, sourceId, {
          ...current,
          projection: {
            ...current.projection,
            relationship: buildRelationshipAttributes(
              current,
              options.relation,
            ),
          },
        });
      }
    }

    return updated;
  }
}

EdgeRule.register(ProjectionRelationshipSemantic);
