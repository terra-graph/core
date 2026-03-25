import { dirname, isAbsolute, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RuntimeProvider } from '../RuntimeProvider.js';
import {
  RuntimeProviderLoadInput,
  RuntimeProviderLoader,
} from '../RuntimeProviderLoader.js';

type RuntimeProviderModuleShape =
  | RuntimeProvider
  | (() => RuntimeProvider | Promise<RuntimeProvider>)
  | {
      runtimeProvider?:
        | RuntimeProvider
        | (() => RuntimeProvider | Promise<RuntimeProvider>);
      default?:
        | RuntimeProvider
        | (() => RuntimeProvider | Promise<RuntimeProvider>);
    };

const isRuntimeProvider = (value: unknown): value is RuntimeProvider =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isRuntimeProviderFactory = (
  value: unknown,
): value is () => RuntimeProvider | Promise<RuntimeProvider> =>
  typeof value === 'function';

const toProvider = async (
  value: RuntimeProviderModuleShape,
): Promise<RuntimeProvider> => {
  const candidate =
    isRuntimeProvider(value) &&
    ('runtimeProvider' in value || 'default' in value)
      ? ((
          value as {
            runtimeProvider?: unknown;
            default?: unknown;
          }
        ).runtimeProvider ??
        (
          value as {
            runtimeProvider?: unknown;
            default?: unknown;
          }
        ).default)
      : value;

  if (isRuntimeProviderFactory(candidate)) {
    const resolved = await candidate();
    if (!isRuntimeProvider(resolved)) {
      throw new Error('Module does not export a valid runtime provider');
    }
    return resolved;
  }

  if (!isRuntimeProvider(candidate)) {
    throw new Error('Module does not export a valid runtime provider');
  }

  return candidate;
};

const resolveImportSpecifier = (
  specifier: string,
  sourceReference?: string,
): string => {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('file:')
  ) {
    if (specifier.startsWith('file:')) {
      return specifier;
    }
    if (isAbsolute(specifier)) {
      return pathToFileURL(specifier).href;
    }
    if (!sourceReference) {
      return pathToFileURL(resolvePath(specifier)).href;
    }
    return pathToFileURL(resolvePath(dirname(sourceReference), specifier)).href;
  }

  return specifier;
};

export const __test__ = {
  toProvider,
  resolveImportSpecifier,
};

export class ModuleRuntimeProviderLoader implements RuntimeProviderLoader {
  public async load(input: RuntimeProviderLoadInput): Promise<RuntimeProvider> {
    const resolvedSpecifier = resolveImportSpecifier(
      input.specifier,
      input.sourceReference,
    );
    const loaded = await import(resolvedSpecifier);
    return toProvider(loaded as RuntimeProviderModuleShape);
  }
}
