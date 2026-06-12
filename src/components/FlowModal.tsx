import { useEffect, useRef, useState } from 'react';
import type {
  AgentType,
  Category,
  Flow,
  ScheduleType,
  TriggerType,
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
import {
  DEFAULT_HOOK_DEBOUNCE_SECONDS,
  DEFAULT_HOOK_EVENT,
  HOOK_PROVIDER_OPTIONS,
  TRIGGER_TYPE_LABELS,
  buildHookTrigger,
  joinPathPatterns,
} from '../lib/triggers';
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
    title: 'Lance Codex avec sandbox danger-full-access, approval never et exec',
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
  const [triggerType, setTriggerType] = useState<TriggerType>(
    existing?.triggerType ?? (existing?.hookTrigger ? 'hook' : 'schedule'),
  );
  const [hookEvent, setHookEvent] = useState(existing?.hookTrigger?.event ?? DEFAULT_HOOK_EVENT);
  const [hookProvider, setHookProvider] = useState(existing?.hookTrigger?.provider ?? 'any');
  const [hookPaths, setHookPaths] = useState(joinPathPatterns(existing?.hookTrigger?.paths));
  const [hookDebounce, setHookDebounce] = useState(
    String(existing?.hookTrigger?.debounceSeconds ?? DEFAULT_HOOK_DEBOUNCE_SECONDS),
  );
  const [catId, setCatId] = useState<string>(existingCategoryId ?? '');

  const [errors, setErrors] = useState<{ name?: boolean; prompt?: boolean; hookEvent?: boolean }>({});

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
    setHookPaths('');
  };

  const submit = () => {
    const trimmedName = name.trim();
    const trimmedPrompt = prompt.trim();
    const newErrors: typeof errors = {};
    if (!trimmedName) newErrors.name = true;
    if (!trimmedPrompt) newErrors.prompt = true;
    if (triggerType === 'hook' && !hookEvent.trim()) newErrors.hookEvent = true;
    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }

    const schedule = buildScheduleData(scheduleType, time, intervalHours, days);
    const flow: Flow = {
      id: existing?.id ?? generateId(),
      name: trimmedName,
      prompt: trimmedPrompt,
      agent,
      cwd: cwd || undefined,
      schedule,
      triggerType,
      hookTrigger:
        triggerType === 'hook'
          ? buildHookTrigger(hookEvent, hookProvider, hookPaths, hookDebounce)
          : undefined,
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
            <span>Trigger</span>
            <select
              className="flow-modal-select"
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as TriggerType)}
            >
              {Object.entries(TRIGGER_TYPE_LABELS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {triggerType === 'schedule' && (
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
          )}

          {triggerType === 'schedule' && chips.time && (
            <div className="flow-modal-chip">
              <input
                type="time"
                className="flow-modal-time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          )}

          {triggerType === 'schedule' && chips.interval && (
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

          {triggerType === 'schedule' && chips.days && (
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

          {triggerType === 'hook' && (
            <>
              <div className="flow-modal-chip">
                <span>Event</span>
                <input
                  className={`flow-modal-chip-input${errors.hookEvent ? ' flow-modal-error' : ''}`}
                  value={hookEvent}
                  placeholder={DEFAULT_HOOK_EVENT}
                  onChange={(e) => {
                    setHookEvent(e.target.value);
                    if (errors.hookEvent) setErrors((s) => ({ ...s, hookEvent: false }));
                  }}
                />
              </div>

              <div className="flow-modal-chip">
                <span>Source</span>
                <select
                  className="flow-modal-select"
                  value={hookProvider}
                  onChange={(e) => setHookProvider(e.target.value)}
                >
                  {HOOK_PROVIDER_OPTIONS.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flow-modal-chip flow-modal-chip-wide">
                <span>Paths</span>
                <input
                  className="flow-modal-chip-input flow-modal-chip-input-wide"
                  value={hookPaths}
                  placeholder="src/**/*.ts, src/**/*.tsx"
                  onChange={(e) => setHookPaths(e.target.value)}
                />
              </div>

              <div className="flow-modal-chip">
                <span>Debounce</span>
                <input
                  type="number"
                  min={0}
                  className="flow-modal-number"
                  value={hookDebounce}
                  onChange={(e) => setHookDebounce(e.target.value)}
                />
                <span>s</span>
              </div>
            </>
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
