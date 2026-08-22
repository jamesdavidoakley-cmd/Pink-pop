import { CONTROLS, LESSONS } from './lessons';

export function Pause({ onResume }: { onResume: () => void }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#14110d]/93">
      <div className="w-[620px] max-w-[90%]">
        <h2 className="text-[13px] uppercase tracking-[0.22em] text-[#efe7da]/45">The five things</h2>
        <ol className="mt-4 space-y-2">
          {LESSONS.map((l) => (
            <li key={l.n} className="flex gap-3">
              <span className="w-5 shrink-0 text-[#c4614e] tabular-nums">{l.n}</span>
              <span>
                <strong className="font-semibold">{l.title}.</strong>{' '}
                <span className="text-[#efe7da]/65">{l.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-7 grid grid-cols-2 gap-x-8 gap-y-1 border-t border-[#efe7da]/12 pt-5 text-[13px] text-[#efe7da]/55">
          {CONTROLS.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <span className="text-[#efe7da]/80">{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
        <button
          onClick={onResume}
          className="mt-7 rounded-sm border border-[#efe7da]/25 px-5 py-2 text-sm uppercase tracking-[0.18em] transition hover:border-[#c4614e] hover:text-[#c4614e]"
        >
          Back to it — Esc
        </button>
      </div>
    </div>
  );
}
