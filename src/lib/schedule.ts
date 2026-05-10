import type { Schedule, ScheduleType } from '../../electron/shared/types';

export const SCHEDULE_LABELS: Record<ScheduleType, string> = {
  interval: 'Intervalle',
  daily: 'Tous les jours',
  weekdays: 'Jours de la semaine',
  custom: 'Personnalisé',
};

export const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
export const WEEKDAY_INDICES = [1, 2, 3, 4, 5];
export const INTERVAL_HOURS = [1, 2, 3, 4, 6, 8, 12];
export const DEFAULT_TIME = '09:00';

export const SCHEDULE_CHIPS: Record<ScheduleType, { time: boolean; interval: boolean; days: boolean }> = {
  interval: { time: false, interval: true, days: false },
  daily: { time: true, interval: false, days: false },
  weekdays: { time: true, interval: false, days: false },
  custom: { time: true, interval: false, days: true },
};

export function buildScheduleData(
  type: ScheduleType,
  timeValue: string,
  intervalValue: string | number,
  selectedDays: Set<number>,
): Schedule {
  const time = timeValue || DEFAULT_TIME;
  switch (type) {
    case 'interval':
      return { type, intervalHours: parseInt(String(intervalValue), 10) || 1 };
    case 'daily':
      return { type, time };
    case 'weekdays':
      return { type, time };
    case 'custom':
      return { type, time, days: [...selectedDays].sort() };
  }
}

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
      return schedule.days?.length
        ? `${schedule.days.map((d) => DAY_NAMES[d]).join(', ')} à ${schedule.time || '00:00'}`
        : `${SCHEDULE_LABELS.custom} à ${schedule.time || '00:00'}`;
    default:
      return 'Non planifié';
  }
}
