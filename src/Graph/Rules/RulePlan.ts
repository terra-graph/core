import { BaseRule } from './Rule.js';
import { SerializedRule } from './RuleConfig.js';

export type NamedRuleRef = {
  namedRule: string;
};

export type NamedRuleSetRef = {
  namedRuleSet: string;
};

export type PhaseRule =
  | BaseRule
  | SerializedRule
  | NamedRuleRef
  | NamedRuleSetRef;
export type SerializedPhaseRule =
  | SerializedRule
  | NamedRuleRef
  | NamedRuleSetRef;

export const NAMED_PHASES = [
  'pre',
  'normalize',
  'semantics',
  'main',
  'cleanup',
] as const;

export type NamedPhase = (typeof NAMED_PHASES)[number];

export type PhaseStep = {
  phase: NamedPhase;
  rules: PhaseRule[];
};

export type SerializedPhaseStep = {
  phase: NamedPhase;
  rules: SerializedPhaseRule[];
};

export type PhasePlan = PhaseStep[];
export type SerializedPhasePlan = SerializedPhaseStep[];

export type NamedRuleDefinition = SerializedRule | BaseRule | (() => BaseRule);
export type NamedRuleDefinitions = Record<string, NamedRuleDefinition>;

export const isNamedRuleRef = (rule: PhaseRule): rule is NamedRuleRef => {
  return (
    typeof rule === 'object' &&
    rule !== null &&
    'namedRule' in rule &&
    typeof rule.namedRule === 'string'
  );
};

export const isNamedRuleSetRef = (rule: PhaseRule): rule is NamedRuleSetRef => {
  return (
    typeof rule === 'object' &&
    rule !== null &&
    'namedRuleSet' in rule &&
    typeof rule.namedRuleSet === 'string'
  );
};

export const isNamedPhase = (value: unknown): value is NamedPhase => {
  return (
    typeof value === 'string' && NAMED_PHASES.includes(value as NamedPhase)
  );
};
