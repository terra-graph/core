import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { Module } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ModuleRuntimeProviderLoader } from './ModuleRuntimeProviderLoader.js';

describe('ModuleRuntimeProviderLoader.load', () => {
  it('shoud load a provider from a module default object export', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runtime-provider-loader-'));
    const providerPath = join(dir, 'provider.cjs');

    await writeFile(
      providerPath,
      'module.exports = { supportedAdapterOperationsRegistry: { ExternalAdapter: class ExternalAdapter {} } };',
      'utf8',
    );

    try {
      const loader = new ModuleRuntimeProviderLoader();
      const provider = await loader.load({ specifier: providerPath });

      expect(provider.supportedAdapterOperationsRegistry).toBeDefined();
      expect(
        provider.supportedAdapterOperationsRegistry
          ? Object.keys(provider.supportedAdapterOperationsRegistry)
          : [],
      ).toContain('ExternalAdapter');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shoud load a provider from a runtimeProvider named export', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runtime-provider-loader-'));
    const providerPath = join(dir, 'provider.cjs');

    await writeFile(
      providerPath,
      'module.exports = { runtimeProvider: { supportedAdapterOperationsRegistry: { NamedExport: class NamedExport {} } } };',
      'utf8',
    );

    try {
      const loader = new ModuleRuntimeProviderLoader();
      const provider = await loader.load({ specifier: providerPath });

      expect(provider.supportedAdapterOperationsRegistry).toBeDefined();
      expect(
        provider.supportedAdapterOperationsRegistry
          ? Object.keys(provider.supportedAdapterOperationsRegistry)
          : [],
      ).toContain('NamedExport');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shoud accept raw runtime providers without module export markers', async () => {
    const provider = {} as Parameters<
      (typeof ModuleRuntimeProviderLoader)['prototype']['toProvider']
    >[0];
    const loader = new ModuleRuntimeProviderLoader();
    // @ts-expect-error accessing private method for test coverage
    await expect(loader.toProvider(provider)).resolves.toBe(provider);
  });

  it('shoud load a provider from a default function export', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runtime-provider-loader-'));
    const providerPath = join(dir, 'provider.cjs');

    await writeFile(
      providerPath,
      'module.exports = () => ({ supportedAdapterOperationsRegistry: { FromDefault: class FromDefault {} } });',
      'utf8',
    );

    try {
      const loader = new ModuleRuntimeProviderLoader();
      const provider = await loader.load({ specifier: providerPath });

      expect(provider.supportedAdapterOperationsRegistry).toBeDefined();
      expect(
        provider.supportedAdapterOperationsRegistry
          ? Object.keys(provider.supportedAdapterOperationsRegistry)
          : [],
      ).toContain('FromDefault');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shoud load a provider from a file URL specifier', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runtime-provider-loader-'));
    const providerPath = join(dir, 'provider.cjs');

    await writeFile(
      providerPath,
      'module.exports = { supportedAdapterOperationsRegistry: { FileUrlProvider: class FileUrlProvider {} } };',
      'utf8',
    );

    try {
      const loader = new ModuleRuntimeProviderLoader();
      const provider = await loader.load({
        specifier: pathToFileURL(providerPath).href,
      });

      expect(provider.supportedAdapterOperationsRegistry).toBeDefined();
      expect(
        provider.supportedAdapterOperationsRegistry
          ? Object.keys(provider.supportedAdapterOperationsRegistry)
          : [],
      ).toContain('FileUrlProvider');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shoud resolve relative provider specifiers from cwd when no reference is provided', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runtime-provider-loader-'));
    const providerPath = join(dir, 'provider.cjs');
    const originalCwd = process.cwd();

    await writeFile(
      providerPath,
      'module.exports = { supportedAdapterOperationsRegistry: { CwdProvider: class CwdProvider {} } };',
      'utf8',
    );

    try {
      process.chdir(dir);
      const loader = new ModuleRuntimeProviderLoader();
      const provider = await loader.load({ specifier: './provider.cjs' });

      expect(provider.supportedAdapterOperationsRegistry).toBeDefined();
      expect(
        provider.supportedAdapterOperationsRegistry
          ? Object.keys(provider.supportedAdapterOperationsRegistry)
          : [],
      ).toContain('CwdProvider');
    } finally {
      process.chdir(originalCwd);
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shoud resolve relative provider specifiers from sourceReference', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runtime-provider-loader-'));
    const configPath = join(dir, 'runtime.yaml');
    const providerPath = join(dir, 'provider.cjs');

    await writeFile(
      providerPath,
      'module.exports = { supportedAdapterOperationsRegistry: { RelativeProvider: class RelativeProvider {} } };',
      'utf8',
    );

    try {
      const loader = new ModuleRuntimeProviderLoader();
      const provider = await loader.load({
        specifier: './provider.cjs',
        sourceReference: configPath,
      });

      expect(provider.supportedAdapterOperationsRegistry).toBeDefined();
      expect(
        provider.supportedAdapterOperationsRegistry
          ? Object.keys(provider.supportedAdapterOperationsRegistry)
          : [],
      ).toContain('RelativeProvider');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shoud resolve package providers from sourceReference', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runtime-provider-loader-'));
    const packageDir = join(dir, 'node_modules', 'package-provider');
    const configPath = join(dir, 'runtime.yml');

    await mkdir(packageDir, { recursive: true });
    await writeFile(
      join(packageDir, 'package.json'),
      JSON.stringify({
        name: 'package-provider',
        exports: {
          import: './index.cjs',
          require: './index.cjs',
          default: './index.cjs',
        },
      }),
      'utf8',
    );
    await writeFile(
      join(packageDir, 'index.cjs'),
      'module.exports = { supportedAdapterOperationsRegistry: { FromPackage: class FromPackage {} } };',
      'utf8',
    );
    await writeFile(configPath, 'providers: []', 'utf8');

    try {
      const loader = new ModuleRuntimeProviderLoader();
      const provider = await loader.load({
        specifier: 'package-provider',
        sourceReference: configPath,
      });

      expect(provider.supportedAdapterOperationsRegistry).toBeDefined();
      expect(
        provider.supportedAdapterOperationsRegistry
          ? Object.keys(provider.supportedAdapterOperationsRegistry)
          : [],
      ).toContain('FromPackage');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shoud resolve package providers from cwd when no reference is provided', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runtime-provider-loader-'));
    const packageDir = join(dir, 'node_modules', 'cwd-provider');
    const originalCwd = process.cwd();

    await mkdir(packageDir, { recursive: true });
    await writeFile(
      join(packageDir, 'package.json'),
      JSON.stringify({
        name: 'cwd-provider',
        exports: {
          import: './index.cjs',
          require: './index.cjs',
          default: './index.cjs',
        },
      }),
      'utf8',
    );
    await writeFile(
      join(packageDir, 'index.cjs'),
      'module.exports = { supportedAdapterOperationsRegistry: { FromCwdPackage: class FromCwdPackage {} } };',
      'utf8',
    );

    try {
      process.chdir(dir);
      const loader = new ModuleRuntimeProviderLoader();
      const provider = await loader.load({ specifier: 'cwd-provider' });

      expect(provider.supportedAdapterOperationsRegistry).toBeDefined();
      expect(
        provider.supportedAdapterOperationsRegistry
          ? Object.keys(provider.supportedAdapterOperationsRegistry)
          : [],
      ).toContain('FromCwdPackage');
    } finally {
      process.chdir(originalCwd);
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shoud resolve ESM-only package specifiers without loading', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runtime-provider-loader-'));
    const packageDir = join(dir, 'node_modules', 'esm-only');
    const configPath = join(dir, 'runtime.yml');

    await mkdir(packageDir, { recursive: true });
    await writeFile(
      join(packageDir, 'package.json'),
      JSON.stringify({
        name: 'esm-only',
        type: 'module',
        exports: {
          import: './index.mjs',
        },
      }),
      'utf8',
    );
    await writeFile(
      join(packageDir, 'index.mjs'),
      'export default {};',
      'utf8',
    );
    await writeFile(configPath, 'providers: []', 'utf8');

    try {
      const loader = new ModuleRuntimeProviderLoader();
      // @ts-expect-error accessing private method for test coverage
      const resolved = loader.resolveImportSpecifier('esm-only', configPath);
      const resolvedPath = await realpath(fileURLToPath(resolved));
      const expectedPath = await realpath(join(packageDir, 'index.mjs'));
      expect(resolvedPath).toBe(expectedPath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shoud resolve package providers from file URL sourceReference', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runtime-provider-loader-'));
    const packageDir = join(dir, 'node_modules', 'file-url-provider');
    const configPath = join(dir, 'runtime.yml');

    await mkdir(packageDir, { recursive: true });
    await writeFile(
      join(packageDir, 'package.json'),
      JSON.stringify({
        name: 'file-url-provider',
        exports: {
          import: './index.cjs',
          require: './index.cjs',
          default: './index.cjs',
        },
      }),
      'utf8',
    );
    await writeFile(
      join(packageDir, 'index.cjs'),
      'module.exports = {};',
      'utf8',
    );
    await writeFile(configPath, 'providers: []', 'utf8');

    try {
      const loader = new ModuleRuntimeProviderLoader();
      // @ts-expect-error accessing private method for test coverage
      const resolved = loader.resolveImportSpecifier(
        'file-url-provider',
        pathToFileURL(configPath).href,
      );
      const resolvedPath = await realpath(fileURLToPath(resolved));
      const expectedPath = await realpath(join(packageDir, 'index.cjs'));
      expect(resolvedPath).toBe(expectedPath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shoud fall back to specifier when package cannot be resolved', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runtime-provider-loader-'));
    const configPath = join(dir, 'runtime.yml');
    await writeFile(configPath, 'providers: []', 'utf8');

    try {
      const loader = new ModuleRuntimeProviderLoader();
      // @ts-expect-error accessing private method for test coverage
      const resolved = loader.resolveImportSpecifier(
        'missing-package',
        configPath,
      );
      expect(resolved).toBe('missing-package');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shoud fall back when module resolve APIs are unavailable', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runtime-provider-loader-'));
    const configPath = join(dir, 'runtime.yml');
    await writeFile(configPath, 'providers: []', 'utf8');

    const moduleApi = Module as typeof Module & {
      _resolveFilename?: unknown;
      _nodeModulePaths?: unknown;
    };
    const originalResolve = moduleApi._resolveFilename;
    const originalPaths = moduleApi._nodeModulePaths;

    try {
      moduleApi._resolveFilename = undefined;
      moduleApi._nodeModulePaths = undefined;

      const loader = new ModuleRuntimeProviderLoader();
      // @ts-expect-error accessing private method for test coverage
      const resolved = loader.resolveImportSpecifier(
        'missing-package',
        configPath,
      );
      expect(resolved).toBe('missing-package');
    } finally {
      moduleApi._resolveFilename = originalResolve;
      moduleApi._nodeModulePaths = originalPaths;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shoud accept non-file specifiers unchanged', async () => {
    const loader = new ModuleRuntimeProviderLoader();
    const provider = await loader.load({ specifier: 'node:fs' });

    expect(provider).toBeDefined();
    expect((provider as { readFile?: unknown }).readFile).toBeDefined();
  });

  it('shoud return false when checking provider shape of a primitive', () => {
    const loader = new ModuleRuntimeProviderLoader();
    // @ts-expect-error accessing private method for test coverage
    expect(loader.hasProviderShape(1)).toBe(false);
  });

  it('shoud unwrap nested default objects before returning a provider', async () => {
    const provider = {
      supportedAdapterOperationsRegistry: {
        NestedDefaultProvider: class NestedDefaultProvider {},
      },
    };
    const loader = new ModuleRuntimeProviderLoader();
    // @ts-expect-error accessing private method for test coverage
    await expect(
      loader.toProvider({ default: { default: provider } }),
    ).resolves.toBe(provider);
  });

  it('shoud prefer ESM import entrypoint from package exports root when present', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runtime-provider-loader-'));
    const packageDir = join(dir, 'node_modules', 'esm-entry-provider');
    const resolvedFile = join(packageDir, 'dist', 'index.cjs');
    const importEntry = join(packageDir, 'esm', 'index.mjs');

    await mkdir(join(packageDir, 'dist'), { recursive: true });
    await mkdir(join(packageDir, 'esm'), { recursive: true });
    await writeFile(
      join(packageDir, 'package.json'),
      JSON.stringify({
        name: 'esm-entry-provider',
        exports: {
          '.': {
            import: './esm/index.mjs',
            require: './dist/index.cjs',
          },
        },
      }),
      'utf8',
    );
    await writeFile(resolvedFile, 'module.exports = {};', 'utf8');
    await writeFile(importEntry, 'export default {};', 'utf8');

    try {
      const loader = new ModuleRuntimeProviderLoader();
      // @ts-expect-error accessing private method for test coverage
      const resolved = loader.resolveEsmEntryPathFromResolvedFile(resolvedFile);
      expect(resolved).toBe(importEntry);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shoud continue walking when declared import entrypoint is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runtime-provider-loader-'));
    const packageDir = join(dir, 'node_modules', 'missing-esm-entry-provider');
    const resolvedFile = join(packageDir, 'dist', 'index.cjs');

    await mkdir(join(packageDir, 'dist'), { recursive: true });
    await writeFile(
      join(packageDir, 'package.json'),
      JSON.stringify({
        name: 'missing-esm-entry-provider',
        exports: {
          '.': {
            import: './esm/index.mjs',
            require: './dist/index.cjs',
          },
        },
      }),
      'utf8',
    );
    await writeFile(resolvedFile, 'module.exports = {};', 'utf8');

    try {
      const loader = new ModuleRuntimeProviderLoader();
      // @ts-expect-error accessing private method for test coverage
      const resolved = loader.resolveEsmEntryPathFromResolvedFile(resolvedFile);
      expect(resolved).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shoud read string and object entrypoint shapes', () => {
    const loader = new ModuleRuntimeProviderLoader();
    // @ts-expect-error accessing private method for test coverage
    expect(loader.readEntryPoint('./dist/esm/index.js', 'import')).toBe(
      undefined,
    );
    // @ts-expect-error accessing private method for test coverage
    expect(loader.readEntryPoint('./dist/esm/index.js', 'module')).toBe(
      './dist/esm/index.js',
    );
    // @ts-expect-error accessing private method for test coverage
    expect(
      loader.readEntryPoint({ import: './dist/esm/index.js' }, 'import'),
    ).toBe('./dist/esm/index.js');
  });

  it('shoud throw when module does not export a runtime provider', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runtime-provider-loader-'));
    const providerPath = join(dir, 'provider.cjs');

    await writeFile(providerPath, 'module.exports = 1;', 'utf8');

    try {
      const loader = new ModuleRuntimeProviderLoader();

      await expect(loader.load({ specifier: providerPath })).rejects.toThrow(
        'Module does not export a valid runtime provider',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shoud throw when a provider factory resolves to an invalid value', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runtime-provider-loader-'));
    const providerPath = join(dir, 'provider.cjs');

    await writeFile(
      providerPath,
      'module.exports = { runtimeProvider: () => 1 };',
      'utf8',
    );

    try {
      const loader = new ModuleRuntimeProviderLoader();

      await expect(loader.load({ specifier: providerPath })).rejects.toThrow(
        'Module does not export a valid runtime provider',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
