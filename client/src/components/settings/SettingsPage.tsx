import { useMemo, useState } from 'react';
import { SETTINGS_SECTIONS, SETTING_KEYS, getSettingDefinition, type SettingsSectionId } from '../../settings';
import { SettingRow } from './SettingRow';

/** Settings editor tab. Sections and rows are generated from the settings schema. */
export function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(SETTINGS_SECTIONS[0].id);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const visibleKeys = useMemo(() => SETTING_KEYS.filter(key => {
    const def = getSettingDefinition(key);
    if (q) return [key, def.label, def.description ?? ''].some(s => s.toLowerCase().includes(q));
    return def.section === activeSection;
  }), [q, activeSection]);

  const heading = q
    ? `Search results (${visibleKeys.length})`
    : SETTINGS_SECTIONS.find(s => s.id === activeSection)?.label;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--color-bg-editor)', color: 'var(--color-text-primary)' }}>
      <nav style={{ width: 180, flexShrink: 0, borderRight: '1px solid var(--color-border)', padding: '16px 0', overflowY: 'auto' }}>
        {SETTINGS_SECTIONS.map(section => {
          const active = !q && section.id === activeSection;
          return (
            <button
              key={section.id}
              onClick={() => { setQuery(''); setActiveSection(section.id); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '6px 16px',
                fontSize: 13, border: 'none', cursor: 'pointer',
                color: 'var(--color-text-primary)',
                background: active ? 'var(--color-bg-selected)' : 'none',
              }}
            >
              {section.label}
            </button>
          );
        })}
      </nav>

      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '16px 24px' }}>
        <input
          type="search"
          placeholder="Search settings"
          value={query}
          onChange={e => setQuery(e.currentTarget.value)}
          style={{
            width: '100%', maxWidth: 520, boxSizing: 'border-box', padding: '5px 8px', fontSize: 13,
            background: 'var(--color-bg-sidebar)', color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)', borderRadius: 3,
          }}
        />
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: '20px 0 8px' }}>{heading}</h2>
        {visibleKeys.length === 0
          ? <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>No settings found.</p>
          : visibleKeys.map(key => <SettingRow key={key} settingKey={key} />)}
      </div>
    </div>
  );
}
