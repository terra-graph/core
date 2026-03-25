import { RuntimeProvider } from './RuntimeProvider.js';

export type RuntimeProviderLoadInput = {
  specifier: string;
  sourceReference?: string;
};

export interface RuntimeProviderLoader {
  load(input: RuntimeProviderLoadInput): Promise<RuntimeProvider>;
}
