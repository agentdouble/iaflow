import { useEffect, useState } from 'react';
import type { Flow, FlowRun } from '../../electron/shared/types';
import { formatSchedule } from '../lib/schedule';
import { buildDotTooltip, getLastRun } from '../lib/format';
import { LiveTerminal } from './LiveTerminal';

const MAX_VISIBLE_RUNS = 5;

interface Props {
  flow: Flow;
  catId: string;
  ptyId?: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onShowLog: (run: FlowRun) => void;
  onRun: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

function PastLogTerminal({ flow, run }: { flow: Flow; run: FlowRun }) {
  const [log, setLog] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (run.logTimestamp) {
      window.api.flow.getRunLog(flow.id, run.logTimestamp).then((data) => {
        if (!cancelled) setLog(data ?? '\r\n  Log non disponible pour ce run.\r\n');
      });
    } else {
      setLog('\r\n  Log non disponible pour ce run.\r\n');
    }
    return () => {
      cancelled = true;
    };
  }, [flow.id, run.logTimestamp]);
  if (log === null) return null;
  return <LiveTerminal initialContent={log} scrollback={5000} />;
}

export function FlowCard({
  flow,
  catId,
  ptyId,
  isExpanded,
  onToggleExpand,
  onShowLog,
  onRun,
  onToggle,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
}: Props) {
  const isRunning = !!ptyId;
  const lastRun = getLastRun(flow);

  const cardClasses = [
    'flow-card',
    !flow.enabled && 'flow-card-disabled',
    isRunning && 'flow-card-running',
    isExpanded && 'flow-card-expanded',
  ]
    .filter(Boolean)
    .join(' ');

  const handleHeaderClick = () => {
    if (isRunning) {
      onToggleExpand();
      return;
    }
    if (!flow.runs?.length) {
      onEdit();
      return;
    }
    onToggleExpand();
  };

  return (
    <div
      className={cardClasses}
      data-flow-id={flow.id}
      data-cat-id={catId}
      draggable
      onDragStart={(e) => {
        onDragStart();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', flow.id);
      }}
      onDragEnd={onDragEnd}
    >
      <div className="flow-card-header" onClick={handleHeaderClick}>
        <div className="flow-card-info">
          <div className="flow-card-name-row">
            <span className="flow-card-name">{flow.name}</span>
            {isRunning && <span className="flow-running-badge">En cours...</span>}
            {isRunning && (
              <button
                className="flow-output-toggle"
                title={isExpanded ? 'Masquer la sortie' : 'Afficher la sortie'}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand();
                }}
              >
                {isExpanded ? '▾ Sortie' : '▸ Sortie'}
              </button>
            )}
          </div>
          <div className="flow-card-schedule">{formatSchedule(flow.schedule)}</div>
        </div>

        <div className="flow-card-right">
          <div className="flow-card-dots">
            {(flow.runs || []).slice(-MAX_VISIBLE_RUNS).map((run, i) => (
              <button
                key={`${run.timestamp}-${i}`}
                className={`flow-dot flow-dot-${run.status}`}
                title={buildDotTooltip(run)}
                onClick={(e) => {
                  e.stopPropagation();
                  onShowLog(run);
                }}
              />
            ))}
          </div>

          <div className="flow-card-actions">
            {!isRunning && (
              <button
                className="flow-card-btn"
                title="Exécuter maintenant"
                onClick={(e) => {
                  e.stopPropagation();
                  onRun();
                }}
              >
                ▶
              </button>
            )}
            <button
              className="flow-card-btn"
              title={flow.enabled ? 'Désactiver' : 'Activer'}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
            >
              {flow.enabled ? '⏸' : '⏵'}
            </button>
            <button
              className="flow-card-btn"
              title="Modifier"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              ✎
            </button>
            <button
              className="flow-card-btn flow-card-btn-danger"
              title="Supprimer"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {isRunning && ptyId && (
        <div className="flow-card-terminal" style={{ display: isExpanded ? '' : 'none' }}>
          <LiveTerminal ptyId={ptyId} />
        </div>
      )}
      {!isRunning && isExpanded && lastRun && (
        <div className="flow-card-terminal">
          <PastLogTerminal flow={flow} run={lastRun} />
        </div>
      )}
    </div>
  );
}
