// @ts-ignore -- lodash is installed at runtime in this workspace; package typings can be refreshed separately.
import lodash from 'lodash';

const { cloneDeep, get, mergeWith, set } = lodash as {
  cloneDeep: <T>(value: T) => T;
  get: (object: unknown, path: string | Array<string | number>) => unknown;
  mergeWith: <
    TObject extends Record<string, unknown>,
    TSource extends Record<string, unknown>,
  >(
    object: TObject,
    source: TSource,
    customizer: (objectValue: unknown, sourceValue: unknown) => unknown,
  ) => TObject & TSource;
  set: <T extends Record<string, unknown>>(
    object: T,
    path: string | Array<string | number>,
    value: unknown,
  ) => T;
};

export const isObjectRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const cloneDeepValue = <T>(value: T): T => cloneDeep(value);

export const getValueAtPath = (
  target: Record<string, unknown>,
  path: string,
): unknown => {
  if (!path) {
    return undefined;
  }

  return get(target, path.split('.'));
};

export const setValueAtPath = <T extends Record<string, unknown>>(
  target: T,
  path: string,
  value: unknown,
): T => {
  const keys = path.split('.').filter((key) => key.length > 0);
  if (keys.length === 0) {
    return target;
  }

  const next = cloneDeepValue(target);
  set(next, keys, value);
  return next;
};

export const mergeObjectRecords = <
  TBase extends Record<string, unknown>,
  TPatch extends Record<string, unknown>,
>(
  base: TBase,
  patch: TPatch,
): TBase & TPatch => {
  const merged = cloneDeepValue(base);
  return mergeWith(merged, patch, (objectValue, sourceValue) => {
    if (Array.isArray(sourceValue)) {
      return cloneDeepValue(sourceValue);
    }

    if (!isObjectRecord(sourceValue)) {
      return cloneDeepValue(sourceValue);
    }

    if (!isObjectRecord(objectValue)) {
      return cloneDeepValue(sourceValue);
    }

    return undefined;
  });
};
