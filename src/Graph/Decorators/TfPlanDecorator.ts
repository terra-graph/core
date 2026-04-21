import z from 'zod';
import {
  TerraformShowModule,
  TerraformShowModuleSchema,
  TfShowDecoratorBase,
} from './TfShowDecoratorBase.js';

const TerraformPlanShowSchema = z.object({
  planned_values: z.object({
    root_module: TerraformShowModuleSchema,
  }),
});

export type TerraformPlanShowJson = z.infer<typeof TerraformPlanShowSchema>;

export class TfPlanDecorator extends TfShowDecoratorBase<
  TerraformPlanShowJson,
  TerraformPlanShowJson
> {
  protected readonly source = 'plan_show' as const;
  protected readonly decoratorName = 'TfPlanDecorator';

  protected parsePayload(raw: unknown): TerraformPlanShowJson {
    const parsed = TerraformPlanShowSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `TfPlanDecorator received unsupported Terraform plan show shape: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }

  protected resolveRootModule(
    parsed: TerraformPlanShowJson,
  ): TerraformShowModule {
    return parsed.planned_values.root_module;
  }
}
