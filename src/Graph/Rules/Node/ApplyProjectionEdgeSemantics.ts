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
        const semantic = projectionSemanticHintFor(current);
        if (!semantic) {
          continue;
        }

        if (
          current.hints?.semantic?.semantic === semantic.semantic &&
          current.hints.semantic.role === semantic.role
        ) {
          continue;
        }

        updated = updated.setEdge(
          edgeId,
          updated.edgeSource(edgeId),
          updated.edgeTarget(edgeId),
          {
            ...current,
            hints: {
              ...current.hints,
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
