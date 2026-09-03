import { z } from 'zod';
import { NAMED_PHASES } from '../../Graph/Rules/RulePlan.js';
import { SerializedRuntimeConfig } from '../RuntimeCatalogLoader.js';
import { RuntimeConfigValidator } from '../RuntimeConfigValidator.js';

const namedRuleRefSchema = z.object({ namedRule: z.string().min(1) }).strict();
const namedRuleSetRefSchema = z
  .object({
    namedRuleSet: z.string().min(1),
  })
  .strict();
const serializedRuleSchema = z
  .object({
    id: z.string().min(1),
    config: z.object({}).passthrough(),
  })
  .strict();

const phaseRuleSchema = z.union([
  serializedRuleSchema,
  namedRuleRefSchema,
  namedRuleSetRefSchema,
]);

const namedPhaseSchema = z.enum(NAMED_PHASES);

const phasePlanSchema = z.array(
  z
    .object({
      phase: namedPhaseSchema,
      rules: z.array(phaseRuleSchema),
    })
    .strict(),
);

const renderSchema = z
  .object({
    renderer: z.string().min(1).optional(),
    options: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const metadataSchema = z
  .object({
    version: z
      .object({
        id: z.string().min(1).optional(),
        parentId: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    environment: z
      .object({
        name: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    terraform: z
      .object({
        workspace: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    source: z
      .object({
        ref: z.string().min(1).optional(),
        commit: z.string().min(1).optional(),
        repository: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    labels: z.record(z.string(), z.string()).optional(),
    tool: z
      .object({
        terraGraphCliVersion: z.string().min(1).optional(),
        terraGraphCoreVersion: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const runOutputSchema = z
  .object({
    renderer: z.string().min(1).optional(),
    options: z.record(z.string(), z.unknown()).optional(),
    transformers: z.array(z.string().min(1)).optional(),
    writer: z.string().min(1),
    writerOptions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.writer !== 'file') {
      return;
    }

    const target = value.writerOptions?.target;
    if (typeof target !== 'string' || target.trim().length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "run.outputs[].writerOptions.target is required when writer is 'file'",
        path: ['writerOptions', 'target'],
      });
    }
  });

const pluginRefSchema = z
  .object({
    plugin: z.string().min(1),
    options: z.unknown().optional(),
    slot: z.string().min(1).optional(),
  })
  .strict();

const serializedRuntimeProfileSchema = z
  .object({
    supports: z.string().min(1).optional(),
    render: renderSchema.optional(),
    metadata: metadataSchema.optional(),
    phases: phasePlanSchema.optional(),
    plugins: z.array(pluginRefSchema).optional(),
    usesProfiles: z.array(z.string().min(1)).optional(),
  })
  .strict();

const serializedRuleSetSchema = z
  .object({
    name: z.string().optional(),
    rules: z.array(phaseRuleSchema).optional(),
  })
  .strict();

const serializedRuntimeConfigSchema = z
  .object({
    providers: z.array(z.string().min(1)).optional(),
    namedRules: z.record(z.string(), serializedRuleSchema).optional(),
    namedRuleSets: z.record(z.string(), serializedRuleSetSchema).optional(),
    profiles: z.record(z.string(), serializedRuntimeProfileSchema).optional(),
    run: z
      .object({
        profile: z.string().min(1),
        metadata: metadataSchema.optional(),
        outputs: z.array(runOutputSchema).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export class ZodRuntimeConfigValidator<
  TOptions extends Record<string, unknown> = Record<string, unknown>,
> implements RuntimeConfigValidator<TOptions>
{
  public validate(input: unknown): SerializedRuntimeConfig<TOptions> {
    return serializedRuntimeConfigSchema.parse(
      input,
    ) as SerializedRuntimeConfig<TOptions>;
  }
}
