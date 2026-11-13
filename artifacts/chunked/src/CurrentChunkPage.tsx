import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import {
  ArrowLeft, Check, ChevronLeft, ChevronRight, Clock3, Pause, Play, RotateCcw, Volume2, VolumeX,
} from 'lucide-react';
import { advanceFocusTimer, type Phase, type TimerMode, type TimerState } from './focusTimer';
import { isVideoUrl, validateDirectAudioUrl, validateDirectVisualUrl } from './focusMedia';
import './CurrentChunkPage.css';

export type CurrentChunk = {
  id: number | string;
  name: string;
  startTime?: string | null;
  endTime?: string | null;
};

export type CurrentChunkTask = {
  id: number | string;
  title: string;
  description?: string;
  completedAt?: string | null;
};

export type CurrentChunkPageProps = {
  chunk: CurrentChunk;
  tasks: CurrentChunkTask[];
  date: string;
  userKey: string;
  onToggleTask: (task: CurrentChunkTask) => void;
  onBack: () => void;
};

type BuiltInSound = 'lo-fi' | 'fireplace' | 'forest' | 'soft-jazz';
type SoundChoice = BuiltInSound | 'custom';
type VisualChoice = 'off' | 'dusk' | 'rain' | 'window' | 'custom';
type PersistedMedia = { sound: SoundChoice; audioUrl: string; visual: VisualChoice; visualUrl: string };

