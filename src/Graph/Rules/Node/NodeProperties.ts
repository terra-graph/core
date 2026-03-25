import { AdapterOperations } from '../../Operations/Operations.js';
import { NodeId, TgNodeAttributes } from '../../TgGraph.js';
import { NodeRule } from '../Rule.js';
import { NodeRuleConfig } from '../RuleConfig.js';

type ValueReference = {
  from: string;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isValueReference = (value: unknown): value is ValueReference => {
  if (!isObjectRecord(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length === 1 && typeof value.from === 'string';
};

export class NodeProperties extends NodeRule {
  constructor(config: NodeRuleConfig) {
    if (config.options === undefined) {
      throw new Error(
        `Rule '${NodeProperties.name}' requires options in config`,
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

    const resolved = this.resolveOptions(
      nodeId,
      node,
      this.config.options ?? {},
    );
    if (!isObjectRecord(resolved) || Object.keys(resolved).length === 0) {
      return graph;
    }

    return graph.setNodeAttributes(
      nodeId,
      NodeProperties.deepMerge(node, resolved) as TgNodeAttributes,
    );
  }

  private resolveOptions(
    nodeId: NodeId,
    node: TgNodeAttributes,
    input: unknown,
  ): unknown {
    if (isValueReference(input)) {
      return this.resolveValueReference(nodeId, node, input);
    }

    if (Array.isArray(input)) {
      return input.map((item) => this.resolveOptions(nodeId, node, item));
    }

    if (isObjectRecord(input)) {
      const resolved: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        const next = this.resolveOptions(nodeId, node, value);
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

    return NodeProperties.getValueAtPath(node as Record<string, unknown>, from);
  }

  private static deepMerge(base: unknown, patch: unknown): unknown {
    if (!isObjectRecord(base) || !isObjectRecord(patch)) {
      return patch;
    }

    const merged: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      merged[key] = NodeProperties.deepMerge(merged[key], value);
    }

    return merged;
  }

  private static getValueAtPath(
    target: Record<string, unknown>,
    path: string,
  ): unknown {
    if (!path) {
      return undefined;
    }

    return path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object' && key in (acc as object)) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, target);
  }
}

NodeRule.register(NodeProperties);
