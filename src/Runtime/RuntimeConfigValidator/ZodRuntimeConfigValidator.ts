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

const runOutputSchema = z
  .object({
    renderer: z.string().min(1).optional(),
    options: z.record(z.string(), z.unknown()).optional(),
    transformers: z.array(z.string().min(1)).optional(),
    outWriter: z.enum(['stdout', 'file']).optional(),
    outFile: z.string().min(1).optional(),
  })
  .strict();

const pluginRefSchema = z
  .object({
    plugin: z.string().min(1),
    options: z.unknown().optional(),
  })
  .strict();

const serializedRuntimeProfileSchema = z
  .object({
    supports: z.string().min(1).optional(),
    render: renderSchema.optional(),
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
