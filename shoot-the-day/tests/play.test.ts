import { describe, expect, it } from 'vitest';
import { gradeDay } from '../src/game/grade';
import { playDay, reportage, sprayer } from './bots';

describe('definition of done: the two players are clearly separated', () => {
  const spray = playDay(sprayer);
  const shoot = playDay(reportage);
  const gs = gradeDay(spray.shots, spray.results);
  const gr = gradeDay(shoot.shots, shoot.results);

  it('reports what each player did', () => {
    // Kept as a readable record of the tuning that these thresholds guard.
    console.log('sprayer   ', JSON.stringify({ grade: Math.round(gs.grade), keepers: gs.keepers, beats: `${gs.beatsHit}/${gs.beatsTotal}`, frames: gs.framesUsed, empty: gs.emptyFrames, posed: gs.posedFrames }));
    console.log('reportage ', JSON.stringify({ grade: Math.round(gr.grade), keepers: gr.keepers, beats: `${gr.beatsHit}/${gr.beatsTotal}`, frames: gr.framesUsed, empty: gr.emptyFrames, posed: gr.posedFrames }));
    expect(gs.framesUsed).toBeGreaterThan(0);
  });

  it('the sprayer burns the card and misses the day', () => {
    expect(gs.beatsHit).toBeLessThanOrEqual(2);
    expect(gs.grade).toBeLessThan(35);
  });

  it('the photographer covers the beats and scores well', () => {
    expect(gr.beatsHit).toBeGreaterThanOrEqual(7);
    expect(gr.grade).toBeGreaterThan(60);
  });

  it('there is daylight between them', () => {
    expect(gr.grade - gs.grade).toBeGreaterThan(30);
    expect(gr.keepers).toBeGreaterThan(gs.keepers);
  });
});
