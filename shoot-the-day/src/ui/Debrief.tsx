import { useMemo } from 'react';
import { gradeDay } from '../game/grade';
import { TUNING } from '../game/tuning';
import { Thumb } from './Thumb';
import type { SceneDef, SceneResult, Shot } from '../game/types';

const THUMB_W = 116;

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className={`text-[26px] font-semibold tabular-nums ${tone ?? ''}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#efe7da]/40">{label}</div>
    </div>
  );
}

export function Debrief({
  shots,
  results,
  scenes,
  onReplay,
}: {
  shots: Shot[];
  results: SceneResult[];
  scenes: SceneDef[];
  onReplay: () => void;
}) {
  const grade = useMemo(() => gradeDay(shots, results), [shots, results]);
  const sceneById = useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes]);
  const best = useMemo(() => {
    const top = [...shots].sort((a, b) => b.score - a.score).slice(0, 6).map((s) => s.id);
    return new Set(top);
  }, [shots]);

  return (
    <div className="h-full overflow-y-auto bg-[#14110d]">
      <div className="mx-auto w-[1100px] max-w-[94%] px-2 py-10">
        <header className="flex items-end justify-between border-b border-[#efe7da]/12 pb-6">
          <div>
            <h1 className="text-[13px] uppercase tracking-[0.26em] text-[#efe7da]/45">End of day</h1>
            <p className="mt-2 text-4xl font-semibold tracking-tight">{grade.band}</p>
            <p className="mt-2 max-w-[46ch] text-[15px] text-[#efe7da]/60">{grade.verdict}</p>
          </div>
          <div className="text-right">
            <div className="text-[64px] font-semibold leading-none tabular-nums text-[#c4614e]">{Math.round(grade.grade)}</div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-[#efe7da]/40">the day, out of 100</div>
          </div>
        </header>

        <section className="mt-7 grid grid-cols-5 gap-6 border-b border-[#efe7da]/12 pb-7">
          <Stat label="frames used" value={`${grade.framesUsed}/${grade.framesTotal}`} />
          <Stat label={`keepers (over ${TUNING.score.keeperScore})`} value={String(grade.keepers)} />
          <Stat label="empty frames" value={String(grade.emptyFrames)} tone={grade.emptyFrames > 4 ? 'text-[#c4614e]' : ''} />
          <Stat label="posed frames" value={String(grade.posedFrames)} tone={grade.posedFrames > 3 ? 'text-[#c4614e]' : ''} />
          <Stat
            label="must-get beats"
            value={`${grade.beatsHit}/${grade.beatsTotal}`}
            tone={grade.beatsHit < grade.beatsTotal ? 'text-[#c4614e]' : ''}
          />
        </section>

        {grade.missed.length > 0 && (
          <section className="mt-6 border-l-2 border-[#c4614e] pl-4">
            <h3 className="text-[11px] uppercase tracking-[0.18em] text-[#c4614e]">
              Missed, −{TUNING.score.missedBeatPenalty} each
            </h3>
            <ul className="mt-2 space-y-1 text-[15px] text-[#efe7da]/75">
              {grade.missed.map((m, i) => (
                <li key={i}>
                  {m.label} <span className="text-[#efe7da]/40">— {m.scene}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {results.map((r) => {
          const scene = sceneById.get(r.sceneId)!;
          const frames = shots.filter((s) => s.sceneId === r.sceneId);
          return (
            <section key={r.sceneId} className="mt-10">
              <h2 className="flex items-baseline gap-3 border-b border-[#efe7da]/10 pb-2">
                <span className="text-[13px] uppercase tracking-[0.22em]">{r.title}</span>
                <span className="text-[13px] text-[#efe7da]/40">
                  {r.framesUsed}/{r.framesTotal} frames · {r.keepers} keeper{r.keepers === 1 ? '' : 's'} ·{' '}
                  {r.beats.filter((b) => b.hit).length}/{r.beats.length} must-gets
                </span>
              </h2>
              {frames.length === 0 ? (
                <p className="mt-4 text-[15px] text-[#efe7da]/40">You did not take a single frame.</p>
              ) : (
                <div className="mt-5 grid grid-cols-6 gap-x-5 gap-y-7">
                  {frames.map((s) => (
                    <figure key={s.id}>
                      <div
                        className={`relative ${
                          best.has(s.id) ? 'outline outline-2 outline-offset-[3px] outline-[#c4614e]' : ''
                        }`}
                      >
                        <Thumb shot={s} scene={scene} width={THUMB_W} />
                        <span className="absolute bottom-1 right-1 rounded-[2px] bg-black/60 px-1 text-[10px] font-semibold tabular-nums">
                          {Math.round(s.score)}
                        </span>
                      </div>
                      <figcaption className="mt-2 text-[11.5px] leading-[1.35] text-[#efe7da]/55">{s.critique}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </section>
          );
        })}

        <footer className="mt-12 flex items-center justify-between border-t border-[#efe7da]/12 pt-7">
          <p className="max-w-[52ch] text-[13px] text-[#efe7da]/45">
            The day is the unit. There is no level select and no bigger card. Shoot it again, earlier and lower.
          </p>
          <button
            onClick={onReplay}
            className="rounded-sm border border-[#efe7da]/25 px-6 py-2.5 text-sm uppercase tracking-[0.18em] transition hover:border-[#c4614e] hover:text-[#c4614e]"
          >
            Replay the day
          </button>
        </footer>
      </div>
    </div>
  );
}
