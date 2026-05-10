import { useEffect, useState } from 'react';
import type { Flow, FlowRun } from '../../electron/shared/types';
import { LiveTerminal } from './LiveTerminal';
import { STATUS_LABELS, formatRunDateTime } from '../lib/format';

interface Props {
  flow: Flow;
  run: FlowRun;
  onClose: () => void;
}

export function LogModal({ flow, run, onClose }: Props) {
  const [log, setLog] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (run.logTimestamp) {
      window.api.flow.getRunLog(flow.id, run.logTimestamp).then((data) => {
        if (!cancelled) setLog(data ?? '\r\n  Log non disponible.\r\n');
      });
    } else {
      setLog('\r\n  Log non disponible.\r\n');
    }
    return () => {
      cancelled = true;
    };
  }, [flow.id, run.logTimestamp]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="flow-modal-overlay" onClick={onClose}>
      <div className="flow-log-modal" onClick={(e) => e.stopPropagation()}>
        <div className="flow-log-header">
          <span className="flow-log-title">
            {flow.name} — {formatRunDateTime(run.date, run.timestamp)}
          </span>
          <span className={`flow-log-status flow-log-status-${run.status}`}>
            {STATUS_LABELS[run.status] || run.status}
          </span>
          <button className="flow-log-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="flow-log-terminal">
          {log !== null && <LiveTerminal initialContent={log} scrollback={5000} />}
        </div>
      </div>
    </div>
  );
}
