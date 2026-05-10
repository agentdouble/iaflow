import type { Flow, FlowRun, Schedule, ScheduleType } from './types';

const MS_PER_HOUR = 3_600_000;

export function getLastRun(flow: Flow): FlowRun | null {
  if (!flow.runs?.length) return null;
  return flow.runs[flow.runs.length - 1];
}

const DAY_FILTERS: Record<string, (day: number, schedule: Schedule) => boolean> = {
  weekdays: (day) => day !== 0 && day !== 6,
  custom: (day, schedule) => !schedule.days || schedule.days.includes(day),
  daily: () => true,
};

function isTimeMatch(schedule: Schedule, now: Date): boolean {
  if (!schedule.time) return false;
  const [h, m] = schedule.time.split(':').map(Number);
  return now.getHours() === h && now.getMinutes() === m;
}

function notRunToday(lastRun: FlowRun | null, now: Date): boolean {
  return !lastRun || lastRun.date !== now.toISOString().slice(0, 10);
}

export function shouldRun(flow: Flow, now: Date): boolean {
  const { schedule } = flow;
  if (!schedule) return false;

  const lastRun = getLastRun(flow);

  if (schedule.type === 'interval') {
    const intervalMs = (schedule.intervalHours || 1) * MS_PER_HOUR;
    return !lastRun || now.getTime() - new Date(lastRun.timestamp).getTime() >= intervalMs;
  }

  if (!isTimeMatch(schedule, now)) return false;
  const filter = DAY_FILTERS[schedule.type] ?? (() => true);
  return filter(now.getDay(), schedule) && notRunToday(lastRun, now);
}

export const SCHEDULE_LABELS: Record<ScheduleType, string> = {
  interval: 'Intervalle',
  daily: 'Tous les jours',
  weekdays: 'Jours de la semaine',
  custom: 'Personnalisé',
};

export const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export function formatSchedule(schedule?: Schedule): string {
  if (!schedule) return 'Non planifié';
  switch (schedule.type) {
    case 'interval':
      return `Toutes les ${schedule.intervalHours || 1}h`;
    case 'daily':
      return `${SCHEDULE_LABELS.daily} à ${schedule.time || '00:00'}`;
    case 'weekdays':
      return `${SCHEDULE_LABELS.weekdays} à ${schedule.time || '00:00'}`;
    case 'custom':
      return schedule.days
        ? `${schedule.days.map((d) => DAY_NAMES[d]).join(', ')} à ${schedule.time || '00:00'}`
        : `${SCHEDULE_LABELS.custom} à ${schedule.time || '00:00'}`;
    default:
      return `${schedule.time || '00:00'}`;
  }
}
