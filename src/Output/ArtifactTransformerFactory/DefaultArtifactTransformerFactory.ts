import { ArtifactTransformer } from '../ArtifactTransformer.js';
import {
  DotCliArtifactTransformer,
  DotCliRunProcess,
} from '../ArtifactTransformer/DotCliArtifactTransformer.js';
import {
  ArtifactTransformerFactory,
  ArtifactTransformerFactoryInput,
  ArtifactTransformerOptions,
} from '../ArtifactTransformerFactory.js';

export type DefaultArtifactTransformerFactoryOptions = {
  dotCliRunProcess?: DotCliRunProcess;
};

export class DefaultArtifactTransformerFactory
  implements ArtifactTransformerFactory
{
  constructor(
    private readonly options: DefaultArtifactTransformerFactoryOptions = {},
  ) {}

  public create(input: ArtifactTransformerFactoryInput): ArtifactTransformer {
    const transformerName = input.name.trim().toLowerCase();
    if (transformerName === 'dotcli') {
      return this.createDotCliTransformer(input.options);
    }

    throw new Error(`Unsupported transformer '${input.name}'`);
  }

  private createDotCliTransformer(
    options?: ArtifactTransformerOptions,
  ): ArtifactTransformer {
    const format = this.readRequiredStringOption('dotcli', 'format', options);
    const executable = this.readOptionalStringOption('executable', options);
    const dotArgs = this.resolveDotArgs(options);

    return new DotCliArtifactTransformer({
      format,
      executable,
      dotArgs: dotArgs.length > 0 ? dotArgs : undefined,
      runProcess: this.options.dotCliRunProcess,
    });
  }

  private resolveDotArgs(options?: ArtifactTransformerOptions): string[] {
    if (!options) {
      return [];
    }

    const dotArgs = [
      ...this.readStringListOption('dotArg', options),
      ...this.readStringListOption('dotArgs', options),
      ...this.readStringListOption('arg', options),
      ...this.readStringListOption('args', options),
    ];
    for (const [key, value] of Object.entries(options)) {
      if (
        key === 'format' ||
        key === 'executable' ||
        key === 'dotArg' ||
        key === 'dotArgs' ||
        key === 'arg' ||
        key === 'args'
      ) {
        continue;
      }

      for (const item of this.toStringList(value)) {
        dotArgs.push(`-${key}=${item}`);
      }
    }

    return dotArgs;
  }

  private readRequiredStringOption(
    transformerName: string,
    optionName: string,
    options?: ArtifactTransformerOptions,
  ): string {
    const value = this.readOptionalStringOption(optionName, options);
    if (!value) {
      throw new Error(
        `Transformer '${transformerName}' requires option '${optionName}'`,
      );
    }

    return value;
  }

  private readOptionalStringOption(
    optionName: string,
    options?: ArtifactTransformerOptions,
  ): string | undefined {
    const value = options?.[optionName];
    if (value === undefined) {
      return undefined;
    }

    return this.toStringList(value)[0];
  }

  private readStringListOption(
    optionName: string,
    options?: ArtifactTransformerOptions,
  ): string[] {
    const value = options?.[optionName];
    if (value === undefined) {
      return [];
    }

    return this.toStringList(value);
  }

  private toStringList(value: string | string[]): string[] {
    return Array.isArray(value) ? [...value] : [value];
  }
}
