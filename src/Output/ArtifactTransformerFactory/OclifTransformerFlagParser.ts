import {
  ArtifactTransformerOptionValue,
  ArtifactTransformerOptions,
} from '../ArtifactTransformerFactory.js';

export type TransformerFlagOptions = Record<string, ArtifactTransformerOptions>;

export class OclifTransformerFlagParser {
  public stripOptionFlags(argv: string[]): string[] {
    const stripped: string[] = [];

    for (let index = 0; index < argv.length; index += 1) {
      const token = argv[index];
      if (!this.isTransformerOptionFlag(token)) {
        stripped.push(token);
        continue;
      }

      const equalsIndex = token.indexOf('=');
      if (
        equalsIndex < 0 &&
        index + 1 < argv.length &&
        !argv[index + 1].startsWith('--')
      ) {
        index += 1;
      }
    }

    return stripped;
  }

  public parse(argv: string[]): TransformerFlagOptions {
    const options: TransformerFlagOptions = {};

    for (let index = 0; index < argv.length; index += 1) {
      const token = argv[index];
      if (!token.startsWith('--transformer-')) {
        continue;
      }
      if (token === '--transformer' || token.startsWith('--transformer=')) {
        continue;
      }

      const equalsIndex = token.indexOf('=');
      const flag = equalsIndex >= 0 ? token.slice(0, equalsIndex) : token;
      const match = /^--transformer-([A-Za-z0-9_-]+)-([A-Za-z0-9_-]+)$/.exec(
        flag,
      );
      if (!match) {
        continue;
      }

      let value = equalsIndex >= 0 ? token.slice(equalsIndex + 1) : undefined;
      if (
        value === undefined &&
        index + 1 < argv.length &&
        !argv[index + 1].startsWith('--')
      ) {
        value = argv[index + 1];
        index += 1;
      }

      const [, transformerName, optionName] = match;
      this.addOption(options, transformerName, optionName, value ?? 'true');
    }

    return options;
  }

  private isTransformerOptionFlag(token: string): boolean {
    if (!token.startsWith('--transformer-')) {
      return false;
    }
    if (token === '--transformer' || token.startsWith('--transformer=')) {
      return false;
    }

    const equalsIndex = token.indexOf('=');
    const flag = equalsIndex >= 0 ? token.slice(0, equalsIndex) : token;
    return /^--transformer-([A-Za-z0-9_-]+)-([A-Za-z0-9_-]+)$/.test(flag);
  }

  private addOption(
    options: TransformerFlagOptions,
    transformerName: string,
    optionName: string,
    optionValue: string,
  ): void {
    if (!options[transformerName]) {
      options[transformerName] = {};
    }

    const transformerOptions = options[transformerName];
    const current = transformerOptions[optionName];
    if (current === undefined) {
      transformerOptions[optionName] = optionValue;
      return;
    }

    transformerOptions[optionName] = this.mergeOptionValues(
      current,
      optionValue,
    );
  }

  private mergeOptionValues(
    current: ArtifactTransformerOptionValue,
    next: string,
  ): string[] {
    if (Array.isArray(current)) {
      return [...current, next];
    }

    return [current, next];
  }
}
