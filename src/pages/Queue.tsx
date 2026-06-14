import { useApp } from '../hooks/useApp';
import QueueCard from '../components/QueueCard';

export default function Queue() {
  const { queue } = useApp();

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="mb-2 text-2xl font-bold text-white">Queue</h1>
      <p className="mb-6 text-sm text-gray-400">
        Generate voiceovers and video clips, then upload your final edited video for posting.
      </p>

      {queue.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 px-6 py-16 text-center text-sm text-gray-500">
          No scripts in the queue yet. Add some from the Scripts page.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {queue.map((item) => (
            <QueueCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
