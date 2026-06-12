import type { TaskStatus } from '../types';

const STYLES: Record<TaskStatus, string> = {
  idle: 'bg-white/5 text-gray-400 border-white/10',
  pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  generating: 'bg-violet-600/10 text-violet-400 border-violet-600/30 animate-pulse',
  ready: 'bg-green-500/10 text-green-400 border-green-500/30',
  error: 'bg-red-500/10 text-red-400 border-red-500/30',
};

const LABELS: Record<TaskStatus, string> = {
  idle: 'Pending',
  pending: 'Pending',
  generating: 'Generating',
  ready: 'Ready',
  error: 'Error',
};

export default function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
