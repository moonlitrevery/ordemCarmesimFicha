import type { Howl } from 'howler';
import {
  expiredSounds,
  howlFormat,
  planAmbient,
  shouldStream,
} from './rules';

type HowlerModule = typeof import('howler');

export interface AudioSource {
  id: string;
  name: string;
  url: string;
  mime: string;
  durationS: number | null;
}

export interface AmbientTrack extends AudioSource {
  gain: number;
}

interface ActiveTrack {
  howl: Howl;
  soundId: number;
  gain: number;
  stopTimer?: ReturnType<typeof setTimeout>;
}

const VOLUME_RAMP_MS = 400;
const SWEEP_MS = 30 * 1000;
/** Som que chega atrasado não toca: um susto fora de hora é pior que nenhum. */
const SFX_STALE_MS = 8000;

/** Fala com o howler. Quem decide o que tocar é o `AudioSync`. */
export class AudioEngine {
  private lib: Promise<HowlerModule> | null = null;
  private howler: HowlerModule | null = null;
  private howls = new Map<string, Howl>();
  private lastUsed = new Map<string, number>();
  private ambient = new Map<string, ActiveTrack>();
  private sfx = new Map<number, Howl>();
  private wanted: { tracks: AmbientTrack[]; fadeMs: number } | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | undefined;
  private output = 1;
  private disposed = false;

  constructor(private onError: (name: string) => void) {}

  /** Import dinâmico: howler só entra nesta rota. */
  load(): Promise<HowlerModule> {
    this.lib ??= import('howler').then((howler) => {
      this.howler = howler;
      howler.Howler.volume(this.output);
      return howler;
    });
    return this.lib;
  }

  /** Chamado dentro do clique: é o gesto que o navegador exige para soltar o som. */
  unlock() {
    void this.howler?.Howler.ctx?.resume().catch(() => undefined);
  }

  setOutput(volume: number) {
    this.output = volume;
    this.howler?.Howler.volume(volume);
  }

  setAmbient(tracks: AmbientTrack[], fadeMs: number) {
    this.wanted = { tracks, fadeMs };
    void this.load().then(
      (howler) => this.applyAmbient(howler),
      () => undefined
    );
  }

  private applyAmbient(howler: HowlerModule) {
    if (this.disposed || !this.wanted) return;
    const { tracks, fadeMs } = this.wanted;
    const plan = planAmbient(
      this.ambient.keys(),
      tracks.map((track) => track.id)
    );
    plan.stop.forEach((id) => this.fadeOutTrack(id, fadeMs));
    for (const track of tracks) {
      const active = this.ambient.get(track.id);
      if (active) {
        const returning = active.gain === 0;
        clearTimeout(active.stopTimer);
        active.stopTimer = undefined;
        this.fadeTo(active, track.gain, returning ? fadeMs : VOLUME_RAMP_MS);
        continue;
      }
      const howl = this.howlFor(howler, track, true);
      const soundId = howl.play();
      const started: ActiveTrack = { howl, soundId, gain: 0 };
      this.ambient.set(track.id, started);
      this.fadeTo(started, track.gain, fadeMs);
    }
  }

  private fadeTo(track: ActiveTrack, gain: number, ms: number) {
    if (track.gain === gain) return;
    const from = track.howl.volume(track.soundId) as number;
    track.gain = gain;
    track.howl.fade(from, gain, ms, track.soundId);
  }

  private fadeOutTrack(id: string, fadeMs: number) {
    const track = this.ambient.get(id);
    if (!track || track.stopTimer) return;
    this.fadeTo(track, 0, fadeMs);
    track.stopTimer = setTimeout(() => {
      track.howl.stop(track.soundId);
      this.ambient.delete(id);
      this.touch(id);
    }, fadeMs);
  }

  async playSfx(source: AudioSource, gain: number) {
    const howler = await this.load();
    if (this.disposed) return;
    const howl = this.howlFor(howler, source, false);
    const requested = Date.now();
    const play = () => {
      if (this.disposed || Date.now() - requested > SFX_STALE_MS) return;
      const soundId = howl.play();
      howl.volume(gain, soundId);
      this.sfx.set(soundId, howl);
      this.touch(source.id);
      const finish = () => {
        this.sfx.delete(soundId);
        this.touch(source.id);
      };
      howl.once('end', finish, soundId);
      howl.once('stop', finish, soundId);
    };
    if (howl.state() === 'loaded') play();
    else howl.once('load', play);
  }

  setSfxGain(gain: number) {
    this.sfx.forEach((howl, soundId) => howl.volume(gain, soundId));
  }

  stopSfx(fadeMs: number) {
    this.sfx.forEach((howl, soundId) => {
      howl.fade(howl.volume(soundId) as number, 0, fadeMs, soundId);
      setTimeout(() => howl.stop(soundId), fadeMs);
    });
  }

  private howlFor(howler: HowlerModule, source: AudioSource, loop: boolean): Howl {
    const existing = this.howls.get(source.id);
    if (existing) {
      this.lastUsed.delete(source.id);
      return existing;
    }
    const howl: Howl = new howler.Howl({
      src: [source.url],
      format: [howlFormat(source.mime)],
      loop,
      html5: shouldStream(source.durationS),
      volume: 0,
      onloaderror: () => {
        this.howls.delete(source.id);
        this.ambient.delete(source.id);
        howl.unload();
        this.onError(source.name);
      },
      // Streaming bloqueado pelo navegador: toca no próximo toque na tela.
      onplayerror: (soundId) => {
        howl.once('unlock', () => howl.play(soundId));
      },
    });
    this.howls.set(source.id, howl);
    return howl;
  }

  /** Só há timer enquanto existe som parado na memória. */
  private touch(id: string) {
    this.lastUsed.set(id, Date.now());
    this.sweepTimer ??= setInterval(() => this.sweep(), SWEEP_MS);
  }

  private sweep() {
    for (const id of expiredSounds(this.lastUsed, Date.now())) {
      this.lastUsed.delete(id);
      const howl = this.howls.get(id);
      if (!howl || this.ambient.has(id) || howl.playing()) continue;
      howl.unload();
      this.howls.delete(id);
    }
    if (this.lastUsed.size === 0) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }
  }

  dispose() {
    this.disposed = true;
    clearInterval(this.sweepTimer);
    this.ambient.forEach((track) => clearTimeout(track.stopTimer));
    this.howls.forEach((howl) => howl.unload());
    this.howls.clear();
    this.ambient.clear();
    this.sfx.clear();
    this.lastUsed.clear();
  }
}
