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

const hasProjectionRelationship = (
  edge: TgEdgeAttributes,
): edge is TgEdgeAttributes & {
  projection: NonNullable<TgEdgeAttributes['projection']> & {
    relationship: NonNullable<
      NonNullable<TgEdgeAttributes['projection']>['relationship']
    >;
  };
} => edge.projection?.relationship !== undefined;

const isNonEmptyRelation = (
  value: unknown,
): value is TgProjectionRelationshipRelation =>
  typeof value === 'string' && value.trim().length > 0;

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

    const options = this.config
      .options as ProjectionRelationshipSemanticOptions;
    const shouldOverwrite = options.overwrite ?? false;
    const shouldEnforceDirection = options.enforceDirection ?? false;

    for (const edgeId of updated.outEdges(nodeId)) {
      const targetId = updated.edgeTarget(edgeId);
      const target = updated.getNodeAttributes(targetId);
      if (!target || !to.match(targetId, target, updated)) {
        continue;
      }

      const current = updated.getEdgeAttributes(edgeId);
      if (!hasProjectionRelationship(current)) {
        continue;
      }
      const currentRelation = current.projection.relationship.relation;
      if (!shouldOverwrite && isNonEmptyRelation(currentRelation)) {
        continue;
      }

      updated = updated.setEdge(edgeId, nodeId, targetId, {
        ...current,
        projection: {
          ...current.projection,
          relationship: {
            ...current.projection.relationship,
            relation: options.relation,
          },
        },
      });
    }

    if (!shouldEnforceDirection) {
      return updated;
    }

    for (const edgeId of updated.inEdges(nodeId)) {
      const sourceId = updated.edgeSource(edgeId);
      const source = updated.getNodeAttributes(sourceId);
      if (!source || !to.match(sourceId, source, updated)) {
        continue;
      }

      const current = updated.getEdgeAttributes(edgeId);
      if (!hasProjectionRelationship(current)) {
        continue;
      }
      const currentRelation = current.projection.relationship.relation;
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
          relationship: {
            ...current.projection.relationship,
            relation: options.relation,
          },
        },
      });
    }

    return updated;
  }
}

EdgeRule.register(ProjectionRelationshipSemantic);
