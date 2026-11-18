import { isObjectRecord } from '../ObjectUtilities.js';
import type { NodeId, TgNodeAttributes } from './TgGraph.js';
export { isObjectRecord } from '../ObjectUtilities.js';

export const isArrayOfUnknown = (value: unknown): value is unknown[] =>
  Array.isArray(value);

export type TerraformValues = Record<string, unknown>;

export const isTerraformValues = (value: unknown): value is TerraformValues =>
  isObjectRecord(value);

export const normalizeTerraformAddress = (address: string): string =>
  address.replace(/\[[^\]]+\]/g, '');

export const resolveNodeArn = (
  node: TgNodeAttributes | undefined,
): string | undefined => {
  const values = node?.terraform?.state?.effective?.values;
  if (!isTerraformValues(values)) {
    return undefined;
  }

  return typeof values.arn === 'string' ? values.arn : undefined;
};

export const findFirstStringReference = (
  value: unknown,
): string | undefined => {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (isArrayOfUnknown(value)) {
    for (const entry of value) {
      const resolved = findFirstStringReference(entry);
      if (resolved) {
        return resolved;
      }
    }
    return undefined;
  }

  if (!isObjectRecord(value)) {
    return undefined;
  }

  if ('references' in value && isArrayOfUnknown(value.references)) {
    for (const reference of value.references) {
      if (typeof reference === 'string' && reference.length > 0) {
        return reference;
      }
    }
  }

  for (const entry of Object.values(value)) {
    const resolved = findFirstStringReference(entry);
    if (resolved) {
      return resolved;
    }
  }

  return undefined;
};

export const resolveTerraformStringFieldOrReference = (
  node: TgNodeAttributes | undefined,
  fieldName: string,
): string | undefined => {
  const values = node?.terraform?.state?.effective?.values;
  if (isTerraformValues(values) && typeof values[fieldName] === 'string') {
    return values[fieldName];
  }

  const expressions = node?.terraform?.configuration?.expressions;
  if (!isObjectRecord(expressions)) {
    return undefined;
  }

  return findFirstStringReference(expressions[fieldName]);
};

export const resolveNodeReference = (
  reference: string,
  nodesByAddress: Map<string, NodeId>,
): NodeId | undefined => {
  let candidate = reference;
  while (candidate.length > 0) {
    const normalizedCandidate = normalizeTerraformAddress(candidate);
    const resolved =
      nodesByAddress.get(candidate) ?? nodesByAddress.get(normalizedCandidate);
    if (resolved) {
      return resolved;
    }

    const nextIndex = candidate.lastIndexOf('.');
    if (nextIndex < 0) {
      break;
    }
    candidate = candidate.slice(0, nextIndex);
  }

  return undefined;
};
