import { AdapterOperations } from '../../Operations/Operations.js';
import { NodeId, TgNodeAttributes } from '../../TgGraph.js';
import { NodeRule } from '../Rule.js';

export class RemoveLeafChain extends NodeRule {
  private hasApplied = false;

  public override apply(
    nodeId: NodeId,
    node: TgNodeAttributes,
    graph: AdapterOperations,
  ): AdapterOperations {
    if (!this.wasMatched(nodeId) || this.hasApplied) {
      return graph;
    }

    this.hasApplied = true;
    return this.removeLeafChainToFixpoint(graph);
  }

  private removeLeafChainToFixpoint(
    graph: AdapterOperations,
  ): AdapterOperations {
    let updated = graph;

    while (true) {
      const removable = this.collectRemovableNodes(updated);
      if (removable.size === 0) {
        return updated;
      }

      for (const removableNodeId of removable) {
        if (updated.getNodeAttributes(removableNodeId)) {
          updated = updated.removeNode(removableNodeId);
        }
      }
    }
  }

  private collectRemovableNodes(graph: AdapterOperations): Set<NodeId> {
    const removable = new Set<NodeId>();
    const queue: NodeId[] = [];

    for (const nodeId of graph.nodeIds()) {
      if (!this.isScopedNode(nodeId, graph)) {
        continue;
      }
      if (!this.isLeafNode(nodeId, graph)) {
        continue;
      }
      queue.push(nodeId);
    }

    while (queue.length > 0) {
      const currentNodeId = queue.shift();
      if (!currentNodeId) {
        continue;
      }
      if (removable.has(currentNodeId)) {
        continue;
      }
      if (!this.isScopedNode(currentNodeId, graph)) {
        continue;
      }
      if (
        !this.isLeafNodeConsideringRemovals(currentNodeId, graph, removable)
      ) {
        continue;
      }

      removable.add(currentNodeId);

      for (const predecessorId of graph.predecessors(currentNodeId)) {
        if (this.isScopedNode(predecessorId, graph)) {
          queue.push(predecessorId);
        }
      }
    }

    return removable;
  }

  private isScopedNode(nodeId: NodeId, graph: AdapterOperations): boolean {
    const node = graph.getNodeAttributes(nodeId);
    if (!node) {
      return false;
    }
    return this.query.match(nodeId, node, graph);
  }

  private isLeafNode(nodeId: NodeId, graph: AdapterOperations): boolean {
    return graph.outEdges(nodeId).length === 0;
  }

  private isLeafNodeConsideringRemovals(
    nodeId: NodeId,
    graph: AdapterOperations,
    removable: Set<NodeId>,
  ): boolean {
    const outEdges = graph.outEdges(nodeId);
    if (outEdges.length === 0) {
      return true;
    }

    return outEdges.every((edgeId) => removable.has(graph.edgeTarget(edgeId)));
  }
}

NodeRule.register(RemoveLeafChain);
