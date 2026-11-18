import type { SerializedProfile } from '../Graph/Profile.js';
import type { SerializedRule } from '../Graph/Rules/RuleConfig.js';

export type RuntimeDependency = { name: string; version: string };
export type ProfileExecutionDescriptor = {
  profileName: string;
  profile: SerializedProfile;
  phases: SerializedRule[][];
  dependencies: RuntimeDependency[];
};
