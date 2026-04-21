import z from 'zod';
import {
  TerraformShowModule,
  TerraformShowModuleSchema,
  TfShowDecoratorBase,
} from './TfShowDecoratorBase.js';

const TerraformStateShowSchema = z.object({
  values: z.object({
    root_module: TerraformShowModuleSchema,
  }),
});

export type TerraformStateShowJson = z.infer<typeof TerraformStateShowSchema>;

export class TfStateDecorator extends TfShowDecoratorBase<
  TerraformStateShowJson,
  TerraformStateShowJson
> {
  protected readonly source = 'state_show' as const;
  protected readonly decoratorName = 'TfStateDecorator';

  protected parsePayload(raw: unknown): TerraformStateShowJson {
    const parsed = TerraformStateShowSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `TfStateDecorator received unsupported Terraform state show shape: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }

  protected resolveRootModule(
    parsed: TerraformStateShowJson,
  ): TerraformShowModule {
    return parsed.values.root_module;
  }
}
