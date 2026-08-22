export interface RuleOptionsProvider<TOptions = unknown> {
  getRuleOptions(): TOptions;
}

export const isRuleOptionsProvider = <TOptions = unknown>(
  value: unknown,
): value is RuleOptionsProvider<TOptions> =>
  typeof (value as RuleOptionsProvider<TOptions> | undefined)
    ?.getRuleOptions === 'function';

export const resolveRuleOptions = <TOptions>(
  value: TOptions | RuleOptionsProvider<TOptions>,
): TOptions =>
  isRuleOptionsProvider<TOptions>(value) ? value.getRuleOptions() : value;
