import { CONTROLS, LESSONS } from './lessons';

export function Title({ onStart, last }: { onStart: () => void; last: number | null }) {
  return (
    <div className="grid h-full place-items-center bg-[#14110d]">
      <div className="w-[880px] max-w-[92%]">
        <p className="text-[12px] uppercase tracking-[0.3em] text-[#c4614e]">Reportage wedding photography</p>
        <h1 className="mt-3 text-[68px] font-semibold leading-[0.95] tracking-tight">Shoot The Day</h1>
        <p className="mt-5 max-w-[60ch] text-[17px] leading-relaxed text-[#efe7da]/65">
          One venue, three scenes, about eight minutes. You are the photographer. You can move, crouch, raise the camera
          and shoot. You cannot pose anybody, ask anybody to do it again, or buy another card.
        </p>

        <div className="mt-9 grid grid-cols-2 gap-10">
          <div>
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-[#efe7da]/40">The five things</h2>
            <ol className="mt-3 space-y-1.5 text-[14px]">
              {LESSONS.map((l) => (
                <li key={l.n} className="flex gap-3">
                  <span className="w-4 shrink-0 text-[#c4614e] tabular-nums">{l.n}</span>
                  <span>
                    <strong className="font-semibold">{l.title}.</strong>{' '}
                    <span className="text-[#efe7da]/60">{l.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-[#efe7da]/40">Controls</h2>
            <div className="mt-3 space-y-1.5 text-[14px] text-[#efe7da]/55">
              {CONTROLS.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-6">
                  <span className="text-[#efe7da]/85">{k}</span>
                  <span className="text-right">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 flex items-center gap-6">
          <button
            onClick={onStart}
            className="rounded-sm border border-[#efe7da]/30 px-8 py-3 text-sm uppercase tracking-[0.2em] transition hover:border-[#c4614e] hover:text-[#c4614e]"
          >
            Start the day
          </button>
          {last !== null && <span className="text-[13px] text-[#efe7da]/40">Last day: {last}/100</span>}
        </div>
      </div>
    </div>
  );
}
