import { AdapterOperations } from '../../Operations/Operations.js';
import type { SemanticDecorator } from '../../Semantics.js';
import { NodeId, TgNodeAttributes } from '../../TgGraph.js';
import { NodeRule } from '../Rule.js';
import { NodeRuleConfig } from '../RuleConfig.js';

type ApplySemanticDecoratorsMode = 'extract' | 'project';

type ApplySemanticDecoratorsOptions = {
  mode: ApplySemanticDecoratorsMode;
  decorators: SemanticDecorator[];
};

type ApplySemanticDecoratorsInput =
  | {
      options: ApplySemanticDecoratorsOptions;
    }
  | NodeRuleConfig;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isApplySemanticDecoratorsMode = (
  value: unknown,
): value is ApplySemanticDecoratorsMode =>
  value === 'extract' || value === 'project';

export class ApplySemanticDecorators extends NodeRule {
  private readonly optionsValue: ApplySemanticDecoratorsOptions;

  constructor(config: ApplySemanticDecoratorsInput) {
    const normalizedConfig: NodeRuleConfig =
      'node' in config
        ? config
        : {
            node: {
              any: true,
            },
            options: config.options as unknown as Record<string, unknown>,
          };

    super(normalizedConfig);
    this.optionsValue = ApplySemanticDecorators.parseOptions(
      normalizedConfig.options,
    );
  }

  public override apply(
    nodeId: NodeId,
    _node: TgNodeAttributes,
    graph: AdapterOperations,
  ): AdapterOperations {
    if (!this.wasMatched(nodeId) || this.optionsValue.decorators.length === 0) {
      return graph;
    }

    const firstNodeId = graph.nodeIds()[0];
    if (!firstNodeId || firstNodeId !== nodeId) {
      return graph;
    }

    return this.optionsValue.decorators.reduce((current, decorator) => {
      return this.optionsValue.mode === 'extract'
        ? decorator.extract({ graph: current })
        : decorator.project({ graph: current });
    }, graph);
  }

  private static parseOptions(
    options: NodeRuleConfig['options'],
  ): ApplySemanticDecoratorsOptions {
    if (!isObjectRecord(options)) {
      throw new Error(
        `${ApplySemanticDecorators.name} requires an options object`,
      );
    }

    if (!isApplySemanticDecoratorsMode(options.mode)) {
      throw new Error(
        `${ApplySemanticDecorators.name} requires mode to be 'extract' or 'project'`,
      );
    }

    if (
      !Array.isArray(options.decorators) ||
      !options.decorators.every(
        (decorator) =>
          typeof decorator === 'object' &&
          decorator !== null &&
          'extract' in decorator &&
          typeof decorator.extract === 'function' &&
          'project' in decorator &&
          typeof decorator.project === 'function',
      )
    ) {
      throw new Error(
        `${ApplySemanticDecorators.name} requires decorators to be SemanticDecorator instances`,
      );
    }

    return {
      mode: options.mode,
      decorators: options.decorators as SemanticDecorator[],
    };
  }
}

NodeRule.register(ApplySemanticDecorators);
