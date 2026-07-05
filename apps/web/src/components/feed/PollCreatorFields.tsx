import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import type { PollResultsVisibility } from '@hin/types';

export interface PollDraft {
  question: string;
  options: string[];
  maxSelections: number;
  durationPreset: 'none' | '1d' | '3d' | '7d' | 'custom';
  customEndsAt: string;
  allowVoteChange: boolean;
  allowVoteRetraction: boolean;
  isAnonymous: boolean;
  resultsVisibility: PollResultsVisibility;
}

export const defaultPollDraft = (): PollDraft => ({
  question: '',
  options: ['', ''],
  maxSelections: 1,
  durationPreset: 'none',
  customEndsAt: '',
  allowVoteChange: true,
  allowVoteRetraction: true,
  isAnonymous: false,
  resultsVisibility: 'always',
});

function computeEndsAt(draft: PollDraft): string | null {
  if (draft.durationPreset === 'none') return null;
  if (draft.durationPreset === 'custom') {
    if (!draft.customEndsAt) return null;
    return new Date(draft.customEndsAt).toISOString();
  }
  const now = new Date();
  const days = draft.durationPreset === '1d' ? 1 : draft.durationPreset === '3d' ? 3 : 7;
  now.setDate(now.getDate() + days);
  return now.toISOString();
}

export function validatePollDraft(draft: PollDraft): string | null {
  if (!draft.question.trim()) return 'Enter a poll question or statement';
  const labels = draft.options.map(o => o.trim()).filter(Boolean);
  if (labels.length < 2) return 'Add at least 2 options';
  if (labels.length > 10) return 'Maximum 10 options';
  if (draft.maxSelections < 1) return 'Max selections must be at least 1';
  if (draft.maxSelections > labels.length) {
    return 'Max selections cannot exceed number of options';
  }
  if (draft.durationPreset === 'custom' && draft.customEndsAt) {
    if (new Date(draft.customEndsAt) <= new Date()) {
      return 'End date must be in the future';
    }
  }
  return null;
}

export function pollDraftToApiFields(draft: PollDraft) {
  const labels = draft.options.map(o => o.trim()).filter(Boolean);
  return {
    question: draft.question.trim(),
    options: labels.map(label => ({ label })),
    maxSelections: draft.maxSelections,
    endsAt: computeEndsAt(draft),
    allowVoteChange: draft.allowVoteChange,
    allowVoteRetraction: draft.allowVoteRetraction,
    isAnonymous: draft.isAnonymous,
    resultsVisibility: draft.resultsVisibility,
  };
}

interface PollCreatorFieldsProps {
  draft: PollDraft;
  onChange: (draft: PollDraft) => void;
  showSettings: boolean;
  onToggleSettings: () => void;
}

