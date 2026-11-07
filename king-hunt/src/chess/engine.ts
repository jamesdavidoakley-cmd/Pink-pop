/**
 * Stockfish (lite, single-threaded WASM) running in a Web Worker, spoken to
 * over UCI. Used two ways: as the truth-teller (evaluation) and as the muscle
 * behind every sparring partner (with strength and style dialled down).
 */
export interface SearchOptions {
  depth?: number;
  movetimeMs?: number;
  multiPv?: number;
  skillLevel?: number; // 0..20
  limitElo?: number; // >= 1320
}

export interface PvLine {
  multipv: number;
  move: string; // uci
  cp?: number; // centipawns from side to move
  mate?: number; // moves to mate (+ us, - them)
  depth: number;
}

export interface SearchResult {
  best: string; // uci
  lines: PvLine[];
}

export class Engine {
  private worker: Worker | null = null;
  private ready: Promise<void>;
  private listeners = new Set<(line: string) => void>();
  private busy: Promise<unknown> = Promise.resolve();

  constructor(url = './engine/stockfish.js') {
    this.ready = new Promise<void>((resolve, reject) => {
      try {
        const w = new Worker(url);
        this.worker = w;
        w.onmessage = (e: MessageEvent<string>) => {
          const line = String(e.data);
          for (const l of this.listeners) l(line);
        };
        w.onerror = (e) => reject(e);
        const onUci = (line: string) => {
          if (line === 'uciok') {
            this.listeners.delete(onUci);
            resolve();
          }
        };
        this.listeners.add(onUci);
        w.postMessage('uci');
      } catch (e) {
        reject(e);
      }
    });
  }

  whenReady(): Promise<void> {
    return this.ready;
  }

  private send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  private waitFor(pred: (line: string) => boolean, collect?: (line: string) => void): Promise<string> {
    return new Promise((resolve) => {
      const l = (line: string) => {
        collect?.(line);
        if (pred(line)) {
          this.listeners.delete(l);
          resolve(line);
        }
      };
      this.listeners.add(l);
    });
  }

  /** Searches are serialised: one at a time per engine instance. */
  search(fen: string, opts: SearchOptions = {}): Promise<SearchResult> {
    const run = async (): Promise<SearchResult> => {
      await this.ready;
      const multiPv = opts.multiPv ?? 1;
      this.send(`setoption name MultiPV value ${multiPv}`);
      this.send(`setoption name Skill Level value ${opts.skillLevel ?? 20}`);
      if (opts.limitElo) {
        this.send('setoption name UCI_LimitStrength value true');
        this.send(`setoption name UCI_Elo value ${Math.max(1320, opts.limitElo)}`);
      } else {
        this.send('setoption name UCI_LimitStrength value false');
      }
      this.send('isready');
      await this.waitFor((l) => l === 'readyok');
      this.send(`position fen ${fen}`);
      const lines = new Map<number, PvLine>();
      const go = opts.movetimeMs ? `go movetime ${opts.movetimeMs}` : `go depth ${opts.depth ?? 8}`;
      this.send(go);
      const bestLine = await this.waitFor(
        (l) => l.startsWith('bestmove'),
        (l) => {
          if (!l.startsWith('info') || !l.includes(' pv ')) return;
          const m = /multipv (\d+)/.exec(l);
          const d = /depth (\d+)/.exec(l);
          const cp = /score cp (-?\d+)/.exec(l);
          const mate = /score mate (-?\d+)/.exec(l);
          const pv = / pv (\S+)/.exec(l);
          if (!pv || !d) return;
          const idx = m ? Number(m[1]) : 1;
          lines.set(idx, {
            multipv: idx,
            move: pv[1]!,
            depth: Number(d[1]),
            cp: cp ? Number(cp[1]) : undefined,
            mate: mate ? Number(mate[1]) : undefined,
          });
        },
      );
      const best = bestLine.split(' ')[1] ?? '(none)';
      return { best, lines: [...lines.values()].sort((a, b) => a.multipv - b.multipv) };
    };
    const p = this.busy.then(run, run);
    this.busy = p.catch(() => undefined);
    return p;
  }

  stop() {
    this.send('stop');
  }
  dispose() {
    this.send('quit');
    this.worker?.terminate();
    this.worker = null;
  }
}
