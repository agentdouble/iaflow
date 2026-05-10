import type { FlowRun } from '../../electron/shared/types';

export const STATUS_LABELS: Record<string, string> = {
  success: 'Succès',
  error: 'Erreur',
};

export function formatRunDateTime(date?: string, timestamp?: string): string {
  if (!timestamp) return date || '';
  try {
    const d = new Date(timestamp);
    return d.toLocaleString('fr-FR', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return timestamp;
  }
}

export function buildDotTooltip(run: FlowRun): string {
  const label = STATUS_LABELS[run.status] || run.status;
  return `${formatRunDateTime(run.date, run.timestamp)} — ${label}\nCliquer pour voir le log`;
}

export function getLastRun(flow: { runs?: FlowRun[] }): FlowRun | null {
  if (!flow.runs?.length) return null;
  return flow.runs[flow.runs.length - 1];
}
