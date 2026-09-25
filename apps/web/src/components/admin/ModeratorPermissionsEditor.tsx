import { useMemo, useState } from 'react';
import {
  SIMPLE_PERMISSION_CATEGORIES,
  SIMPLE_PERMISSION_CATEGORY_ORDER,
  type PermissionKey,
  type SimplePermissionCategory,
} from '@hin/types';
import { ModeratorPermissionMatrix } from './ModeratorPermissionMatrix';

interface ModeratorPermissionsEditorProps {
  initialKeys: PermissionKey[];
  onSave: (keys: PermissionKey[]) => Promise<void>;
  onCancel: () => void;
  saving?: boolean;
  saveLabel?: string;
}

function bundleFullySelected(selected: Set<PermissionKey>, category: SimplePermissionCategory): boolean {
  const bundle = SIMPLE_PERMISSION_CATEGORIES[category];
  return bundle.length > 0 && bundle.every((k) => selected.has(k));
}

function bundlePartiallySelected(selected: Set<PermissionKey>, category: SimplePermissionCategory): boolean {
  const bundle = SIMPLE_PERMISSION_CATEGORIES[category];
  const count = bundle.filter((k) => selected.has(k)).length;
  return count > 0 && count < bundle.length;
}

export function ModeratorPermissionsEditor({
  initialKeys,
  onSave,
  onCancel,
  saving = false,
  saveLabel = 'Save changes',
}: ModeratorPermissionsEditorProps) {
  const [selected, setSelected] = useState<PermissionKey[]>(initialKeys);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggleCategory = (category: SimplePermissionCategory, enabled: boolean) => {
    const bundle = SIMPLE_PERMISSION_CATEGORIES[category];
    setSelected((prev) => {
      const next = new Set(prev);
      if (enabled) bundle.forEach((k) => next.add(k));
      else bundle.forEach((k) => next.delete(k));
      return [...next];
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border-custom bg-bg-primary/30 p-3 space-y-2">
        <p className="text-[11px] font-semibold text-text-muted uppercase">Access areas</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SIMPLE_PERMISSION_CATEGORY_ORDER.map((category) => {
            const full = bundleFullySelected(selectedSet, category);
            const partial = bundlePartiallySelected(selectedSet, category);
            return (
              <label
                key={category}
                className="flex items-center gap-2 rounded-lg border border-border-custom px-3 py-2 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={full}
                  ref={(el) => {
                    if (el) el.indeterminate = partial && !full;
                  }}
                  onChange={(e) => toggleCategory(category, e.target.checked)}
                />
                <span className="font-medium text-text-primary">{category}</span>
              </label>
            );
          })}
        </div>
      </div>

      <details className="rounded-xl border border-border-custom p-3">
        <summary className="text-xs font-semibold text-indigo-400 cursor-pointer select-none">
          Advanced permissions
        </summary>
        <div className="mt-3 pt-3 border-t border-border-custom">
          <ModeratorPermissionMatrix
            selectedKeys={selected}
            onSelectedKeysChange={setSelected}
            showPresets
            showFooter={false}
          />
        </div>
      </details>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-2 text-xs rounded-lg border border-border-custom cursor-pointer">
          Cancel
        </button>
        <button
          type="button"
          disabled={saving || selected.length === 0}
          onClick={() => void onSave(selected)}
          className="px-3 py-2 text-xs rounded-lg bg-indigo-600 text-white font-semibold disabled:opacity-50 cursor-pointer"
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
}
