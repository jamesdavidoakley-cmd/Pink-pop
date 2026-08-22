import { useEffect, useRef, useState } from 'react';
import { Runner, type RunnerSnapshot } from '../game/runner';
import { TUNING } from '../game/tuning';
import { Interstitial } from './Interstitial';
import { Pause } from './Pause';
import type { SceneResult, Shot } from '../game/types';

export function GameView({
  onFinish,
}: {
  onFinish: (shots: Shot[], results: SceneResult[], scenes: Runner['scenes']) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runnerRef = useRef<Runner | null>(null);
  const [snap, setSnap] = useState<RunnerSnapshot | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const runner = new Runner();
    runnerRef.current = runner;
    runner.onState = setSnap;
    runner.onFinish = (shots, results) => onFinish(shots, results, runner.scenes);
    runner.attach(canvas);
    canvas.focus();
    setSnap({
      phase: 'playing',
      sceneIndex: 0,
      sceneCount: runner.scenes.length,
      scene: runner.scenes[0]!,
      paused: false,
      lastResult: null,
    });
    return () => runner.dispose();
    // one runner per mount; replaying remounts via a key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runner = runnerRef.current;
  const nextScene = snap && snap.sceneIndex + 1 < snap.sceneCount ? runner?.scenes[snap.sceneIndex + 1] ?? null : null;

  return (
    <div className="grid h-full place-items-center bg-[#14110d]">
      <div
        className="relative"
        style={{
          width: `min(100vw, calc(100vh * ${TUNING.view.width / TUNING.view.height}))`,
          aspectRatio: `${TUNING.view.width} / ${TUNING.view.height}`,
        }}
      >
        <canvas ref={canvasRef} tabIndex={0} className="h-full w-full outline-none" style={{ imageRendering: 'auto' }} />
        {snap?.phase === 'interstitial' && (
          <Interstitial next={nextScene} last={snap.lastResult} onGo={() => runnerRef.current?.advance()} />
        )}
        {snap?.paused && <Pause onResume={() => runnerRef.current?.togglePause()} />}
      </div>
    </div>
  );
}