const TASKS_PER_PAGE = 3;
const FOCUS_PRESETS = [25, 45, 60];
const BREAK_PRESETS = [5, 10, 15];
const SOUND_CHOICES: { id: SoundChoice; label: string }[] = [
  { id: 'lo-fi', label: 'Lo-fi' },
  { id: 'fireplace', label: 'Fireplace' },
  { id: 'forest', label: 'Forest' },
  { id: 'soft-jazz', label: 'Soft jazz' },
  { id: 'custom', label: 'Your audio link' },
];
const VISUAL_CHOICES: { id: Exclude<VisualChoice, 'custom'>; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'dusk', label: 'Dusk garden' },
  { id: 'rain', label: 'Rainy window' },
  { id: 'window', label: 'Quiet room' },
];
const freshTimer = (): TimerState => ({
  mode: 'manual', phase: 'focus', focusMinutes: 25, breakMinutes: 5,
  remainingMs: 25 * 60_000, running: false, endsAt: null, cycles: 0,
});

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function formatTime(totalMs: number) {
  const seconds = Math.max(0, Math.ceil(totalMs / 1000));
  const mins = Math.floor(seconds / 60);
  return `${String(mins).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatRange(start?: string | null, end?: string | null) {
  if (!start && !end) return 'A little room, whenever you need it';
  if (start && end) return `${start} – ${end}`;
  return start || end || '';
}

function formatFocusDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(parsed);
}

function startSynthAmbience(choice: BuiltInSound, onError: () => void): (() => void) | null {
  try {
    const AudioContextConstructor = window.AudioContext
      || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return null;
    const context = new AudioContextConstructor();
    const master = context.createGain();
    const filter = context.createBiquadFilter();
    const bufferSize = context.sampleRate * 2;
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < bufferSize; index += 1) channel[index] = Math.random() * 2 - 1;
    const noise = context.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    filter.type = 'lowpass';
    master.gain.value = .48;
    filter.connect(master);
    master.connect(context.destination);

    let stopped = false;
    const activeNodes = new Set<AudioNode>([noise]);
    const stop = () => {
      if (stopped) return;
      stopped = true;
      for (const node of activeNodes) {
        if (node instanceof AudioScheduledSourceNode) {
          try { node.stop(); } catch { /* A source may already have stopped. */ }
        }
        try { node.disconnect(); } catch { /* Ignore nodes already disconnected. */ }
      }
      try {
        master.gain.setTargetAtTime(0, context.currentTime, .05);
        window.setTimeout(() => { void context.close().catch(() => undefined); }, 220);
      } catch { void context.close().catch(() => undefined); }
    };

    const profiles: Record<BuiltInSound, { cutoff: number; noiseLevel: number }> = {
      'lo-fi': { cutoff: 850, noiseLevel: .018 },
      fireplace: { cutoff: 440, noiseLevel: .055 },
      forest: { cutoff: 1600, noiseLevel: .028 },
      'soft-jazz': { cutoff: 1150, noiseLevel: .014 },
    };
    filter.frequency.value = profiles[choice].cutoff;
    const noiseGain = context.createGain();
    noiseGain.gain.value = profiles[choice].noiseLevel;
    noise.connect(noiseGain);
    noiseGain.connect(filter);
    noise.start();

    const playTone = (frequency: number, startAt: number, length: number, level: number, wave: OscillatorType) => {
      if (stopped) return;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = wave;
      oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(.0001, startAt);
      envelope.gain.exponentialRampToValueAtTime(level, startAt + Math.min(.08, length * .35));
      envelope.gain.exponentialRampToValueAtTime(.0001, startAt + length);
      oscillator.connect(envelope);
      envelope.connect(filter);
      oscillator.start(startAt);
      oscillator.stop(startAt + length + .05);
      activeNodes.add(oscillator);
      activeNodes.add(envelope);
      oscillator.addEventListener('ended', () => {
        activeNodes.delete(oscillator);
        activeNodes.delete(envelope);
        try { oscillator.disconnect(); envelope.disconnect(); } catch { /* Already disconnected. */ }
      }, { once: true });
    };

    const chordSets: Record<Extract<SoundChoice, 'lo-fi' | 'soft-jazz'>, number[][]> = {
      'lo-fi': [[130.81, 155.56, 196], [110, 130.81, 164.81], [87.31, 110, 130.81], [98, 123.47, 146.83]],
      'soft-jazz': [[146.83, 174.61, 220, 261.63], [130.81, 164.81, 196, 246.94], [110, 146.83, 174.61, 220], [123.47, 155.56, 185, 233.08]],
    };
    const playChord = (index: number, time: number) => {
      const notes = chordSets[choice as keyof typeof chordSets]?.[index % 4];
      if (!notes) return;
      const wave: OscillatorType = choice === 'soft-jazz' ? 'sine' : 'triangle';
      notes.forEach((note, noteIndex) => playTone(note, time + noteIndex * .035, 2.6, choice === 'soft-jazz' ? .012 : .016, wave));
      playTone(notes[0] / 2, time, 1.8, .014, 'sine');
    };

    if (choice === 'fireplace') {
      const crackle = () => {
        if (stopped) return;
        const time = context.currentTime;
        playTone(320 + Math.random() * 900, time, .035 + Math.random() * .08, .045 + Math.random() * .02, 'triangle');
        window.setTimeout(crackle, 240 + Math.random() * 950);
      };
      window.setTimeout(crackle, 100);
    } else if (choice === 'forest') {
      const wind = context.createOscillator();
      const windGain = context.createGain();
      const windFilter = context.createBiquadFilter();
      const lfo = context.createOscillator();
      const lfoGain = context.createGain();
      wind.type = 'sine';
      wind.frequency.value = 110;
      windGain.gain.value = .008;
      windFilter.type = 'lowpass';
      windFilter.frequency.value = 280;
      lfo.frequency.value = .08;
      lfoGain.gain.value = .006;
      lfo.connect(lfoGain);
      lfoGain.connect(windGain.gain);
      wind.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      wind.start();
      lfo.start();
      activeNodes.add(wind);
      activeNodes.add(lfo);
      activeNodes.add(windGain);
      activeNodes.add(windFilter);
      activeNodes.add(lfoGain);
      let chirpCount = 0;
      const chirp = () => {
        if (stopped) return;
        const time = context.currentTime;
        const base = [880, 1046.5, 987.8, 1174.7][chirpCount % 4];
        playTone(base, time, .18, .007, 'sine');
        playTone(base * 1.17, time + .11, .16, .005, 'sine');
        chirpCount += 1;
        window.setTimeout(chirp, 3800 + Math.random() * 7000);
      };
      window.setTimeout(chirp, 900);
    } else {
      let chordIndex = 0;
      const chordLoop = () => {
        if (stopped) return;
        playChord(chordIndex, context.currentTime);
        chordIndex += 1;
        window.setTimeout(chordLoop, choice === 'lo-fi' ? 3600 : 4200);
      };
      chordLoop();
    }

    void context.resume().catch(() => {
      stop();
      onError();
    });
    return stop;
  } catch {
    return null;
  }
}

export default function CurrentChunkPage({
  chunk, tasks, date, userKey, onToggleTask, onBack,
}: CurrentChunkPageProps) {
  const storageScope = useMemo(() => `${encodeURIComponent(userKey)}:${encodeURIComponent(date)}:${encodeURIComponent(String(chunk.id))}`, [userKey, date, chunk.id]);
  const timerStorageKey = `chunked:focus:timer:${storageScope}`;
  const mediaStorageKey = `chunked:focus:media:${storageScope}`;
  const [timer, setTimer] = useState<TimerState>(() => {
    const stored = safeRead(timerStorageKey, freshTimer());
    const fallback = freshTimer();
    const validPhase = stored.phase === 'break' ? 'break' : 'focus';
    const validMode = stored.mode === 'cycle' ? 'cycle' : 'manual';
    const focusMinutes = FOCUS_PRESETS.includes(Number(stored.focusMinutes)) ? Number(stored.focusMinutes) : fallback.focusMinutes;
    const breakMinutes = BREAK_PRESETS.includes(Number(stored.breakMinutes)) ? Number(stored.breakMinutes) : fallback.breakMinutes;
    const remainingMs = stored.running && Number.isFinite(stored.endsAt)
      ? Math.max(0, Number(stored.endsAt) - Date.now())
      : Math.max(0, Number(stored.remainingMs) || 0);
    return {
      ...fallback, ...stored, mode: validMode, phase: validPhase, focusMinutes, breakMinutes,
      remainingMs, running: Boolean(stored.running && remainingMs > 0),
      endsAt: stored.running && remainingMs > 0 ? Number(stored.endsAt) : null,
    };
  });
  const [media, setMedia] = useState<PersistedMedia>(() => {
    const stored = safeRead<PersistedMedia>(mediaStorageKey, { sound: 'lo-fi', audioUrl: '', visual: 'off', visualUrl: '' });
    return {
      sound: SOUND_CHOICES.some((choice) => choice.id === stored.sound) ? stored.sound : 'lo-fi',
      audioUrl: typeof stored.audioUrl === 'string' ? stored.audioUrl : '',
      visual: [...VISUAL_CHOICES.map((choice) => choice.id), 'custom'].includes(stored.visual) ? stored.visual : 'off',
      visualUrl: typeof stored.visualUrl === 'string' ? stored.visualUrl : '',
    };
  });
  const [now, setNow] = useState(Date.now());
  const [page, setPage] = useState(0);
  const [soundPlaying, setSoundPlaying] = useState(false);
  const [visualPlaying, setVisualPlaying] = useState(false);
  const [audioMessage, setAudioMessage] = useState('');
  const [visualMessage, setVisualMessage] = useState('');
  const [audioUrlDraft, setAudioUrlDraft] = useState(media.audioUrl);
  const [visualUrlDraft, setVisualUrlDraft] = useState(media.visualUrl);
  const audioStopRef = useRef<(() => void) | null>(null);
  const storageScopeRef = useRef(storageScope);
  const pendingScopeHydration = useRef(0);
  const totalPages = Math.max(1, Math.ceil(tasks.length / TASKS_PER_PAGE));
  const currentTasks = tasks.slice(page * TASKS_PER_PAGE, (page + 1) * TASKS_PER_PAGE);
  const durationMs = (timer.phase === 'focus' ? timer.focusMinutes : timer.breakMinutes) * 60_000;
  const remainingMs = timer.running && timer.endsAt ? Math.max(0, timer.endsAt - now) : timer.remainingMs;
  const progress = durationMs > 0 ? Math.max(0, Math.min(100, (1 - remainingMs / durationMs) * 100)) : 0;
  const completedCount = tasks.filter((task) => Boolean(task.completedAt)).length;
  const activeVisualUrl = media.visual === 'custom' ? validateDirectVisualUrl(media.visualUrl) : null;
  const customIsVideo = activeVisualUrl ? isVideoUrl(activeVisualUrl) : false;

  useEffect(() => {
    if (storageScopeRef.current === storageScope) return;
    storageScopeRef.current = storageScope;
    pendingScopeHydration.current = 2;
    const storedTimer = safeRead(timerStorageKey, freshTimer());
    const fallback = freshTimer();
    const focusMinutes = FOCUS_PRESETS.includes(Number(storedTimer.focusMinutes)) ? Number(storedTimer.focusMinutes) : fallback.focusMinutes;
    const breakMinutes = BREAK_PRESETS.includes(Number(storedTimer.breakMinutes)) ? Number(storedTimer.breakMinutes) : fallback.breakMinutes;
    const resumedMs = storedTimer.running && Number.isFinite(storedTimer.endsAt) ? Math.max(0, Number(storedTimer.endsAt) - Date.now()) : Math.max(0, Number(storedTimer.remainingMs) || 0);
    setTimer({
      ...fallback, ...storedTimer,
      mode: storedTimer.mode === 'cycle' ? 'cycle' : 'manual',
      phase: storedTimer.phase === 'break' ? 'break' : 'focus',
      focusMinutes, breakMinutes, remainingMs: resumedMs,
      running: Boolean(storedTimer.running && resumedMs > 0),
      endsAt: storedTimer.running && resumedMs > 0 ? Number(storedTimer.endsAt) : null,
    });
    const storedMedia = safeRead<PersistedMedia>(mediaStorageKey, { sound: 'lo-fi', audioUrl: '', visual: 'off', visualUrl: '' });
    setMedia({
      sound: SOUND_CHOICES.some((choice) => choice.id === storedMedia.sound) ? storedMedia.sound : 'lo-fi',
      audioUrl: typeof storedMedia.audioUrl === 'string' ? storedMedia.audioUrl : '',
      visual: [...VISUAL_CHOICES.map((choice) => choice.id), 'custom'].includes(storedMedia.visual) ? storedMedia.visual : 'off',
      visualUrl: typeof storedMedia.visualUrl === 'string' ? storedMedia.visualUrl : '',
    });
    setAudioUrlDraft(storedMedia.audioUrl || '');
    setVisualUrlDraft(storedMedia.visualUrl || '');
    setVisualPlaying(false);
    setSoundPlaying(false);
    audioStopRef.current?.();
    audioStopRef.current = null;
  }, [mediaStorageKey, storageScope, timerStorageKey]);
  useEffect(() => {
    if (pendingScopeHydration.current > 0) {
      pendingScopeHydration.current -= 1;
      return;
    }
    try { window.localStorage.setItem(timerStorageKey, JSON.stringify(timer)); } catch { /* Storage may be unavailable. */ }
  }, [timerStorageKey, timer]);
  useEffect(() => {
    if (pendingScopeHydration.current > 0) {
      pendingScopeHydration.current -= 1;
      return;
    }
    try { window.localStorage.setItem(mediaStorageKey, JSON.stringify(media)); } catch { /* Storage may be unavailable. */ }
  }, [mediaStorageKey, media]);
  useEffect(() => {
    if (!timer.running) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [timer.running]);
  useEffect(() => {
    if (timer.running && remainingMs <= 0) {
      setTimer((current) => advanceFocusTimer(current, Date.now()));
    }
  }, [remainingMs, timer.running, timer.endsAt, timer.mode]);
  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(0, Math.ceil(tasks.length / TASKS_PER_PAGE) - 1)));
  }, [tasks.length]);
  useEffect(() => () => { audioStopRef.current?.(); }, []);
  useEffect(() => { setVisualPlaying(false); }, [storageScope]);

  const setMode = useCallback((mode: TimerMode) => setTimer((current) => ({ ...current, mode })), []);
  const startPhase = useCallback((phase: Phase) => {
    setTimer((current) => {
      const duration = (phase === 'focus' ? current.focusMinutes : current.breakMinutes) * 60_000;
      return { ...current, phase, remainingMs: duration, running: true, endsAt: Date.now() + duration };
    });
    setNow(Date.now());
  }, []);
  const toggleTimer = useCallback(() => {
    setTimer((current) => {
      if (current.running) {
        const left = current.endsAt ? Math.max(0, current.endsAt - Date.now()) : current.remainingMs;
        return { ...current, running: false, remainingMs: left, endsAt: null };
      }
      const duration = current.remainingMs > 0 ? current.remainingMs : (current.phase === 'focus' ? current.focusMinutes : current.breakMinutes) * 60_000;
      return { ...current, running: true, remainingMs: duration, endsAt: Date.now() + duration };
    });
    setNow(Date.now());
  }, []);
  const resetTimer = useCallback(() => {
    setTimer((current) => ({
      ...current, running: false, endsAt: null,
      remainingMs: (current.phase === 'focus' ? current.focusMinutes : current.breakMinutes) * 60_000,
    }));
  }, []);
  const setDuration = useCallback((phase: Phase, minutes: number) => {
    setTimer((current) => {
      const updated = phase === 'focus' ? { ...current, focusMinutes: minutes } : { ...current, breakMinutes: minutes };
      if (current.phase !== phase) return updated;
      const duration = minutes * 60_000;
      return { ...updated, remainingMs: duration, endsAt: current.running ? Date.now() + duration : null };
    });
  }, []);
  const stopSound = useCallback(() => {
    setSoundPlaying(false);
    audioStopRef.current?.();
    audioStopRef.current = null;
  }, []);
  const playSound = useCallback((choice: SoundChoice, audioUrl: string) => {
    setAudioMessage('');
    if (choice === 'custom') {
      const safeUrl = validateDirectAudioUrl(audioUrl);
      if (!safeUrl) {
        setAudioMessage('Add a direct HTTPS audio file link first.');
        return;
      }
      try {
        const audio = new Audio(safeUrl);
        audio.loop = true;
        audio.preload = 'none';
        audio.volume = .2;
        const stop = () => {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        };
        audioStopRef.current = stop;
        audio.addEventListener('error', () => {
          if (audioStopRef.current === stop) {
            audioStopRef.current = null;
            setSoundPlaying(false);
            setAudioMessage('This audio link could not be played. Check the direct file URL.');
          }
          stop();
        }, { once: true });
        setSoundPlaying(true);
        void audio.play().catch(() => {
          if (audioStopRef.current === stop) {
            audioStopRef.current = null;
            setSoundPlaying(false);
            setAudioMessage('Playback was blocked or the audio link is unavailable.');
          }
          stop();
        });
      } catch {
        setAudioMessage('This browser could not open that audio link.');
      }
      return;
    }
    let stop: (() => void) | null = null;
    stop = startSynthAmbience(choice, () => {
      if (audioStopRef.current === stop) {
        audioStopRef.current = null;
        setSoundPlaying(false);
        setAudioMessage('Sound is unavailable in this browser. Your focus timer still works.');
      }
    });
    if (!stop) {
      setAudioMessage('Sound is unavailable in this browser. Your focus timer still works.');
      return;
    }
    audioStopRef.current = stop;
    setSoundPlaying(true);
  }, []);
  const toggleSound = useCallback(() => {
    if (soundPlaying) {
      stopSound();
      return;
    }
    playSound(media.sound, media.audioUrl);
  }, [media.audioUrl, media.sound, playSound, soundPlaying, stopSound]);
  const chooseSound = (choice: SoundChoice) => {
    if (soundPlaying) {
      stopSound();
      setMedia((current) => ({ ...current, sound: choice }));
      playSound(choice, media.audioUrl);
      return;
    }
    setMedia((current) => ({ ...current, sound: choice }));
    setAudioMessage('');
  };
  const saveAudioUrl = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const safeUrl = validateDirectAudioUrl(audioUrlDraft);
    if (!safeUrl) {
      setAudioMessage('Use an HTTPS link ending in a supported audio file.');
      return;
    }
    stopSound();
    setMedia((current) => ({ ...current, sound: 'custom', audioUrl: safeUrl }));
    setAudioUrlDraft(safeUrl);
    setAudioMessage('Audio saved. Press Play when you’re ready.');
  };

  const saveVisualUrl = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const safeUrl = validateDirectVisualUrl(visualUrlDraft);
    if (!safeUrl) {
      setVisualMessage('Use an HTTPS link ending in an image, GIF, or video file.');
      return;
    }
    setMedia((current) => ({ ...current, visual: 'custom', visualUrl: safeUrl }));
    setVisualMessage('Visual saved. Press Play when you’re ready.');
    setVisualPlaying(false);
  };
  const chooseVisual = (visual: VisualChoice) => {
    setMedia((current) => ({ ...current, visual }));
    setVisualPlaying(false);
    setVisualMessage('');
  };
  const toggleVisual = () => {
    if (media.visual === 'off') {
      setVisualMessage('Choose a scene or add a direct visual URL first.');
      return;
    }
    if (media.visual === 'custom' && !activeVisualUrl) {
      setVisualMessage('Add a valid HTTPS image, GIF, or video link first.');
      return;
    }
    setVisualPlaying((playing) => !playing);
    setVisualMessage('');
  };

  const visualElement = () => {
    if (!visualPlaying || media.visual === 'off') {
      return <div className="scene-copy">{visualPlaying ? 'A quiet place to land' : 'Visuals are resting'}</div>;
    }
    if (media.visual === 'custom' && activeVisualUrl) {
      return customIsVideo
        ? <video className="visual-video" src={activeVisualUrl} muted loop autoPlay playsInline aria-label="Your selected ambient video" onError={() => { setVisualPlaying(false); setVisualMessage('This video link could not be played. Check the direct file URL.'); }} />
        : <img className="visual-image" src={activeVisualUrl} alt="Your selected focus visual" referrerPolicy="no-referrer" onError={() => { setVisualPlaying(false); setVisualMessage('This image link could not be loaded. Check the direct file URL.'); }} />;
    }
    return <div className={`scene-art scene-${media.visual}`} aria-label="Original animated ambient scene" role="img"><span className="sr-only">An original ambient scene</span></div>;
  };

  return (
    <div className="current-chunk">
      <header className="focus-topbar">
        <button type="button" onClick={onBack} className="focus-back" data-testid="button-focus-back">
          <ArrowLeft size={16} strokeWidth={1.8} /><span>Back to the day</span>
        </button>
        <div className="focus-brand" aria-label="Chunked focus space">
          <span className="focus-brand-mark" aria-hidden="true" /> CHUNKED <span style={{ color: '#bd816f' }}>·</span> FOCUS SPACE
        </div>
        <span aria-hidden="true" style={{ width: 94 }} />
      </header>

      <main className="focus-main">
        <section className="focus-intro" aria-labelledby="current-chunk-title">
          <div>
            <p className="focus-eyebrow" data-testid="text-focus-date">{formatFocusDate(date)} · one part at a time</p>
            <h1 id="current-chunk-title" className="focus-title" data-testid="text-chunk-name">{chunk.name}</h1>
          </div>
          <div className="focus-schedule" data-testid="text-chunk-time">
            <Clock3 size={14} strokeWidth={1.7} /> {formatRange(chunk.startTime, chunk.endTime)}
          </div>
        </section>

        <div className="focus-layout">
          <section className="focus-panel focus-timer-panel" aria-label="Focus timer">
            <div className="timer-head">
              <div>
                <p className="focus-eyebrow" style={{ marginBottom: '.35rem' }}>A gentle timer</p>
                <p className="timer-kicker" data-testid="status-timer-phase">{timer.phase === 'focus' ? 'Focus time' : 'A little pause'}{timer.cycles ? ` · ${timer.cycles} ${timer.cycles === 1 ? 'cycle' : 'cycles'}` : ''}</p>
              </div>
              <div className="phase-switch" role="group" aria-label="Timer mode">
                <button type="button" onClick={() => setMode('manual')} aria-pressed={timer.mode === 'manual'} data-testid="button-mode-manual">Manual</button>
                <button type="button" onClick={() => setMode('cycle')} aria-pressed={timer.mode === 'cycle'} data-testid="button-mode-cycle">Focus + break</button>
              </div>
            </div>

            <div className="timer-face" style={{ '--progress': `${progress}%` } as CSSProperties} role="timer" aria-label={`${formatTime(remainingMs)} remaining`} data-testid="text-countdown">
              <div className="timer-center">
                <span className="timer-digits">{formatTime(remainingMs)}</span>
                <span className="timer-caption">{timer.running ? 'time to be here' : remainingMs === 0 ? 'that’s enough for now' : 'whenever you’re ready'}</span>
              </div>
            </div>

            <div className="timer-controls">
              <button type="button" className="timer-primary" onClick={toggleTimer} data-testid="button-timer-toggle">
                {timer.running ? <Pause size={15} /> : <Play size={15} fill="currentColor" />}
                {timer.running ? 'Pause gently' : remainingMs === 0 ? 'Start again' : 'Start focus'}
              </button>
              <button type="button" className="timer-reset" onClick={resetTimer} aria-label="Reset timer" data-testid="button-timer-reset"><RotateCcw size={15} /></button>
            </div>
            <p className="timer-footnote" role="status" data-testid="status-timer-mode">
              {timer.mode === 'cycle' ? 'Focus and break will take turns automatically.' : 'Choose each phase yourself, with no automatic switch.'}
            </p>

            <div className="duration-section" aria-label="Timer duration presets">
              <div className="duration-box">
                <span className="duration-label">Focus · minutes</span>
                <div className="duration-options">
                  {FOCUS_PRESETS.map((minutes) => <button key={minutes} type="button" onClick={() => setDuration('focus', minutes)} aria-pressed={timer.focusMinutes === minutes} data-testid={`button-focus-duration-${minutes}`}>{minutes}</button>)}
                </div>
              </div>
              <div className="duration-box">
                <span className="duration-label">Break · minutes</span>
                <div className="duration-options">
                  {BREAK_PRESETS.map((minutes) => <button key={minutes} type="button" onClick={() => setDuration('break', minutes)} aria-pressed={timer.breakMinutes === minutes} data-testid={`button-break-duration-${minutes}`}>{minutes}</button>)}
                </div>
              </div>
            </div>
            {timer.mode === 'manual' && <div className="media-actions" style={{ justifyContent: 'center', marginTop: '.85rem' }}>
              <button type="button" className="focus-quiet-button" onClick={() => startPhase('focus')} data-testid="button-start-focus-phase"><Play size={13} /> Start focus</button>
              <button type="button" className="focus-quiet-button" onClick={() => startPhase('break')} data-testid="button-start-break-phase">Start a break</button>
            </div>}
          </section>

          <div className="focus-side">
            <section className="focus-panel task-panel" aria-labelledby="focus-task-heading">
              <div className="task-panel-heading">
                <div>
                  <p className="focus-eyebrow" style={{ marginBottom: '.2rem' }}>Your small list</p>
                  <h2 id="focus-task-heading">Here for now</h2>
                </div>
                <span className="task-count" data-testid="status-task-progress">{completedCount} / {tasks.length} done</span>
              </div>
              <div className="task-list" aria-live="polite" data-testid="list-current-tasks">
                {currentTasks.length === 0 ? (
                  <div className="task-empty" data-testid="status-empty-tasks">
                    <span className="task-empty-mark" aria-hidden="true" />
                    <p>No tasks in this part of the day.</p>
                    <p style={{ marginTop: '.35rem' }}>You can simply be here.</p>
                  </div>
                ) : currentTasks.map((task) => {
                  const completed = Boolean(task.completedAt);
                  return <article className={`focus-task${completed ? ' is-complete' : ''}`} key={task.id} data-testid={`row-focus-task-${task.id}`}>
                    <button type="button" className="task-toggle" onClick={() => onToggleTask(task)} aria-label={`${completed ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`} aria-pressed={completed} data-testid={`button-toggle-task-${task.id}`}>
                      {completed && <Check size={12} strokeWidth={2.4} />}
                    </button>
                    <div>
                      <p className="task-title" data-testid={`text-task-title-${task.id}`}>{task.title}</p>
                      {task.description && <p className="task-description">{task.description}</p>}
                    </div>
                  </article>;
                })}
              </div>
              <div className="task-pagination">
                <button type="button" className="pagination-button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0} data-testid="button-previous-tasks"><ChevronLeft size={15} /> Previous</button>
                <div className="page-dots" aria-label={`Page ${page + 1} of ${totalPages}`} data-testid="status-task-page">
                  {Array.from({ length: totalPages }, (_, index) => <span key={index} className={index === page ? 'is-current' : ''} />)}
                </div>
                <button type="button" className="pagination-button" onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))} disabled={page >= totalPages - 1} data-testid="button-next-tasks">Next <ChevronRight size={15} /></button>
              </div>
            </section>

            <section className="focus-panel ambience-panel" aria-labelledby="ambience-heading">
              <div className="media-heading">
                <div><h3 id="ambience-heading">A little atmosphere</h3><p>Soft sounds, made here. Always optional.</p></div>
                <span className="media-status" data-testid="status-ambience">{soundPlaying ? 'Playing' : 'Off'}</span>
              </div>
              <div className="sound-choices" role="group" aria-label="Choose ambient sound">
                {SOUND_CHOICES.map((choice) => <button key={choice.id} type="button" className="sound-choice" onClick={() => chooseSound(choice.id)} aria-pressed={media.sound === choice.id} data-testid={`button-sound-${choice.id}`}>{choice.label}</button>)}
              </div>
              <form className="visual-url-form" onSubmit={saveAudioUrl}>
                <label htmlFor="focus-audio-url" className="sr-only">Direct HTTPS audio file URL</label>
                <input id="focus-audio-url" className="visual-url-input" type="url" value={audioUrlDraft} onChange={(event) => setAudioUrlDraft(event.target.value)} placeholder="https://…/audio.mp3" data-testid="input-audio-url" />
                <button type="submit" className="visual-url-submit" data-testid="button-save-audio-url">Use link</button>
              </form>
              <div className="media-actions">
                <button type="button" className="media-play" onClick={toggleSound} data-testid="button-toggle-sound">
                  {soundPlaying ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  {soundPlaying ? 'Turn sound off' : 'Play sound'}
                </button>
                <span className="task-count">Sound starts only when you ask</span>
              </div>
              <p className="media-note" role="status" data-testid="status-audio-message">{audioMessage}</p>
            </section>

            <section className="focus-panel ambience-panel" aria-labelledby="visual-heading">
              <div className="media-heading">
                <div><h3 id="visual-heading">A place to look</h3><p>Original scenes or a direct media link.</p></div>
                <span className="media-status" data-testid="status-visual">{visualPlaying ? 'Playing' : 'Off'}</span>
              </div>
              <div className="scene-choices" role="group" aria-label="Choose ambient visual">
                {VISUAL_CHOICES.map((choice) => <button key={choice.id} type="button" className="scene-choice" onClick={() => chooseVisual(choice.id)} aria-pressed={media.visual === choice.id} data-testid={`button-visual-${choice.id}`}>{choice.label}</button>)}
              </div>
              <form className="visual-url-form" onSubmit={saveVisualUrl}>
                <label htmlFor="focus-visual-url" className="sr-only">Direct HTTPS image, GIF, or video URL</label>
                <input id="focus-visual-url" className="visual-url-input" type="url" value={visualUrlDraft} onChange={(event) => setVisualUrlDraft(event.target.value)} placeholder="https://…/image.gif" data-testid="input-visual-url" />
                <button type="submit" className="visual-url-submit" data-testid="button-save-visual-url">Use link</button>
              </form>
              <div className={`visual-stage${visualPlaying ? '' : ' is-off'}`} data-testid="visual-stage" aria-label={visualPlaying ? 'Ambient visual playing' : 'Ambient visual is off'}>
                {visualElement()}
              </div>
              <div className="media-actions">
                <button type="button" className="media-play" onClick={toggleVisual} disabled={media.visual === 'off'} data-testid="button-toggle-visual">
                  {visualPlaying ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
                  {visualPlaying ? 'Turn visuals off' : 'Play visuals'}
                </button>
                <span className="task-count">No autoplay</span>
              </div>
              <p className="media-note" role="status" data-testid="status-visual-message">{visualMessage}</p>
            </section>
            <p className="focus-reassurance">You can stay, pause, or change your mind.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
