import { Module, isBuiltin } from 'node:module';
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

export class ModuleRuntimeProviderLoader implements RuntimeProviderLoader {
  public async load(input: RuntimeProviderLoadInput): Promise<RuntimeProvider> {
    const resolvedSpecifier = this.resolveImportSpecifier(
      input.specifier,
      input.sourceReference,
    );
    const loaded = await import(resolvedSpecifier);
    return this.toProvider(loaded as RuntimeProviderModuleShape);
  }

  private isRuntimeProvider(value: unknown): value is RuntimeProvider {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isRuntimeProviderFactory(
    value: unknown,
  ): value is () => RuntimeProvider | Promise<RuntimeProvider> {
    return typeof value === 'function';
  }

  private async toProvider(
    value: RuntimeProviderModuleShape,
  ): Promise<RuntimeProvider> {
    const candidate =
      this.isRuntimeProvider(value) &&
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

    if (this.isRuntimeProviderFactory(candidate)) {
      const resolved = await candidate();
      if (!this.isRuntimeProvider(resolved)) {
        throw new Error('Module does not export a valid runtime provider');
      }
      return resolved;
    }

    if (!this.isRuntimeProvider(candidate)) {
      throw new Error('Module does not export a valid runtime provider');
    }

    return candidate;
  }

  private resolveImportSpecifier(
    specifier: string,
    sourceReference?: string,
  ): string {
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
      return pathToFileURL(resolvePath(dirname(sourceReference), specifier))
        .href;
    }

    if (isBuiltin(specifier)) {
      return specifier;
    }

    const resolveFromBase = (baseFile: string): string | undefined => {
      const moduleApi = Module as typeof Module & {
        _resolveFilename?: (
          request: string,
          parent: Module,
          isMain: boolean,
          options?: { conditions?: Set<string> },
        ) => string;
        _nodeModulePaths?: (from: string) => string[];
      };

      if (!moduleApi._resolveFilename || !moduleApi._nodeModulePaths) {
        return undefined;
      }

      try {
        const parent = new Module(baseFile);
        parent.filename = baseFile;
        parent.paths = moduleApi._nodeModulePaths(dirname(baseFile));
        const resolved = moduleApi._resolveFilename(specifier, parent, false, {
          conditions: new Set(['import', 'default', 'require']),
        });
        return pathToFileURL(resolved).href;
      } catch {
        return undefined;
      }
    };

    if (sourceReference) {
      const basePath = sourceReference.startsWith('file:')
        ? fileURLToPath(sourceReference)
        : sourceReference;
      const resolvedFromSource = resolveFromBase(basePath);
      if (resolvedFromSource) {
        return resolvedFromSource;
      }
    }

    const cwdBase = resolvePath(process.cwd(), 'index.js');
    const resolvedFromCwd = resolveFromBase(cwdBase);
    if (resolvedFromCwd) {
      return resolvedFromCwd;
    }

    return specifier;
  }
}
