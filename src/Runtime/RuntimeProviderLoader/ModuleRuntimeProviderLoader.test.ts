import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ModuleRuntimeProviderLoader,
  __test__,
} from './ModuleRuntimeProviderLoader.js';

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
    const provider = {} as Parameters<typeof __test__.toProvider>[0];

    await expect(__test__.toProvider(provider)).resolves.toBe(provider);
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

  it('shoud accept non-file specifiers unchanged', async () => {
    const loader = new ModuleRuntimeProviderLoader();
    const provider = await loader.load({ specifier: 'node:fs' });

    expect(provider).toBeDefined();
    expect((provider as { readFile?: unknown }).readFile).toBeDefined();
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
