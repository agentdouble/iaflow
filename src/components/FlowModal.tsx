import { useEffect, useRef, useState } from 'react';
import type {
  AgentType,
  Category,
  Flow,
  ScheduleType,
} from '../../electron/shared/types';
import {
  DAY_NAMES,
  DEFAULT_TIME,
  INTERVAL_HOURS,
  SCHEDULE_CHIPS,
  SCHEDULE_LABELS,
  WEEKDAY_INDICES,
  buildScheduleData,
} from '../lib/schedule';
import { generateId } from '../lib/id';

const AGENT_OPTIONS: Record<AgentType, string> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
};

const SKIP_PERM_CONFIG: Partial<Record<AgentType, { label: string; title: string }>> = {
  claude: {
    label: 'Skip permissions',
    title: 'Lance Claude avec --dangerously-skip-permissions',
  },
  codex: {
    label: 'Full auto',
    title: 'Lance Codex avec --approval-mode full-auto au lieu de auto-edit',
  },
};

const DEFAULT_CWD_LABEL = 'Sélectionner un dossier';

export interface FlowModalResult {
  flow: Flow;
  categoryId: string | null;
}

interface Props {
  existing: Flow | null;
  existingCategoryId: string | null;
  categories: Category[];
  onSave: (result: FlowModalResult) => void;
  onClose: () => void;
}

export function FlowModal({
  existing,
  existingCategoryId,
  categories,
  onSave,
  onClose,
}: Props) {
  const [name, setName] = useState(existing?.name ?? '');
  const [prompt, setPrompt] = useState(existing?.prompt ?? '');
  const [cwd, setCwd] = useState<string>(existing?.cwd ?? '');
  const [agent, setAgent] = useState<AgentType>((existing?.agent as AgentType) ?? 'claude');
  const [skipPerm, setSkipPerm] = useState<boolean>(
    !!existing?.dangerouslySkipPermissions,
  );
  const [scheduleType, setScheduleType] = useState<ScheduleType>(
    (existing?.schedule?.type as ScheduleType) ?? 'weekdays',
  );
  const [time, setTime] = useState(existing?.schedule?.time ?? DEFAULT_TIME);
  const [intervalHours, setIntervalHours] = useState(
    existing?.schedule?.intervalHours ?? 1,
  );
  const [days, setDays] = useState<Set<number>>(
    new Set(existing?.schedule?.days ?? WEEKDAY_INDICES),
  );
  const [catId, setCatId] = useState<string>(existingCategoryId ?? '');

  const [errors, setErrors] = useState<{ name?: boolean; prompt?: boolean }>({});

  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const skipPermCfg = SKIP_PERM_CONFIG[agent];
  const chips = SCHEDULE_CHIPS[scheduleType];

  const pickFolder = async () => {
    const folder = await window.api.dialog.openFolder();
    if (folder) setCwd(folder);
  };

  const clearAll = () => {
    setName('');
    setPrompt('');
    setCwd('');
  };

  const submit = () => {
    const trimmedName = name.trim();
    const trimmedPrompt = prompt.trim();
    const newErrors: typeof errors = {};
    if (!trimmedName) newErrors.name = true;
    if (!trimmedPrompt) newErrors.prompt = true;
    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }

    const flow: Flow = {
      id: existing?.id ?? generateId(),
      name: trimmedName,
      prompt: trimmedPrompt,
      agent,
      cwd: cwd || undefined,
      schedule: buildScheduleData(scheduleType, time, intervalHours, days),
      dangerouslySkipPermissions: !!skipPermCfg && skipPerm,
      enabled: existing?.enabled ?? true,
      runs: existing?.runs ?? [],
    };

    onSave({ flow, categoryId: categories.length ? catId || null : null });
  };

  return (
    <div className="flow-modal-overlay" onClick={onClose}>
      <div className="flow-modal" onClick={(e) => e.stopPropagation()}>
        <div className="flow-modal-header">
          <h3>{existing ? 'Modifier le flow' : 'Nouveau flow'}</h3>
          <button className="flow-modal-clear-btn" onClick={clearAll}>
            Clear
          </button>
        </div>

        <div className="flow-modal-group">
          <input
            ref={nameRef}
            className={`flow-modal-input${errors.name ? ' flow-modal-error' : ''}`}
            placeholder="Nom du flow"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((s) => ({ ...s, name: false }));
            }}
          />
        </div>

        <div className="flow-modal-group">
          <textarea
            className={`flow-modal-textarea${errors.prompt ? ' flow-modal-error' : ''}`}
            placeholder={
              "Prompt à envoyer à l'agent...\n\nExemple:\nSummarize yesterday's git activity for standup.\n\nGrounding rules:\n- Anchor statements to commits/PRs/files\n- Keep it scannable and team-ready."
            }
            rows={8}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              if (errors.prompt) setErrors((s) => ({ ...s, prompt: false }));
            }}
          />
        </div>

        {categories.length > 0 && (
          <div className="flow-modal-group" style={{ paddingBottom: 8 }}>
            <div className="flow-modal-chip">
              <span>📁</span>
              <select
                className="flow-modal-select"
                value={catId}
                onChange={(e) => setCatId(e.target.value)}
              >
                <option value="">Sans catégorie</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="flow-modal-bottom">
          <button
            type="button"
            className="flow-modal-chip flow-modal-chip-btn"
            title={cwd || DEFAULT_CWD_LABEL}
            onClick={pickFolder}
          >
            <span>📂</span>
            <span className="flow-modal-chip-label">
              {cwd ? cwd.split('/').pop() : DEFAULT_CWD_LABEL}
            </span>
          </button>

          <div className="flow-modal-chip">
            <span>🤖</span>
            <select
              className="flow-modal-select"
              value={agent}
              onChange={(e) => setAgent(e.target.value as AgentType)}
            >
              {Object.entries(AGENT_OPTIONS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {skipPermCfg && (
            <label
              className="flow-modal-chip flow-modal-chip-toggle"
              title={skipPermCfg.title}
              style={{ cursor: 'pointer', gap: 4 }}
            >
              <input
                type="checkbox"
                checked={skipPerm}
                onChange={(e) => setSkipPerm(e.target.checked)}
              />
              <span style={{ fontSize: 11 }}>{skipPermCfg.label}</span>
            </label>
          )}

          <div className="flow-modal-chip">
            <span>🕐</span>
            <select
              className="flow-modal-select"
              value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value as ScheduleType)}
            >
              {Object.entries(SCHEDULE_LABELS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {chips.time && (
            <div className="flow-modal-chip">
              <input
                type="time"
                className="flow-modal-time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          )}

          {chips.interval && (
            <div className="flow-modal-chip">
              <span style={{ fontSize: 11 }}>Toutes les</span>
              <select
                className="flow-modal-select"
                value={intervalHours}
                onChange={(e) => setIntervalHours(parseInt(e.target.value, 10))}
              >
                {INTERVAL_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h}h
                  </option>
                ))}
              </select>
            </div>
          )}

          {chips.days && (
            <div className="flow-modal-chip flow-modal-days">
              {DAY_NAMES.map((d, idx) => (
                <button
                  key={d}
                  type="button"
                  className={`flow-day-btn${days.has(idx) ? ' active' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setDays((prev) => {
                      const next = new Set(prev);
                      if (next.has(idx)) next.delete(idx);
                      else next.add(idx);
                      return next;
                    });
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flow-modal-actions">
          <button className="flow-modal-btn flow-modal-btn-cancel" onClick={onClose}>
            Annuler
          </button>
          <button className="flow-modal-btn flow-modal-btn-create" onClick={submit}>
            {existing ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}
