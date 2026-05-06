import {
  GraphPlugin,
  type GraphPluginBuildInput,
  type GraphPluginBuildResult,
} from '../GraphPlugin.js';
import { DeriveProjectionGraph } from '../Rules/Node/DeriveProjectionGraph.js';

export type ProjectionCorePluginOptions = {
  strategies: unknown[];
};

export class ProjectionCorePlugin extends GraphPlugin<ProjectionCorePluginOptions> {
  constructor() {
    super('projection.core', { strategies: [] });
  }

  public override build({
    options,
  }: GraphPluginBuildInput<ProjectionCorePluginOptions>): GraphPluginBuildResult {
    return {
      phases: [
        {
          phase: 'main',
          rules: [
            new DeriveProjectionGraph({
              node: { any: true },
              options,
            }),
          ],
        },
      ],
    };
  }
}
