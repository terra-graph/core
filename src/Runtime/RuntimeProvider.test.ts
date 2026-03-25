import { RuntimeProvider } from './RuntimeProvider.js';

describe('RuntimeProvider', () => {
  it('shoud allow catalog and adapter contributions in one object', () => {
    const provider: RuntimeProvider = {
      supportedAdapterOperationsRegistry: {},
    };

    expect(provider).toEqual({
      supportedAdapterOperationsRegistry: {},
    });
  });
});
