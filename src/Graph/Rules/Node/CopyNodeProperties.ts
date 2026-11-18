import {
  cloneDeepValue,
  getValueAtPath,
  isObjectRecord,
  setValueAtPath,
} from '../../../ObjectUtilities.js';
import { NodeQuery } from '../../Operations/Matchers/NodeQuery/NodeQuery.js';
import { QueryDsl } from '../../Operations/Matchers/NodeQuery/QuerySchema.js';
import { AdapterOperations } from '../../Operations/Operations.js';
import { NodeId, TgNodeAttributes } from '../../TgGraph.js';
import { NodeRule } from '../Rule.js';
import { NodeRuleConfig } from '../RuleConfig.js';

type ValueReference = {
  from: string;
};

type CopyNodePropertiesOptions = {
  sourceNode: QueryDsl;
  properties: string[];
};

const isValueReference = (value: unknown): value is ValueReference => {
  if (!isObjectRecord(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length === 1 && typeof value.from === 'string';
};

export class CopyNodeProperties extends NodeRule {
  private readonly optionsValue: CopyNodePropertiesOptions;

  constructor(config: NodeRuleConfig) {
    if (config.options === undefined) {
      throw new Error(
        `Rule '${CopyNodeProperties.name}' requires options in config`,
      );
    }
    super(config);
    this.optionsValue = CopyNodeProperties.parseOptions(config.options);
  }

  public override apply(
    nodeId: NodeId,
    node: TgNodeAttributes,
    graph: AdapterOperations,
  ): AdapterOperations {
    if (!this.wasMatched(nodeId)) {
      return graph;
    }

    const sourceNode = this.resolveSourceNode(nodeId, node, graph);
    if (!sourceNode) {
      return graph;
    }

    let nextNode = CopyNodeProperties.cloneValue(node) as TgNodeAttributes;
    let changed = false;

    for (const path of this.optionsValue.properties) {
      const value = CopyNodeProperties.getValueAtPath(
        sourceNode as Record<string, unknown>,
        path,
      );
      if (value === undefined) {
        continue;
      }

      nextNode = CopyNodeProperties.setValueAtPath(
        nextNode as Record<string, unknown>,
        path,
        CopyNodeProperties.cloneValue(value),
      ) as TgNodeAttributes;
      changed = true;
    }

    if (!changed) {
      return graph;
    }

    return graph.setNodeAttributes(nodeId, nextNode);
  }

  private resolveSourceNode(
    nodeId: NodeId,
    node: TgNodeAttributes,
    graph: AdapterOperations,
  ): TgNodeAttributes | undefined {
    const resolvedDsl = this.resolveDslReferences(
      nodeId,
      node,
      this.optionsValue.sourceNode,
    );
    const query = NodeQuery.from(resolvedDsl as QueryDsl);

    for (const candidateNodeId of graph.nodeIds()) {
      const candidate = graph.getNodeAttributes(candidateNodeId);
      if (candidate && query.match(candidateNodeId, candidate, graph)) {
        return candidate;
      }
    }

    return undefined;
  }

  private resolveDslReferences(
    nodeId: NodeId,
    node: TgNodeAttributes,
    input: unknown,
  ): unknown {
    if (isValueReference(input)) {
      return this.resolveValueReference(nodeId, node, input);
    }

    if (Array.isArray(input)) {
      return input.map((item) => this.resolveDslReferences(nodeId, node, item));
    }

    if (isObjectRecord(input)) {
      const resolved: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        const next = this.resolveDslReferences(nodeId, node, value);
        if (next !== undefined) {
          resolved[key] = next;
        }
      }
      return resolved;
    }

    return input;
  }

  private resolveValueReference(
    nodeId: NodeId,
    node: TgNodeAttributes,
    value: ValueReference,
  ): unknown {
    const from = value.from.trim();
    if (from === 'nodeId') {
      return String(nodeId);
    }

    return CopyNodeProperties.getValueAtPath(
      node as Record<string, unknown>,
      from,
    );
  }

  private static parseOptions(input: unknown): CopyNodePropertiesOptions {
    if (!isObjectRecord(input) || !isObjectRecord(input.sourceNode)) {
      throw new Error(
        `Rule '${CopyNodeProperties.name}' requires options.sourceNode`,
      );
    }

    if (!Array.isArray(input.properties)) {
      throw new Error(
        `Rule '${CopyNodeProperties.name}' requires options.properties`,
      );
    }

    const properties = input.properties.filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );

    if (properties.length === 0) {
      throw new Error(
        `Rule '${CopyNodeProperties.name}' requires options.properties to include at least one path`,
      );
    }

    return {
      sourceNode: input.sourceNode as QueryDsl,
      properties,
    };
  }

  private static getValueAtPath(
    target: Record<string, unknown>,
    path: string,
  ): unknown {
    return getValueAtPath(target, path);
  }

  private static setValueAtPath(
    target: Record<string, unknown>,
    path: string,
    value: unknown,
  ): Record<string, unknown> {
    return setValueAtPath(target, path, value);
  }

  private static cloneValue<T>(value: T): T {
    return cloneDeepValue(value);
  }
}

NodeRule.register(CopyNodeProperties);
