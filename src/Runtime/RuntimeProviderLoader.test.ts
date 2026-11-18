import {
  RuntimeProviderLoadInput,
  RuntimeProviderLoader,
} from './RuntimeProviderLoader.js';

describe('RuntimeProviderLoader.load', () => {
  it('shoud allow implementations to load runtime providers from a specifier', async () => {
    class CaptureRuntimeProviderLoader implements RuntimeProviderLoader {
      public captured?: RuntimeProviderLoadInput;

      public async load(input: RuntimeProviderLoadInput) {
        this.captured = input;
        return {
          supportedAdapterOperationsRegistry: {},
        };
      }
    }

    const loader = new CaptureRuntimeProviderLoader();
    const input: RuntimeProviderLoadInput = {
      specifier: '@example/runtime-provider',
      sourceReference: '/tmp/runtime.yaml',
    };

    const result = await loader.load(input);

    expect(loader.captured).toEqual(input);
    expect(result).toEqual({
      supportedAdapterOperationsRegistry: {},
    });
  });
});
