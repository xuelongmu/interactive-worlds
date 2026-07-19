/** Four-bus Web Audio engine: narration / diegetic / ambience / music.
 *  Narration ducks other buses by -6 dB. VO files are baked per cue id;
 *  when a file is missing (assets not yet generated) the subtitle still
 *  shows for an estimated read duration, so scenes are testable pre-VO. */

export type BusName = "narration" | "diegetic" | "ambience" | "music";

const DUCK_DB = -6;
const dbToGain = (db: number) => Math.pow(10, db / 20);

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private buses = new Map<BusName, GainNode>();
  private ambienceSources: AudioBufferSourceNode[] = [];
  private activeSources = new Set<AudioBufferSourceNode>();
  private paused = false;
  private disposed = false;
  private playbackGeneration = 0;
  /** invalidates in-flight playAmbience loads when stopAmbience runs */
  private ambienceGeneration = 0;
  private bufferCache = new Map<string, AudioBuffer | null>();
  onSubtitle: (text: string | null) => void = () => {};

  /** Must be called from a user gesture (autoplay policy). */
  ensure(): AudioContext {
    if (this.disposed) throw new Error("audio engine is disposed");
    if (!this.ctx) {
      this.ctx = new AudioContext();
      for (const name of ["narration", "diegetic", "ambience", "music"] as BusName[]) {
        const gain = this.ctx.createGain();
        gain.connect(this.ctx.destination);
        this.buses.set(name, gain);
      }
    }
    if (this.ctx.state === "suspended" && !this.paused) void this.ctx.resume();
    return this.ctx;
  }

  /** Suspend the shared context so narration, diegetic sound, ambience, and
   * music retain their exact positions across the pause overlay. */
  async pause() {
    this.paused = true;
    if (this.ctx?.state === "running") await this.ctx.suspend();
  }

  async resume() {
    this.paused = false;
    if (this.ctx?.state === "suspended") await this.ctx.resume();
  }

  private async load(url: string): Promise<AudioBuffer | null> {
    if (this.bufferCache.has(url)) return this.bufferCache.get(url)!;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      const buffer = await this.ensure().decodeAudioData(await res.arrayBuffer());
      this.bufferCache.set(url, buffer);
      return buffer;
    } catch {
      console.warn(`[audio] missing asset: ${url} (subtitle-only playback)`);
      this.bufferCache.set(url, null);
      return null;
    }
  }

  private duck(buses: BusName[], on: boolean) {
    const ctx = this.ensure();
    for (const name of buses) {
      const bus = this.buses.get(name);
      bus?.gain.setTargetAtTime(on ? dbToGain(DUCK_DB) : 1, ctx.currentTime, 0.15);
    }
  }

  /** Play a VO cue; resolves when finished. Missing files resolve after an
   *  estimated read time so cue sequencing still works. */
  async playVoice(opts: {
    url: string;
    subtitle?: string;
    bus?: BusName;
    duck?: BusName[];
  }): Promise<void> {
    const generation = this.playbackGeneration;
    const ctx = this.ensure();
    const bus = this.buses.get(opts.bus ?? "narration")!;
    const duckTargets = opts.duck ?? ["ambience", "music"];
    const buffer = await this.load(opts.url);
    if (this.disposed || generation !== this.playbackGeneration) return;

    this.onSubtitle(opts.subtitle ?? null);
    this.duck(duckTargets, true);
    try {
      if (buffer) {
        await new Promise<void>((resolveDone) => {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(bus);
          this.activeSources.add(source);
          source.onended = () => {
            this.activeSources.delete(source);
            resolveDone();
          };
          source.start();
        });
      } else if (opts.subtitle) {
        // ~180 wpm reading pace, min 2s
        const seconds = Math.max(2, opts.subtitle.split(/\s+/).length / 3);
        await this.waitWhileUnpaused(seconds * 1000, generation);
      }
    } finally {
      this.duck(duckTargets, false);
      this.onSubtitle(null);
    }
  }

  /** Fire-and-forget playback (barks, stingers): no subtitle, no ducking. */
  async playOneShot(url: string, bus: BusName = "diegetic") {
    const buffer = await this.load(url);
    if (!buffer || this.disposed) return;
    const ctx = this.ensure();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.buses.get(bus)!);
    this.activeSources.add(source);
    source.onended = () => this.activeSources.delete(source);
    source.start();
  }

  async playAmbience(urls: string[]) {
    const ctx = this.ensure();
    this.stopAmbience();
    const generation = this.ambienceGeneration;
    for (const url of urls) {
      const buffer = await this.load(url);
      // a stopAmbience during the async load must win — never start the
      // previous scene's loop over the new chapter
      if (generation !== this.ambienceGeneration) return;
      if (!buffer) continue;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(this.buses.get("ambience")!);
      this.activeSources.add(source);
      source.onended = () => this.activeSources.delete(source);
      source.start();
      this.ambienceSources.push(source);
    }
  }

  stopAmbience() {
    this.ambienceGeneration++;
    for (const s of this.ambienceSources) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    this.ambienceSources = [];
  }

  /** Scene-bound playback never leaks through restart, chapter select, or
   * a director transition. Cached decoded buffers remain reusable. */
  stopAll() {
    this.playbackGeneration++;
    this.ambienceGeneration++;
    for (const source of this.activeSources) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    this.activeSources.clear();
    this.ambienceSources = [];
    if (this.ctx) {
      for (const bus of this.buses.values()) bus.gain.setValueAtTime(1, this.ctx.currentTime);
    }
    this.onSubtitle(null);
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopAll();
    const context = this.ctx;
    this.ctx = null;
    this.buses.clear();
    this.bufferCache.clear();
    this.paused = false;
    if (context && context.state !== "closed") await context.close();
  }

  private async waitWhileUnpaused(durationMs: number, generation: number) {
    let remaining = durationMs;
    let last = performance.now();
    while (remaining > 0 && generation === this.playbackGeneration) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(100, remaining)));
      const now = performance.now();
      if (!this.paused) remaining -= now - last;
      last = now;
    }
  }
}
