import { AdapterOperations } from '../../Operations/Operations.js';
import {
  DefaultEdgeSemanticRoles,
  DefaultProjectionMembershipRelations,
  NodeId,
  TgEdgeSemanticHint,
  TgNodeAttributes,
} from '../../TgGraph.js';
import { NodeRule } from '../Rule.js';

const projectionSemanticHintFor = (
  edge: ReturnType<AdapterOperations['getEdgeAttributes']>,
): TgEdgeSemanticHint | undefined => {
  const membershipRelation = edge.projection?.membership?.relation;
  if (membershipRelation) {
    return {
      semantic: membershipRelation,
      role:
        membershipRelation === DefaultProjectionMembershipRelations.Realizes
          ? DefaultEdgeSemanticRoles.Primary
          : DefaultEdgeSemanticRoles.Supporting,
    };
  }

  const relationshipRelation = edge.projection?.relationship?.relation;
  if (relationshipRelation) {
    return {
      semantic: relationshipRelation,
      role: DefaultEdgeSemanticRoles.Primary,
    };
  }

  return undefined;
};

const sameProjectionSemanticHint = (
  current: TgEdgeSemanticHint | undefined,
  next: TgEdgeSemanticHint,
): boolean => current?.semantic === next.semantic && current.role === next.role;

const shouldRetainNeutralAdjacencyEdge = (
  edge: ReturnType<AdapterOperations['getEdgeAttributes']>,
): boolean => edge.projection?.adjacency?.emit === true;

const stripAdjacencyFromRelationshipEdge = (
  edge: ReturnType<AdapterOperations['getEdgeAttributes']>,
) => {
  if (!edge.projection?.relationship || !edge.projection.adjacency) {
    return edge;
  }

  return {
    ...edge,
    projection: {
      ...edge.projection,
      adjacency: undefined,
    },
  };
};

export class ApplyProjectionEdgeSemantics extends NodeRule {
  constructor() {
    super({
      node: {
        any: true,
      },
    });
  }

  public override apply(
    nodeId: NodeId,
    _node: TgNodeAttributes,
    graph: AdapterOperations,
  ): AdapterOperations {
    if (!this.wasMatched(nodeId)) {
      return graph;
    }

    const firstNodeId = graph.nodeIds()[0];
    if (!firstNodeId || firstNodeId !== nodeId) {
      return graph;
    }

    let updated = graph;
    const visited = new Set<string>();

    for (const currentNodeId of graph.nodeIds()) {
      for (const edgeId of graph.outEdges(currentNodeId)) {
        if (visited.has(String(edgeId))) {
          continue;
        }
        visited.add(String(edgeId));

        const current = updated.getEdgeAttributes(edgeId);
        const normalized = stripAdjacencyFromRelationshipEdge(current);
        if (normalized !== current) {
          updated = updated.setEdge(
            edgeId,
            updated.edgeSource(edgeId),
            updated.edgeTarget(edgeId),
            normalized,
          );
        }

        const semantic = projectionSemanticHintFor(normalized);
        if (!semantic && normalized.projection?.adjacency) {
          if (!shouldRetainNeutralAdjacencyEdge(normalized)) {
            updated = updated.removeEdge(edgeId);
          }
          continue;
        }
        if (!semantic) {
          continue;
        }

        if (sameProjectionSemanticHint(normalized.hints?.semantic, semantic)) {
          continue;
        }

        updated = updated.setEdge(
          edgeId,
          updated.edgeSource(edgeId),
          updated.edgeTarget(edgeId),
          {
            ...normalized,
            hints: {
              ...normalized.hints,
              semantic,
            },
          },
        );
      }
    }

    return updated;
  }
}

NodeRule.register(ApplyProjectionEdgeSemantics);
