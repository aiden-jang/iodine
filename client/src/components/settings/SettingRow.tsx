import type React from 'react';
import { getSettingDefinition, useSettings, type SettingDefinition, type SettingKey, type SettingsValues } from '../../settings';

const inputStyle: React.CSSProperties = {
  background: 'var(--color-bg-sidebar)',
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border)',
  borderRadius: 3,
  padding: '3px 6px',
  fontSize: 13,
  minWidth: 200,
};

interface ControlProps {
  id: string;
  def: SettingDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

/** One renderer per setting type — add a case here when adding a new type to the schema. */
function SettingControl({ id, def, value, onChange }: ControlProps) {
  switch (def.type) {
    case 'boolean':
      return <input id={id} type="checkbox" checked={value === true} onChange={e => onChange(e.currentTarget.checked)} />;
    case 'number':
      return (
        <input
          id={id} type="number" style={inputStyle}
          value={Number(value)} min={def.min} max={def.max} step={def.step}
          onChange={e => { const n = e.currentTarget.valueAsNumber; if (Number.isFinite(n)) onChange(n); }}
        />
      );
    case 'string':
      return (
        <input
          id={id} type="text" style={inputStyle}
          value={String(value)} placeholder={def.placeholder}
          onChange={e => onChange(e.currentTarget.value)}
        />
      );
    case 'select':
      return (
        <select id={id} style={inputStyle} value={String(value)} onChange={e => onChange(e.currentTarget.value)}>
          {def.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
  }
}

export function SettingRow({ settingKey }: { settingKey: SettingKey }) {
  const { values, setSetting, resetSetting, isModified } = useSettings();
  const def = getSettingDefinition(settingKey);
  const modified = isModified(settingKey);
  const id = `setting-${settingKey}`;
  const onChange = (value: unknown) => setSetting(settingKey, value as SettingsValues[SettingKey]);

  const description = def.description && (
    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{def.description}</span>
  );

  return (
    <div
      data-setting-key={settingKey}
      style={{
        padding: '10px 12px',
        marginBottom: 4,
        borderLeft: `2px solid ${modified ? 'var(--color-accent, #0e639c)' : 'transparent'}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600 }}>{def.label}</label>
        <code style={{ fontSize: 11, color: 'var(--color-text-secondary)', opacity: 0.7 }}>{settingKey}</code>
        {modified && (
          <button
            onClick={() => resetSetting(settingKey)}
            title="Reset to default"
            style={{ marginLeft: 'auto', border: 'none', background: 'none', color: 'var(--color-accent, #3794ff)', fontSize: 11, cursor: 'pointer' }}
          >
            Reset
          </button>
        )}
      </div>

      {def.type === 'boolean' ? (
        <label htmlFor={id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
          <SettingControl id={id} def={def} value={values[settingKey]} onChange={onChange} />
          {description}
        </label>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
          {description}
          <SettingControl id={id} def={def} value={values[settingKey]} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
