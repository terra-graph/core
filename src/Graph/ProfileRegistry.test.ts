import { Profile } from './Profile.js';
import { ProfileRegistry } from './ProfileRegistry.js';

describe('ProfileRegistry.resolve', () => {
  it('shoud resolve a named profile instance', () => {
    const profile = new Profile('example.profile', {});
    const registry = new ProfileRegistry({
      'example.profile': profile,
    });

    expect(registry.resolve('example.profile')).toBe(profile);
  });

  it('shoud resolve a fresh instance each time for a named profile factory', () => {
    const registry = new ProfileRegistry({
      'factory.profile': () => new Profile('factory.profile', {}),
    });

    const first = registry.resolve('factory.profile');
    const second = registry.resolve('factory.profile');

    expect(first).not.toBe(second);
    expect(first.name).toBe(second.name);
  });

  it('shoud throw when a named profile is not registered', () => {
    const registry = new ProfileRegistry();

    expect(() => registry.resolve('doesNotExist')).toThrow(
      "Profile 'doesNotExist' is not registered",
    );
  });

  it('shoud throw when registry key and profile name do not match', () => {
    const registry = new ProfileRegistry({
      'expected.profile': new Profile('wrong.profile', {}),
    });

    expect(() => registry.resolve('expected.profile')).toThrow(
      "Profile registry key 'expected.profile' does not match profile.name 'wrong.profile'",
    );
  });
});

describe('ProfileRegistry.register', () => {
  it('shoud return a new registry without mutating the original', () => {
    const base = new ProfileRegistry({
      'one.profile': new Profile('one.profile', {}),
    });

    const next = base.register('two.profile', new Profile('two.profile', {}));

    expect(base.names()).toEqual(['one.profile']);
    expect(next.names()).toEqual(['one.profile', 'two.profile']);
  });
});

describe('ProfileRegistry.registerMany', () => {
  it('shoud return a new registry with merged definitions', () => {
    const base = new ProfileRegistry({
      'one.profile': new Profile('one.profile', {}),
    });

    const next = base.registerMany({
      'two.profile': () => new Profile('two.profile', {}),
    });

    expect(base.names()).toEqual(['one.profile']);
    expect(next.names()).toEqual(['one.profile', 'two.profile']);
    expect(next.resolve('two.profile')).not.toBe(next.resolve('two.profile'));
  });
});

describe('ProfileRegistry.use', () => {
  it('shoud combine registries immutably', () => {
    const one = new ProfileRegistry({
      'one.profile': new Profile('one.profile', {}),
    });
    const two = new ProfileRegistry({
      'two.profile': new Profile('two.profile', {}),
    });

    const combined = one.use(two);

    expect(one.names()).toEqual(['one.profile']);
    expect(two.names()).toEqual(['two.profile']);
    expect(combined.names()).toEqual(['one.profile', 'two.profile']);
  });
});

describe('ProfileRegistry.from', () => {
  it('shoud combine an array of registries', () => {
    const one = new ProfileRegistry({
      'one.profile': new Profile('one.profile', {}),
    });
    const two = new ProfileRegistry({
      'two.profile': new Profile('two.profile', {}),
    });

    const combined = ProfileRegistry.from([one, two]);

    expect(combined.names()).toEqual(['one.profile', 'two.profile']);
  });

  it('shoud prefer later registries when names collide', () => {
    const one = new ProfileRegistry({
      'shared.profile': new Profile('shared.profile', {
        phases: [{ phase: 'main', rules: [] }],
      }),
    });
    const two = new ProfileRegistry({
      'shared.profile': new Profile('shared.profile', {
        phases: [{ phase: 'final', rules: [] }],
      }),
    });

    const combined = ProfileRegistry.from([one, two]);
    const resolved = combined.resolve('shared.profile');

    expect(resolved.serialize().phases).toEqual([
      { phase: 'final', rules: [] },
    ]);
  });
});
