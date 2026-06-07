import { AdapterOperations } from '../../Operations/Operations.js';
import {
  NodeId,
  TgEdgeAttributes,
  TgNodeAttributes,
  TgProjectionRelationshipRelation,
  TgSemanticFact,
} from '../../TgGraph.js';
import { EdgeRule } from '../Rule.js';
import { EdgeRuleConfig } from '../RuleConfig.js';

type ProjectionSemanticFactRelationshipOptions = {
  fact: string;
  relation: TgProjectionRelationshipRelation;
  overwrite?: boolean;
  enforceDirection?: boolean;
};

type NormalizedProjectionSemanticFactRelationshipOptions = {
  fact: string;
  relation: TgProjectionRelationshipRelation;
  overwrite: boolean;
  enforceDirection: boolean;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isNonEmptyRelation = (
  value: unknown,
): value is TgProjectionRelationshipRelation => isNonEmptyString(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const findSemanticFact = (
  edge: TgEdgeAttributes,
  factKind: string,
  from: NodeId,
  to: NodeId,
): TgSemanticFact | undefined =>
  edge.projection?.semantics?.facts?.find(
    (fact) => fact.kind === factKind && fact.from === from && fact.to === to,
  );

const buildRelationshipAttributes = (
  edge: TgEdgeAttributes,
  relation: TgProjectionRelationshipRelation,
  fact: TgSemanticFact,
) => ({
  ...edge.projection?.relationship,
  relation,
  source: edge.projection?.relationship?.source ?? 'derived',
  evidence:
    edge.projection?.relationship?.evidence ??
    edge.projection?.adjacency?.evidence,
  semanticFact: {
    kind: fact.kind,
    confidence: fact.confidence,
    ...(fact.decorator !== undefined ? { decorator: fact.decorator } : {}),
    ...(typeof fact.attributes?.matchMode === 'string'
      ? { matchMode: fact.attributes.matchMode }
      : {}),
    ...(isFiniteNumber(fact.attributes?.matchCertainty)
      ? { matchCertainty: fact.attributes.matchCertainty }
      : {}),
  },
});

export class ProjectionSemanticFactRelationship extends EdgeRule {
  constructor(config: EdgeRuleConfig) {
    if (config.options === undefined) {
      throw new Error(
        `Rule '${ProjectionSemanticFactRelationship.name}' requires options in config`,
      );
    }

    const options =
      config.options as Partial<ProjectionSemanticFactRelationshipOptions>;
    if (!isNonEmptyString(options.fact)) {
      throw new Error(
        `Rule '${ProjectionSemanticFactRelationship.name}' requires options.fact`,
      );
    }
    if (!isNonEmptyRelation(options.relation)) {
      throw new Error(
        `Rule '${ProjectionSemanticFactRelationship.name}' requires options.relation`,
      );
    }

    if (
      options.overwrite !== undefined &&
      typeof options.overwrite !== 'boolean'
    ) {
      throw new Error(
        `Rule '${ProjectionSemanticFactRelationship.name}' options.overwrite must be a boolean when provided`,
      );
    }

    if (
      options.enforceDirection !== undefined &&
      typeof options.enforceDirection !== 'boolean'
    ) {
      throw new Error(
        `Rule '${ProjectionSemanticFactRelationship.name}' options.enforceDirection must be a boolean when provided`,
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
      .options as NormalizedProjectionSemanticFactRelationshipOptions;
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
      const matchedFact = findSemanticFact(
        current,
        options.fact,
        nodeId,
        targetId,
      );
      if (!matchedFact) {
        continue;
      }

      const currentRelation = current.projection?.relationship?.relation;
      if (!shouldOverwrite && isNonEmptyRelation(currentRelation)) {
        continue;
      }

      updated = updated.setEdge(edgeId, nodeId, targetId, {
        ...current,
        projection: {
          ...current.projection,
          layer: current.projection?.layer ?? 'core',
          relationship: buildRelationshipAttributes(
            current,
            options.relation,
            matchedFact,
          ),
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
        const matchedFact = findSemanticFact(
          current,
          options.fact,
          nodeId,
          sourceId,
        );
        if (!matchedFact) {
          continue;
        }

        const currentRelation = current.projection?.relationship?.relation;
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
            layer: current.projection?.layer ?? 'core',
            relationship: buildRelationshipAttributes(
              current,
              options.relation,
              matchedFact,
            ),
          },
        });
      }
    }

    return updated;
  }
}

EdgeRule.register(ProjectionSemanticFactRelationship);
