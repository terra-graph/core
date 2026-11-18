import { RuntimeCatalog } from './RuntimeCatalog.js';
import type {
  RuntimeCatalogBuildInput,
  RuntimeCatalogBuilder,
} from './RuntimeCatalogBuilder.js';

describe('RuntimeCatalogBuilder.build', () => {
  it('shoud allow implementations to consume runtime build input', () => {
    class CaptureBuilder implements RuntimeCatalogBuilder {
      public captured?: RuntimeCatalogBuildInput;

      public build(input: RuntimeCatalogBuildInput): RuntimeCatalog {
        this.captured = input;
        return new RuntimeCatalog();
      }
    }

    const builder = new CaptureBuilder();
    const input: RuntimeCatalogBuildInput = {
      config: {
        profiles: {
          profile: {
            phases: [],
          },
        },
      },
    };

    const catalog = builder.build(input);

    expect(catalog).toBeInstanceOf(RuntimeCatalog);
    expect(builder.captured).toEqual(input);
  });
});
