import type { Profile } from '../../Graph/Profile.js';
import { isRuleOptionsProvider } from '../../Graph/RuleOptionsProvider.js';
import type { BaseRule } from '../../Graph/Rules/Rule.js';
import {
  isSemanticDecorator,
  serializeSemanticDecorator,
} from '../../Graph/Semantics.js';
import type {
  ProfileExecutionDescriptor,
  RuntimeDependency,
} from '../ProfileExecutionDescriptor.js';

export class ProfileExecutionDescriptorBuilder {
  public build(
    profile: Profile,
    phases: BaseRule[][],
    dependencies: RuntimeDependency[],
  ): ProfileExecutionDescriptor {
    return this.serialize({
      profileName: profile.name,
      profile: profile.serialize(),
      phases: phases.map((phase) => phase.map((rule) => rule.serialize())),
      dependencies,
    }) as ProfileExecutionDescriptor;
  }

  private serialize(value: unknown): unknown {
    if (
      value === null ||
      ['string', 'boolean', 'number'].includes(typeof value)
    )
      return value;
    if (isRuleOptionsProvider(value)) {
      const options = value.getRuleOptions();
      if (options instanceof Promise) {
        throw new Error(
          'Profile execution requires synchronously available resolved rule options.',
        );
      }
      return this.serialize(options);
    }
    if (isSemanticDecorator(value))
      return this.serialize(serializeSemanticDecorator(value));
    if (Array.isArray(value)) return value.map((item) => this.serialize(item));
    if (
      value &&
      typeof value === 'object' &&
      Object.getPrototypeOf(value) === Object.prototype
    ) {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, item]) => item !== undefined)
          .map(([key, item]) => [key, this.serialize(item)]),
      );
    }
    throw new Error(
      'Profile execution contains unsupported non-JSON configuration.',
    );
  }
}
