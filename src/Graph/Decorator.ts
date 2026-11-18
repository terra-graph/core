import { TgGraph } from './TgGraph.js';

// Decorators must be immutable: do not mutate the input graph or nested objects.
export interface GraphDecorator<TInput = unknown> {
  decorate(graph: Readonly<TgGraph>, input: TInput): TgGraph;
}
