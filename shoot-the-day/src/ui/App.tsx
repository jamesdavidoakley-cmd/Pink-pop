import { useState } from 'react';
import { GameView } from './GameView';
import { Title } from './Title';
import { Debrief } from './Debrief';
import { gradeDay } from '../game/grade';
import type { SceneDef, SceneResult, Shot } from '../game/types';

type Phase = 'title' | 'day' | 'debrief';

const LAST_KEY = 'shoot-the-day:last';

function readLast(): number | null {
  try {
    const v = sessionStorage.getItem(LAST_KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

export function App() {
  const [phase, setPhase] = useState<Phase>('title');
  const [run, setRun] = useState(0);
  const [last, setLast] = useState<number | null>(readLast);
  const [day, setDay] = useState<{ shots: Shot[]; results: SceneResult[]; scenes: SceneDef[] } | null>(null);

  return (
    <div className="h-full">
      {phase === 'title' && (
        <Title
          last={last}
          onStart={() => {
            setRun((r) => r + 1);
            setPhase('day');
          }}
        />
      )}
      {phase === 'day' && (
        <GameView
          key={run}
          onFinish={(shots, results, scenes) => {
            const g = Math.round(gradeDay(shots, results).grade);
            setLast(g);
            try {
              sessionStorage.setItem(LAST_KEY, String(g));
            } catch {
              /* private mode: the day just isn't remembered */
            }
            setDay({ shots, results, scenes: [...scenes] });
            setPhase('debrief');
          }}
        />
      )}
      {phase === 'debrief' && day && (
        <Debrief
          shots={day.shots}
          results={day.results}
          scenes={day.scenes}
          onReplay={() => {
            setRun((r) => r + 1);
            setDay(null);
            setPhase('day');
          }}
        />
      )}
    </div>
  );
}
