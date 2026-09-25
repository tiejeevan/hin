import { useMemo, useState } from 'react';
import {
  DEFAULT_MODERATOR_PERMISSIONS,
  MODERATOR_PRESETS,
  PERMISSION_CATALOG,
  type ModeratorPresetKey,
  type PermissionKey,
} from '@hin/types';

interface ModeratorPermissionMatrixProps {
  initialKeys?: PermissionKey[];
  selectedKeys?: PermissionKey[];
  onSelectedKeysChange?: (keys: PermissionKey[]) => void;
  onSave?: (keys: PermissionKey[]) => Promise<void>;
  onCancel?: () => void;
  saving?: boolean;
  showPresets?: boolean;
  showFooter?: boolean;
}

const DANGEROUS = new Set<PermissionKey>([
  'user.ban',
  'user.suspend',
  'user.restrict',
  'post.remove',
  'comment.remove',
  'moderator.view',
  'moderator.activity',
]);

export function ModeratorPermissionMatrix({
  initialKeys = [],
  selectedKeys: controlledKeys,
  onSelectedKeysChange,
  onSave,
  onCancel,
  saving = false,
  showPresets = true,
  showFooter = true,
}: ModeratorPermissionMatrixProps) {
  const [internalSelected, setInternalSelected] = useState<Set<PermissionKey>>(new Set(initialKeys));
  const [preset, setPreset] = useState<ModeratorPresetKey>('custom');

  const isControlled = controlledKeys !== undefined && onSelectedKeysChange !== undefined;
  const selected = useMemo(
    () => (isControlled ? new Set(controlledKeys) : internalSelected),
    [isControlled, controlledKeys, internalSelected],
  );

  const setSelected = (next: Set<PermissionKey>) => {
    if (isControlled) onSelectedKeysChange([...next]);
    else setInternalSelected(next);
  };

  const byCategory = useMemo(() => {
    const map = new Map<string, typeof PERMISSION_CATALOG>();
    for (const entry of PERMISSION_CATALOG) {
      if (entry.comingSoon) continue;
      const list = map.get(entry.category) ?? [];
      list.push(entry);
      map.set(entry.category, list);
    }
    return map;
  }, []);

  const toggle = (key: PermissionKey) => {
    setPreset('custom');
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const applyPreset = (p: Exclude<ModeratorPresetKey, 'custom'>) => {
    setPreset(p);
    setSelected(new Set(MODERATOR_PRESETS[p].keys));
  };

  return (
    <div className="space-y-4">
      {showPresets && (
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-[11px] text-text-muted font-semibold uppercase">Preset</label>
          <select
            value={preset}
            onChange={(e) => {
              const v = e.target.value as ModeratorPresetKey;
              if (v === 'custom') setPreset('custom');
              else applyPreset(v);
            }}
            className="text-xs rounded-lg border border-border-custom bg-bg-primary/40 px-2 py-1.5"
          >
            <option value="custom">Custom</option>
            {(Object.keys(MODERATOR_PRESETS) as Exclude<ModeratorPresetKey, 'custom'>[]).map((k) => (
              <option key={k} value={k}>{MODERATOR_PRESETS[k].label}</option>
            ))}
          </select>
          <button type="button" onClick={() => setSelected(new Set(DEFAULT_MODERATOR_PERMISSIONS))} className="text-[11px] px-2 py-1 rounded border border-border-custom cursor-pointer">
            Safe baseline
          </button>
          <button type="button" onClick={() => setSelected(new Set(PERMISSION_CATALOG.filter((p) => !p.comingSoon).map((p) => p.key)))} className="text-[11px] px-2 py-1 rounded border border-border-custom cursor-pointer">
            Select all
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-[11px] px-2 py-1 rounded border border-border-custom cursor-pointer">
            Clear all
          </button>
        </div>
      )}

      {[...byCategory.entries()].map(([category, entries]) => (
        <div key={category} className="border border-border-custom rounded-xl p-3">
          <p className="text-xs font-bold text-text-primary mb-2">{category}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {entries.map((entry) => (
              <label
                key={entry.key}
                className={`flex items-start gap-2 text-xs cursor-pointer ${DANGEROUS.has(entry.key) ? 'text-rose-300' : 'text-text-secondary'}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(entry.key)}
                  onChange={() => toggle(entry.key)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">{entry.name}</span>
                  <span className="block text-[10px] text-text-muted">{entry.key}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}

      {showFooter && onSave && onCancel && (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-2 text-xs rounded-lg border border-border-custom cursor-pointer">Cancel</button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave([...selected])}
            className="px-3 py-2 text-xs rounded-lg bg-indigo-600 text-white font-semibold disabled:opacity-50 cursor-pointer"
          >
            Save changes
          </button>
        </div>
      )}
    </div>
  );
}
