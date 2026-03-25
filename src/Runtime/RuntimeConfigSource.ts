import { extname } from 'node:path';

export type RuntimeConfigDocument = {
  content: string;
  format?: string;
  reference?: string;
};

export interface RuntimeConfigSource {
  read(): Promise<RuntimeConfigDocument>;
}

export const normalizeRuntimeConfigFormat = (format: string): string =>
  format.trim().toLowerCase();

export const inferRuntimeConfigFormatFromReference = (
  reference: string | undefined,
): string | undefined => {
  if (!reference) {
    return undefined;
  }
  const extension = normalizeRuntimeConfigFormat(extname(reference));
  if (extension === '.json') {
    return 'json';
  }
  if (extension === '.yaml' || extension === '.yml') {
    return 'yaml';
  }
  return undefined;
};
