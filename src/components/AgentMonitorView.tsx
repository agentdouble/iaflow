import { useCallback, useEffect, useState } from 'react';
import type {
  AgentMonitorAgent,
  AgentMonitorSnapshot,
} from '../../electron/shared/types';

const REFRESH_MS = 2000;

export function AgentMonitorView() {
  const [snapshot, setSnapshot] = useState<AgentMonitorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await window.api.agents.list();
    setSnapshot(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, REFRESH_MS);

    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const agents = snapshot?.agents || [];

  return (
    <div className="agent-monitor">
      <div className="agent-monitor-header">
        <div>
          <h2 className="flow-title">Agents</h2>
          <p className="agent-monitor-subtitle">
            Processus headless detectes sur cette machine.
          </p>
        </div>
        <div className="agent-monitor-actions">
          <span className="agent-monitor-count">{agents.length} en cours</span>
          <button className="flow-add-btn" onClick={() => void refresh()}>
            Rafraichir
          </button>
        </div>
      </div>

      {snapshot?.errors.length ? (
        <div className="agent-monitor-errors">
          {snapshot.errors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="flow-empty">Chargement des agents...</div>
      ) : agents.length === 0 ? (
        <div className="flow-empty">Aucun agent headless en cours.</div>
      ) : (
        <div className="agent-monitor-list">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentMonitorAgent }) {
  const label = buildAgentLabel(agent);

  return (
    <article className="agent-card">
      <div className="agent-card-header">
        <div className="agent-card-title-block">
          <div className="agent-card-title-row">
            <span className="agent-live-dot" />
            <h3 className="agent-card-title">{label}</h3>
          </div>
          <div className="agent-card-meta">
            <span>{agent.agent}</span>
            <span>PID {agent.pids.join(', ')}</span>
            {agent.startedAt ? <span>Depuis {formatDateTime(agent.startedAt)}</span> : null}
            {agent.logUpdatedAt ? (
              <span>Log {formatDateTime(agent.logUpdatedAt)}</span>
            ) : null}
          </div>
        </div>
        <span className="agent-status-pill">En cours</span>
      </div>

      <div className="agent-path-grid">
        {agent.cwd ? (
          <div>
            <span>cwd</span>
            <code>{agent.cwd}</code>
          </div>
        ) : null}
        {agent.logFile ? (
          <div>
            <span>log</span>
            <code>{agent.logFile}</code>
          </div>
        ) : null}
      </div>

      <div className="agent-log-box">
        {agent.lastLogLines.length ? (
          <pre>{agent.lastLogLines.join('\n')}</pre>
        ) : (
          <div className="agent-log-empty">Aucun log lisible pour ce processus.</div>
        )}
      </div>

      <details className="agent-command">
        <summary>Commande</summary>
        <code>{agent.command}</code>
      </details>
    </article>
  );
}

function buildAgentLabel(agent: AgentMonitorAgent): string {
  if (agent.taskId && agent.title) return `${agent.taskId} - ${agent.title}`;
  if (agent.worktreeName) return agent.worktreeName;
  if (agent.cwd) return agent.cwd.split('/').filter(Boolean).at(-1) || agent.cwd;
  return `Agent ${agent.pids[0]}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
