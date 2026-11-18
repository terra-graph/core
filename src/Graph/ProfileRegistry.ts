import { Profile } from './Profile.js';

type ProfileFactory = () => Profile;
export type ProfileDefinition = Profile | ProfileFactory;
export type ProfileDefinitions = Record<string, ProfileDefinition>;

export class ProfileRegistry {
  private readonly definitions: Record<string, ProfileFactory>;

  constructor(
    definitions: ProfileDefinitions = {},
    factories?: Record<string, ProfileFactory>,
  ) {
    this.definitions = Object.freeze(
      factories ?? ProfileRegistry.toFactories(definitions),
    );
  }

  public static from(registries: ProfileRegistry[]): ProfileRegistry {
    return registries.reduce(
      (combined, registry) => combined.use(registry),
      new ProfileRegistry(),
    );
  }

  public register(
    name: string,
    definition: ProfileDefinition,
  ): ProfileRegistry {
    return ProfileRegistry.fromFactories({
      ...this.definitions,
      [name]: ProfileRegistry.toFactory(definition),
    });
  }

  public registerMany(definitions: ProfileDefinitions): ProfileRegistry {
    const nextFactories = {
      ...this.definitions,
      ...ProfileRegistry.toFactories(definitions),
    };
    return ProfileRegistry.fromFactories(nextFactories);
  }

  public use(registry: ProfileRegistry): ProfileRegistry {
    return ProfileRegistry.fromFactories({
      ...this.definitions,
      ...registry.definitions,
    });
  }

  public resolve(name: string): Profile {
    const factory = this.definitions[name];
    if (!factory) {
      throw new Error(`Profile '${name}' is not registered`);
    }
    const profile = factory();
    if (profile.name !== name) {
      throw new Error(
        `Profile registry key '${name}' does not match profile.name '${profile.name}'`,
      );
    }
    return profile;
  }

  public names(): string[] {
    return Object.keys(this.definitions);
  }

  private static fromFactories(
    definitions: Record<string, ProfileFactory>,
  ): ProfileRegistry {
    return new ProfileRegistry({}, { ...definitions });
  }

  private static toFactories(
    definitions: ProfileDefinitions,
  ): Record<string, ProfileFactory> {
    return Object.fromEntries(
      Object.entries(definitions).map(([name, definition]) => [
        name,
        ProfileRegistry.toFactory(definition),
      ]),
    );
  }

  private static toFactory(definition: ProfileDefinition): ProfileFactory {
    if (typeof definition === 'function') {
      return definition;
    }
    return () => definition;
  }
}