export function PollCreatorFields({
  draft,
  onChange,
  showSettings,
  onToggleSettings,
}: PollCreatorFieldsProps) {
  const updateOption = (index: number, value: string) => {
    const options = [...draft.options];
    options[index] = value;
    onChange({ ...draft, options });
  };

  const addOption = () => {
    if (draft.options.length >= 10) return;
    onChange({ ...draft, options: [...draft.options, ''] });
  };

  const removeOption = (index: number) => {
    if (draft.options.length <= 2) return;
    const options = draft.options.filter((_, i) => i !== index);
    const maxSelections = Math.min(draft.maxSelections, options.length);
    onChange({ ...draft, options, maxSelections });
  };

  const moveOption = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.options.length) return;
    const options = [...draft.options];
    [options[index], options[target]] = [options[target], options[index]];
    onChange({ ...draft, options });
  };

  const filledCount = draft.options.filter(o => o.trim()).length;
  const isMulti = draft.maxSelections > 1;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
          Question or statement
        </label>
        <textarea
          rows={2}
          value={draft.question}
          onChange={e => onChange({ ...draft, question: e.target.value })}
          placeholder="Ask a question or write a statement…"
          maxLength={500}
          className="w-full bg-bg-primary border border-border-custom rounded-xl p-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors resize-none"
        />
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
          Options
        </label>
        {draft.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              type="text"
              value={opt}
              onChange={e => updateOption(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              maxLength={200}
              className="flex-grow bg-bg-primary border border-border-custom rounded-xl px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors min-h-[44px]"
            />
            <button
              type="button"
              onClick={() => moveOption(i, -1)}
              disabled={i === 0}
              className="p-2 text-text-muted hover:text-text-primary disabled:opacity-30 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Move up"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => moveOption(i, 1)}
              disabled={i === draft.options.length - 1}
              className="p-2 text-text-muted hover:text-text-primary disabled:opacity-30 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Move down"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => removeOption(i)}
              disabled={draft.options.length <= 2}
              className="p-2 text-text-muted hover:text-rose-400 disabled:opacity-30 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Remove option"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        {draft.options.length < 10 && (
          <button
            type="button"
            onClick={addOption}
            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer min-h-[44px] px-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Add option
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onToggleSettings}
        className="flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-text-primary cursor-pointer min-h-[44px]"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
        Poll settings
      </button>

      {showSettings && (
        <div className="space-y-4 bg-bg-primary/50 border border-border-custom/60 rounded-xl p-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-text-muted">Duration</label>
            <select
              value={draft.durationPreset}
              onChange={e =>
                onChange({
                  ...draft,
                  durationPreset: e.target.value as PollDraft['durationPreset'],
                })
              }
              className="w-full bg-bg-primary border border-border-custom rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-indigo-500 min-h-[44px]"
            >
              <option value="none">No expiry</option>
              <option value="1d">1 day</option>
              <option value="3d">3 days</option>
              <option value="7d">7 days</option>
              <option value="custom">Custom date</option>
            </select>
            {draft.durationPreset === 'custom' && (
              <input
                type="datetime-local"
                value={draft.customEndsAt}
                onChange={e => onChange({ ...draft, customEndsAt: e.target.value })}
                className="w-full bg-bg-primary border border-border-custom rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-indigo-500 min-h-[44px] mt-1.5"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-text-muted">Selection mode</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...draft, maxSelections: 1 })}
                className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer min-h-[44px] ${
                  !isMulti
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                    : 'border-border-custom text-text-muted hover:border-border-custom'
                }`}
              >
                Single choice
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...draft,
                    maxSelections: Math.min(Math.max(2, draft.maxSelections), filledCount || 2),
                  })
                }
                className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer min-h-[44px] ${
                  isMulti
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                    : 'border-border-custom text-text-muted hover:border-border-custom'
                }`}
              >
                Multiple choice
              </button>
            </div>
            {isMulti && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-text-muted">Pick up to</span>
                <input
                  type="number"
                  min={2}
                  max={filledCount || draft.options.length}
                  value={draft.maxSelections}
                  onChange={e =>
                    onChange({
                      ...draft,
                      maxSelections: Math.max(2, parseInt(e.target.value, 10) || 2),
                    })
                  }
                  className="w-16 bg-bg-primary border border-border-custom rounded-lg px-2 py-1 text-sm text-text-primary text-center min-h-[44px]"
                />
                <span className="text-xs text-text-muted">options</span>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={draft.allowVoteChange}
              onChange={e => onChange({ ...draft, allowVoteChange: e.target.checked })}
              className="rounded border-border-custom"
            />
            <span className="text-xs text-text-secondary">Allow changing vote</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={draft.allowVoteRetraction}
              onChange={e => onChange({ ...draft, allowVoteRetraction: e.target.checked })}
              className="rounded border-border-custom"
            />
            <span className="text-xs text-text-secondary">Allow removing vote</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={draft.isAnonymous}
              onChange={e => onChange({ ...draft, isAnonymous: e.target.checked })}
              className="rounded border-border-custom"
            />
            <span className="text-xs text-text-secondary">Anonymous voting</span>
          </label>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-text-muted">Results visibility</label>
            <div className="space-y-1">
              {(
                [
                  ['always', 'Always show results'],
                  ['after_vote', 'Show after I vote'],
                  ['after_close', 'Show when poll closes'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                  <input
                    type="radio"
                    name="resultsVisibility"
                    checked={draft.resultsVisibility === value}
                    onChange={() => onChange({ ...draft, resultsVisibility: value })}
                    className="border-border-custom"
                  />
                  <span className="text-xs text-text-secondary">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
