import type { AdapterOperations } from './Operations/Operations.js';
import type { NodeId } from './TgGraph.js';

export type RuleOptionsProviderContext = {
  graph?: AdapterOperations;
  nodeId?: NodeId;
};

export interface RuleOptionsProvider<TOptions = unknown> {
  getRuleOptions(
    context?: RuleOptionsProviderContext,
  ): TOptions | Promise<TOptions>;
}

export const isRuleOptionsProvider = <TOptions = unknown>(
  value: unknown,
): value is RuleOptionsProvider<TOptions> =>
  typeof (value as RuleOptionsProvider<TOptions> | undefined)
    ?.getRuleOptions === 'function';

export const resolveRuleOptions = <TOptions>(
  value: TOptions | RuleOptionsProvider<TOptions>,
  context?: RuleOptionsProviderContext,
): TOptions | Promise<TOptions> =>
  isRuleOptionsProvider<TOptions>(value)
    ? value.getRuleOptions(context)
    : value;
