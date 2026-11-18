import { EdgeQueryDsl } from '../Operations/Matchers/EdgeQuery/QuerySchema.js';
import { QueryDsl } from '../Operations/Matchers/NodeQuery/QuerySchema.js';

export type NodeRuleConfig = {
  node: QueryDsl;
  options?: Record<string, unknown>;
};

export type EdgeRuleQuery = EdgeQueryDsl;

export type EdgeRuleConfig = {
  edge: EdgeRuleQuery;
  options?: Record<string, unknown>;
};

export type RuleConfig = NodeRuleConfig | EdgeRuleConfig;

export type SerializedRule = {
  id: string;
  config: RuleConfig;
};

export type SerializedRulePhase = SerializedRule[];
export type SerializedRulePlan = SerializedRulePhase[];
