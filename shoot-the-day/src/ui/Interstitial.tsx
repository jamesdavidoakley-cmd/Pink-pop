import type { SceneDef, SceneResult } from '../game/types';

export function Interstitial({
  next,
  last,
  onGo,
}: {
  next: SceneDef | null;
  last: SceneResult | null;
  onGo: () => void;
}) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#14110d]/92 backdrop-blur-[2px]">
      <div className="w-[520px] max-w-[86%] text-center">
        {last && (
          <p className="text-[13px] uppercase tracking-[0.2em] text-[#efe7da]/45">
            {last.title} · {last.framesUsed}/{last.framesTotal} frames · {last.keepers} keeper
            {last.keepers === 1 ? '' : 's'} · {last.beats.filter((b) => b.hit).length}/{last.beats.length} beats
          </p>
        )}
        {next ? (
          <>
            <h2 className="mt-6 text-4xl font-semibold tracking-tight">{next.title}</h2>
            <p className="mt-2 text-[15px] text-[#efe7da]/60">{next.subtitle}</p>
            <button
              onClick={onGo}
              className="mt-8 rounded-sm border border-[#efe7da]/25 px-6 py-2 text-sm uppercase tracking-[0.18em] transition hover:border-[#c4614e] hover:text-[#c4614e]"
            >
              Go — Space
            </button>
          </>
        ) : (
          <>
            <h2 className="mt-6 text-4xl font-semibold tracking-tight">That’s the day</h2>
            <button
              onClick={onGo}
              className="mt-8 rounded-sm border border-[#efe7da]/25 px-6 py-2 text-sm uppercase tracking-[0.18em] transition hover:border-[#c4614e] hover:text-[#c4614e]"
            >
              See the contact sheet — Space
            </button>
          </>
        )}
      </div>
    </div>
  );
}
