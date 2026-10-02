/**
 * Settings registry — the single source of truth for every user setting.
 *
 * To add a setting, add an entry to SETTINGS (and a section to SETTINGS_SECTIONS
 * if it belongs to a new group). The Settings page, persistence, validation and
 * the typed `useSetting` hook are all derived from this file.
 *
 * Keys are namespaced as `<section>.<name>` (e.g. `editor.vimMode`).
 */

export const SETTINGS_SECTIONS = [
  { id: 'editor', label: 'Editor' },
  { id: 'voice', label: 'Voice' },
  { id: 'assistant', label: 'Assistant' },
  { id: 'privacy', label: 'Privacy' },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id'];

interface BaseSetting<T> {
  label: string;
  description?: string;
  section: SettingsSectionId;
  default: T;
}

export interface BooleanSetting extends BaseSetting<boolean> {
  type: 'boolean';
}

export interface NumberSetting extends BaseSetting<number> {
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
}

export interface StringSetting extends BaseSetting<string> {
  type: 'string';
  placeholder?: string;
}

export interface SelectSetting extends BaseSetting<string> {
  type: 'select';
  options: ReadonlyArray<{ value: string; label: string }>;
}

export type SettingDefinition = BooleanSetting | NumberSetting | StringSetting | SelectSetting;

export const SETTINGS = {
  'editor.vimMode': {
    type: 'boolean',
    section: 'editor',
    label: 'Vim Mode',
    description:
      'Enable Vim keybindings in all editor tabs by default. The per-tab "Enable/Disable Vim" button still overrides this for individual tabs.',
    default: false,
  },
  'voice.ttsProvider': {
    type: 'select',
    section: 'voice',
    label: 'Voice Memo provider',
    description:
      'AI provider used for the Voice Memo feature (the speaker icon on assistant messages). This controls text-to-speech only — it does not affect the live meeting, which always uses Gemini Live.',
    options: [
      { value: 'google', label: 'Google (Gemini)' },
      { value: 'openai', label: 'OpenAI' },
    ],
    default: 'google',
  },
  'proactive.churnDetection': {
    type: 'boolean',
    section: 'assistant',
    label: 'Proactive churn detection',
    description:
      'Automatically offer help when the assistant detects you have been active for a while without producing much output. When off, the progress watch (which reviews your actual git diff after an AI reply) still runs.',
    default: false,
  },
  'privacy.redactSecrets': {
    type: 'boolean',
    section: 'privacy',
    label: 'Redact Secrets',
    description:
      'Mask API keys, tokens and passwords as [REDACTED:***] before anything is sent to the AI. When on, the AI only sees masked values and may write the mask back if it edits those lines — turn this off before asking it to edit files that contain secrets.',
    default: true,
  },
} satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof SETTINGS;
/** Widened from the definition's `type` (a literal `default: false` still yields `boolean`). */
type ValueForType<T extends SettingDefinition['type']> =
  T extends 'boolean' ? boolean : T extends 'number' ? number : string;
export type SettingValue<K extends SettingKey> = ValueForType<(typeof SETTINGS)[K]['type']>;
export type SettingsValues = { [K in SettingKey]: SettingValue<K> };

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function getSettingDefinition(key: SettingKey): SettingDefinition {
  return SETTINGS[key];
}

export function getDefaultSettings(): SettingsValues {
  const values = {} as Record<SettingKey, unknown>;
  for (const key of SETTING_KEYS) values[key] = SETTINGS[key].default;
  return values as SettingsValues;
}

/** Guards against stale or hand-edited persisted values. */
export function isValidSettingValue(def: SettingDefinition, value: unknown): boolean {
  switch (def.type) {
    case 'boolean': return typeof value === 'boolean';
    case 'number':  return typeof value === 'number' && Number.isFinite(value);
    case 'string':  return typeof value === 'string';
    case 'select':  return typeof value === 'string' && def.options.some(o => o.value === value);
  }
}
