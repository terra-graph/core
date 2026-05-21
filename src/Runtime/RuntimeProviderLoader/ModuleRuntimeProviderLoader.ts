import { existsSync, readFileSync } from 'node:fs';
import { Module, isBuiltin } from 'node:module';
import { dirname, isAbsolute, join, resolve as resolvePath } from 'node:path';
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

type RuntimeProviderRecord = Record<string, unknown>;

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

  private hasProviderShape(value: unknown): value is RuntimeProvider {
    if (!this.isRuntimeProvider(value)) {
      return false;
    }

    const record = value as RuntimeProviderRecord;
    return (
      'namedRules' in record ||
      'namedRuleSets' in record ||
      'profiles' in record ||
      'plugins' in record ||
      'renderers' in record ||
      'writers' in record ||
      'supportedAdapterOperationsRegistry' in record
    );
  }

  private isRuntimeProviderFactory(
    value: unknown,
  ): value is () => RuntimeProvider | Promise<RuntimeProvider> {
    return typeof value === 'function';
  }

  private async toProvider(
    value: RuntimeProviderModuleShape,
  ): Promise<RuntimeProvider> {
    let candidate: unknown =
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

    // Dynamic-importing CommonJS can yield nested default objects:
    //   ESM namespace -> CJS module.exports object -> default factory/provider.
    // Unwrap those layers while preserving direct provider objects.
    const visited = new Set<unknown>();
    while (
      this.isRuntimeProvider(candidate) &&
      !this.hasProviderShape(candidate) &&
      'default' in candidate &&
      !visited.has(candidate)
    ) {
      visited.add(candidate);
      candidate = (candidate as { default?: unknown }).default;
    }

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
        const preferredImportPath =
          this.resolveEsmEntryPathFromResolvedFile(resolved);
        return pathToFileURL(preferredImportPath ?? resolved).href;
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

  private resolveEsmEntryPathFromResolvedFile(
    resolvedFile: string,
  ): string | undefined {
    let current = dirname(resolvedFile);
    while (true) {
      const packageJsonPath = join(current, 'package.json');
      if (existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(
            readFileSync(packageJsonPath, 'utf8'),
          ) as Record<string, unknown>;
          const exportRoot = (
            packageJson.exports as Record<string, unknown> | undefined
          )?.['.'];
          const importEntry =
            this.readEntryPoint(exportRoot, 'import') ??
            this.readEntryPoint(exportRoot, 'default') ??
            this.readEntryPoint(packageJson, 'module') ??
            undefined;

          if (importEntry) {
            const resolvedImportEntry = join(current, importEntry);
            if (existsSync(resolvedImportEntry)) {
              return resolvedImportEntry;
            }
          }
        } catch {
          // Continue walking up until a package.json with import/module entry is found.
        }
      }

      const parent = dirname(current);
      if (parent === current) {
        return undefined;
      }
      current = parent;
    }
  }

  private readEntryPoint(value: unknown, key: string): string | undefined {
    if (typeof value === 'string') {
      return key === 'module' ? value : undefined;
    }

    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof (value as Record<string, unknown>)[key] === 'string'
    ) {
      return (value as Record<string, string>)[key];
    }

    return undefined;
  }
}
