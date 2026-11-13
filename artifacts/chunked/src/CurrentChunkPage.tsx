import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft, Check, ChevronLeft, ChevronRight, Clock3, Headphones, Image, ListTodo, Pause, Pencil,
  History, Play, RotateCcw, Settings2, Trash2, Volume2, VolumeX, X,
} from 'lucide-react';
import { isVideoUrl, validateDirectAudioUrl, validateDirectVisualUrl } from './focusMedia';
import { getFocusSessionCueEvents, type FocusSessionCueSnapshot } from './sessionCues';
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

export type CurrentChunkChecklistItem = {
  id: number | string;
  taskId: number | string;
  title: string;
  completed: boolean;
  order?: number;
};

export type AvailableChunk = CurrentChunk & { date: string };
export type TaskMoveDestination =
  | { type: 'next-chunk'; chunkId: number | string; date: string }
  | { type: 'tomorrow-same-chunk'; chunkId: number | string; date: string }
  | { type: 'other-chunk-date'; chunkId: number | string; date: string };

export type FocusMediaEntry = {
  id: string;
  title: string;
  url: string;
  kind: 'audio' | 'video' | 'image';
  thumbnailUrl?: string;
};

export type FocusSoundSource = 'video' | 'library' | 'silence';
export type FocusSessionCueSettings = { start: boolean; end: boolean };

export type FocusHistorySession = {
  id: number;
  date: string;
  chunkName: string;
  status: 'completed' | 'partial' | 'abandoned' | 'running' | 'paused';
  focusedSeconds: number;
  contextNote?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
};

export type FocusHistoryChunk = {
  chunkName: string;
  focusedSeconds: number;
  sessions: FocusHistorySession[];
};

export type FocusHistoryDay = {
  date: string;
  focusedSeconds: number;
  chunks: FocusHistoryChunk[];
};

export type FocusSessionState = {
  planId?: number;
  sessionId?: number | null;
  phase: 'focus' | 'break';
  active: boolean;
  paused: boolean;
  status?: string;
  targetSeconds: number;
  progressSeconds: number;
  remainingSeconds?: number;
  endsAt?: string | null;
  plannedSessions: number;
  completedSessions: number;
  focusMinutes: number;
  breakMinutes: number;
  transitions: 'manual' | 'automatic';
  chunkEndsAt?: string | number | null;
  availableSeconds?: number | null;
  totalPlanSeconds?: number;
  remainingPlanSeconds?: number;
  planExceedsChunk?: boolean;
  maxFocusMinutes?: number;
  remainingTargetSessions?: number;
  partialSession?: boolean;
};

export type FocusTimerAction = 'start' | 'pause' | 'resume' | 'reset' | 'finish' | 'sync';

export type CurrentChunkPageProps = {
  chunk: CurrentChunk;
  tasks: CurrentChunkTask[];
  date: string;
  userKey: string;
  onToggleTask: (task: CurrentChunkTask) => void;
  onBack: () => void;
  checklistItems?: CurrentChunkChecklistItem[];
  availableChunks?: AvailableChunk[];
  nextChunk?: AvailableChunk | null;
  session?: Partial<FocusSessionState>;
  focusHistory?: FocusHistoryDay[];
  nextSessionAutoStart?: { automaticMode: boolean; remainingTargetSeconds: number };
  mediaCatalog?: FocusMediaEntry[];
  selectedBackgroundId?: string | null;
  selectedSoundId?: string | null;
  soundSource?: FocusSoundSource;
  sessionCues?: FocusSessionCueSettings;
  volume?: number;
  muted?: boolean;
  reduceMotion?: boolean | null;
  onToggleChecklistItem?: (item: CurrentChunkChecklistItem) => void | Promise<void>;
  onAddChecklistItem?: (taskId: number | string, title: string) => void | Promise<void>;
  onUpdateChecklistItem?: (item: CurrentChunkChecklistItem) => void | Promise<void>;
  onDeleteChecklistItem?: (item: CurrentChunkChecklistItem) => void | Promise<void>;
  onMoveTask?: (task: CurrentChunkTask, destination: TaskMoveDestination) => void | Promise<void>;
  onDeleteParentTask?: (task: CurrentChunkTask) => void | Promise<void>;
  onSwitchToChunk?: (chunk: AvailableChunk, options: { autoStart: boolean; remainingTargetSeconds: number }) => void | Promise<void>;
  onSessionChange?: (session: FocusSessionState) => void;
  onTimerAction?: (action: FocusTimerAction, session: FocusSessionState) => void | Promise<void>;
  onSaveFocusContext?: (sessionId: number, contextNote: string | null) => void | Promise<void>;
  onPlanSettingsChange?: (session: FocusSessionState) => void | Promise<void>;
  onSelectBackground?: (entry: FocusMediaEntry | null) => void;
  onSelectSound?: (entry: FocusMediaEntry | null) => void;
  onSoundSourceChange?: (source: FocusSoundSource) => void;
  onSessionCuesChange?: (settings: FocusSessionCueSettings) => void;
  onVolumeChange?: (volume: number) => void;
  onMuteChange?: (muted: boolean) => void;
  onReduceMotionChange?: (reduceMotion: boolean) => void;
  onFinishSession?: (session: FocusSessionState) => void;
};

type Panel = 'tasks' | 'timer' | 'background' | 'sound' | 'history' | null;
const TASK_CARDS_PER_PAGE = 3;
const INITIAL_SESSION: FocusSessionState = {
  phase: 'focus', active: false, paused: false, targetSeconds: 25 * 60, progressSeconds: 0,
  plannedSessions: 1, completedSessions: 0, focusMinutes: 25, breakMinutes: 5, transitions: 'manual',
};

function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatRange(start?: string | null, end?: string | null) {
  if (!start && !end) return 'A little room, whenever you need it';
  return start && end ? `${start} – ${end}` : start || end || '';
}

function nextDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  parsed.setDate(parsed.getDate() + 1);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function chunkEndTimestamp(endTime?: string | null, explicit?: string | number | null, date?: string) {
  if (explicit !== undefined && explicit !== null) {
    const time = typeof explicit === 'number' ? explicit : new Date(explicit).getTime();
    if (Number.isFinite(time)) return time;
  }
  if (!endTime) return null;
  const match = endTime.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([ap]m))?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (match[3]) {
    const pm = match[3].toLowerCase() === 'pm';
    hours = (hours % 12) + (pm ? 12 : 0);
  }
  const end = date ? new Date(`${date}T12:00:00`) : new Date();
  if (Number.isNaN(end.getTime())) return null;
  end.setHours(hours, minutes, 0, 0);
  return end.getTime();
}

function formatPlanDuration(totalSeconds: number) {
  const totalMinutes = Math.ceil(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours} hr${hours === 1 ? '' : 's'}${minutes ? ` ${minutes} min` : ''}` : `${minutes} min`;
}

function formatFocusedTime(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours) return `${hours} hr${hours === 1 ? '' : 's'}${minutes ? ` ${minutes} min` : ''}`;
  if (totalMinutes) return `${totalMinutes} min`;
  return `${seconds} sec`;
}

function FocusHistorySessionCard({
  session,
  onSave,
}: {
  session: FocusHistorySession;
  onSave?: (sessionId: number, contextNote: string | null) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(session.contextNote ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const label = session.status === 'completed'
    ? 'Completed'
    : session.status === 'partial'
      ? 'Partial'
      : session.status === 'abandoned'
        ? 'Reset'
        : session.status === 'paused' ? 'Paused' : 'In progress';

  useEffect(() => setDraft(session.contextNote ?? ''), [session.contextNote]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onSave || saving) return;
    setSaving(true);
    setMessage('');
    try {
      await onSave(session.id, draft.trim() || null);
      setMessage('Saved');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'This note could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="room-history-session" data-testid={`card-focus-session-${session.id}`}>
      <div className="room-history-session-summary">
        <span className={`room-history-status is-${session.status}`} data-testid={`status-focus-session-${session.id}`}>{label}</span>
        <strong>{formatFocusedTime(session.focusedSeconds)}</strong>
      </div>
      <form className="room-history-note" onSubmit={submit}>
        <label htmlFor={`focus-context-${session.id}`}>Optional context</label>
        <textarea
          id={`focus-context-${session.id}`}
          value={draft}
          maxLength={500}
          disabled={!onSave || saving}
          onChange={(event) => { setDraft(event.target.value); setMessage(''); }}
          placeholder="Anything that shaped this session?"
          aria-describedby={`focus-context-hint-${session.id}`}
          data-testid={`input-focus-context-${session.id}`}
        />
        <div className="room-history-note-footer">
          <small id={`focus-context-hint-${session.id}`}>Optional. Add only what feels useful; up to 500 characters.</small>
          <button type="submit" disabled={!onSave || saving || draft === (session.contextNote ?? '')} data-testid={`button-save-focus-context-${session.id}`}>
            {saving ? 'Saving…' : 'Save note'}
          </button>
        </div>
        {message && <p className="room-history-note-message" role="status">{message}</p>}
      </form>
    </article>
  );
}

export default function CurrentChunkPage({
  chunk, tasks, date, onToggleTask, onBack, checklistItems = [], availableChunks = [], nextChunk = null,
  session: sessionProps, focusHistory = [], nextSessionAutoStart, onTimerAction, onSaveFocusContext, onPlanSettingsChange,
  mediaCatalog = [], selectedBackgroundId = null, selectedSoundId = null, volume: initialVolume = 28,
  soundSource: initialSoundSource, sessionCues: initialSessionCues = { start: false, end: false },
  muted: initialMuted = false, reduceMotion: reduceMotionProp,
  onToggleChecklistItem, onAddChecklistItem,
  onUpdateChecklistItem, onDeleteChecklistItem, onMoveTask, onDeleteParentTask, onSwitchToChunk, onSessionChange,
  onSelectBackground, onSelectSound, onSoundSourceChange, onSessionCuesChange, onVolumeChange, onMuteChange, onReduceMotionChange,
}: CurrentChunkPageProps) {
  const [session, setSession] = useState<FocusSessionState>(() => ({ ...INITIAL_SESSION, ...sessionProps }));
  const [remaining, setRemaining] = useState(() => Math.max(0, session.targetSeconds - session.progressSeconds));
  const sessionCueStateRef = useRef<FocusSessionCueSnapshot>({
    active: Boolean(session.active),
    paused: Boolean(session.paused),
    phase: session.phase,
    status: session.status ?? 'ready',
    sessionId: session.sessionId ?? null,
    remainingSeconds: session.remainingSeconds ?? Math.max(0, session.targetSeconds - session.progressSeconds),
  });
  const cueAudioContextRef = useRef<AudioContext | null>(null);
  const [now, setNow] = useState(Date.now());
  const [panel, setPanel] = useState<Panel>(null);
  const [hidden, setHidden] = useState(false);
  const [taskPage, setTaskPage] = useState(0);
  const [checklistDrafts, setChecklistDrafts] = useState<Record<string, string>>({});
  const [editingChecklistId, setEditingChecklistId] = useState<number | string | null>(null);
  const [editingChecklistDraft, setEditingChecklistDraft] = useState('');
  const [checklistDeleteConfirm, setChecklistDeleteConfirm] = useState<CurrentChunkChecklistItem | null>(null);
  const [boundaryVisible, setBoundaryVisible] = useState(sessionProps?.status === 'boundary');
  const [partialSession, setPartialSession] = useState(Boolean(sessionProps?.partialSession));
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [taskDestinations, setTaskDestinations] = useState<Record<string, 'next' | 'tomorrow' | 'other' | 'delete'>>({});
  const [otherTaskDestinations, setOtherTaskDestinations] = useState<Record<string, { chunkId: string; date: string }>>({});
  const [deleteParentConfirm, setDeleteParentConfirm] = useState<CurrentChunkTask | null>(null);
  const [resolvedTaskIds, setResolvedTaskIds] = useState<Set<string>>(() => new Set());
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(() => new Set());
  const boundaryHandled = useRef(sessionProps?.status === 'boundary');
  const completionHandled = useRef('');
  const boundaryRef = useRef<HTMLElement>(null);
  const leaveDialogRef = useRef<HTMLElement>(null);
  const roomRef = useRef<HTMLElement>(null);
  const leaveTriggerRef = useRef<HTMLElement | null>(null);
  const panelCloseRef = useRef<HTMLButtonElement>(null);
  const panelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const initialBackground = mediaCatalog.find((entry) => (
    entry.id === selectedBackgroundId && (entry.kind === 'video' || entry.kind === 'image')
  )) ?? null;
  const [backgroundId, setBackgroundId] = useState(initialBackground?.id ?? null);
  const [soundId, setSoundId] = useState(selectedSoundId);
  const [soundSource, setSoundSource] = useState<FocusSoundSource>(() => {
    const source = initialSoundSource ?? (selectedSoundId ? 'library' : 'silence');
    return source === 'video' && initialBackground?.kind !== 'video' ? 'silence' : source;
  });
  const [volume, setVolume] = useState(initialVolume);
  const [muted, setMuted] = useState(initialMuted);
  const [reduceMotion, setReduceMotion] = useState(() => {
    if (typeof reduceMotionProp === 'boolean') return reduceMotionProp;
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  const [hasSavedMotionChoice, setHasSavedMotionChoice] = useState(typeof reduceMotionProp === 'boolean');
  const [soundPlaying, setSoundPlaying] = useState(false);
  const [backgroundPlaying, setBackgroundPlaying] = useState(false);
  const [validation, setValidation] = useState('');
  const [switchingChunks, setSwitchingChunks] = useState(false);
  const backgroundVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const sessionSignature = JSON.stringify(sessionProps ?? {});
  const endAt = useMemo(() => chunkEndTimestamp(chunk.endTime, sessionProps?.chunkEndsAt, date), [chunk.endTime, sessionProps?.chunkEndsAt, date]);
  const checklist = useMemo(() => [...checklistItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [checklistItems]);
  const taskPageCount = Math.max(1, Math.ceil(tasks.length / TASK_CARDS_PER_PAGE));
  const visibleTasks = tasks.slice(taskPage * TASK_CARDS_PER_PAGE, (taskPage + 1) * TASK_CARDS_PER_PAGE);
  const selectedBackground = mediaCatalog.find((entry) => entry.id === backgroundId) ?? null;
  const selectedSound = mediaCatalog.find((entry) => entry.id === soundId) ?? null;
  const backgroundVisual = selectedBackground?.kind === 'video' && validateDirectVisualUrl(selectedBackground.url) && isVideoUrl(selectedBackground.url)
    ? selectedBackground.url
    : selectedBackground?.kind === 'image' ? validateDirectVisualUrl(selectedBackground.url) : null;
  const animatedImage = Boolean(selectedBackground?.kind === 'image' && /\.gif(?:$|[?#])/i.test(selectedBackground.url));
  const soundUrl = selectedSound?.kind === 'audio' ? validateDirectAudioUrl(selectedSound.url) : null;
  const librarySounds = mediaCatalog.filter((entry) => entry.kind === 'audio' && validateDirectAudioUrl(entry.url));
  const hasVideoSound = selectedBackground?.kind === 'video';
  const hostedVideoAudio = soundSource === 'video' && selectedBackground?.kind === 'video';
  const hasRoomMuteControl = (soundSource === 'library' && Boolean(soundUrl)) || hostedVideoAudio;
  const chunkRemaining = endAt === null ? null : Math.max(0, Math.ceil((endAt - now) / 1000));
  const progress = session.targetSeconds ? Math.min(100, Math.max(0, (session.progressSeconds + (session.active && !session.paused ? session.targetSeconds - session.progressSeconds - remaining : 0)) / session.targetSeconds * 100)) : 0;

  const getCueAudioContext = () => {
    if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return null;
    if (!cueAudioContextRef.current || cueAudioContextRef.current.state === 'closed') {
      cueAudioContextRef.current = new window.AudioContext();
    }
    return cueAudioContextRef.current;
  };
  const primeSessionCueAudio = () => {
    if (!initialSessionCues.start && !initialSessionCues.end) return;
    const context = getCueAudioContext();
    if (!context) {
      setValidation('Session sounds are not available in this browser.');
      return;
    }
    if (context.state === 'suspended') void context.resume().catch(() => {
      setValidation('The browser could not enable session sounds.');
    });
  };
  const playSessionCue = useCallback((cue: 'start' | 'end') => {
    if (!initialSessionCues[cue]) return;
    const context = getCueAudioContext();
    if (!context) {
      setValidation('Session sounds are not available in this browser.');
      return;
    }
    const play = () => {
      const notes = cue === 'start' ? [523.25, 659.25] : [659.25, 523.25];
      const origin = context.currentTime + 0.015;
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const noteStart = origin + index * 0.13;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, noteStart);
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.075, noteStart + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.22);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(noteStart);
        oscillator.stop(noteStart + 0.24);
      });
    };
    if (context.state === 'suspended') {
      void context.resume().then(play).catch(() => {
        setValidation('The browser could not play the session sound.');
      });
    } else {
      play();
    }
  }, [initialSessionCues.start, initialSessionCues.end]);

  const publishSession = useCallback((next: FocusSessionState, action?: FocusTimerAction) => {
    setSession(next);
    onSessionChange?.(next);
    if (action) {
      void Promise.resolve(onTimerAction?.(action, next)).catch((error: unknown) => {
        setValidation(error instanceof Error ? error.message : 'The timer could not be saved.');
      });
    }
  }, [onSessionChange, onTimerAction]);

  useEffect(() => {
    const nextBackground = mediaCatalog.find((entry) => (
      entry.id === selectedBackgroundId && (entry.kind === 'video' || entry.kind === 'image')
    ));
    setBackgroundId(nextBackground?.id ?? null);
  }, [selectedBackgroundId, mediaCatalog]);
  useEffect(() => {
    setTaskPage((current) => Math.min(current, Math.max(0, taskPageCount - 1)));
  }, [taskPageCount]);
  useEffect(() => {
    setSoundId(selectedSoundId);
    setSoundPlaying(false);
    if (audioRef.current) audioRef.current.pause();
  }, [selectedSoundId]);
  useEffect(() => {
    if (initialSoundSource !== undefined) {
      const nextSource = initialSoundSource === 'video' && selectedBackground?.kind !== 'video'
        ? 'silence'
        : initialSoundSource;
      setSoundSource(nextSource);
      if (nextSource !== initialSoundSource) onSoundSourceChange?.(nextSource);
      setSoundPlaying(false);
      if (audioRef.current) audioRef.current.pause();
    }
  }, [initialSoundSource, selectedBackground?.kind]);
  useEffect(() => {
    if (reduceMotionProp === undefined || reduceMotionProp === null) {
      setHasSavedMotionChoice(false);
      setReduceMotion(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      return;
    }
    setHasSavedMotionChoice(true);
    setReduceMotion(reduceMotionProp);
  }, [reduceMotionProp]);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = (event: MediaQueryListEvent | MediaQueryList) => {
      if (!hasSavedMotionChoice) setReduceMotion(event.matches);
    };
    preference.addEventListener?.('change', updatePreference as (event: MediaQueryListEvent) => void);
    if (!preference.addEventListener) preference.addListener(updatePreference as (event: MediaQueryListEvent) => void);
    return () => {
      preference.removeEventListener?.('change', updatePreference as (event: MediaQueryListEvent) => void);
      if (!preference.removeEventListener) preference.removeListener(updatePreference as (event: MediaQueryListEvent) => void);
    };
  }, [hasSavedMotionChoice]);
  useEffect(() => {
    if (!reduceMotion) return;
    if (backgroundVideoRef.current && !backgroundVideoRef.current.paused) {
      backgroundVideoRef.current.pause();
      setBackgroundPlaying(false);
    }
    if (animatedImage) setBackgroundPlaying(false);
  }, [reduceMotion, animatedImage, selectedBackground?.id]);
  useEffect(() => setVolume(initialVolume), [initialVolume]);
  useEffect(() => setMuted(initialMuted), [initialMuted]);
  useEffect(() => {
    setSession((current) => ({ ...current, ...sessionProps }));
    if (sessionProps?.remainingSeconds !== undefined) setRemaining(sessionProps.remainingSeconds);
    if (sessionProps?.status === 'boundary') {
      setBoundaryVisible(true);
      setPartialSession(Boolean(sessionProps.partialSession));
      boundaryHandled.current = true;
    }
  }, [sessionSignature]);
  useEffect(() => {
    const current: FocusSessionCueSnapshot = {
      active: Boolean(session.active),
      paused: Boolean(session.paused),
      phase: session.phase,
      status: session.status ?? 'ready',
      sessionId: session.sessionId ?? null,
      remainingSeconds: session.remainingSeconds ?? Math.max(0, session.targetSeconds - session.progressSeconds),
    };
    const events = getFocusSessionCueEvents(sessionCueStateRef.current, current);
    if (events.end) playSessionCue('end');
    if (events.start) playSessionCue('start');
    sessionCueStateRef.current = current;
  }, [
    session.active, session.paused, session.phase, session.status, session.sessionId,
    session.remainingSeconds, session.targetSeconds, session.progressSeconds, playSessionCue,
  ]);
  useEffect(() => () => {
    const context = cueAudioContextRef.current;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
    cueAudioContextRef.current = null;
  }, []);
  useEffect(() => {
    const clock = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (session.active && !session.paused && session.endsAt) {
        setRemaining(Math.max(0, Math.ceil((new Date(session.endsAt).getTime() - currentTime) / 1000)));
      } else if (!session.active || session.paused) {
        setRemaining(session.remainingSeconds ?? Math.max(0, session.targetSeconds - session.progressSeconds));
      }
    }, 500);
    return () => window.clearInterval(clock);
  }, [session.active, session.paused, session.endsAt, session.progressSeconds, session.remainingSeconds, session.targetSeconds]);
  useEffect(() => {
    if (!session.active || session.paused || remaining > 0 || !session.endsAt) return;
    const completionKey = `${session.planId ?? ''}:${session.sessionId ?? ''}:${session.phase}:${session.endsAt}`;
    if (completionHandled.current === completionKey) return;
    completionHandled.current = completionKey;
    const finished: FocusSessionState = {
      ...session,
      active: false,
      paused: false,
      progressSeconds: session.targetSeconds,
      remainingSeconds: 0,
      endsAt: null,
    };
    setRemaining(0);
    publishSession(finished, 'sync');
  }, [publishSession, remaining, session]);
  useEffect(() => {
    if (chunkRemaining === null || chunkRemaining > 0 || boundaryHandled.current) return;
    boundaryHandled.current = true;
    const wasPartial = Boolean(session.partialSession) || (session.phase === 'focus' && remaining > 0
      && (session.active || session.paused || session.progressSeconds > 0));
    const stopped: FocusSessionState = {
      ...session,
      active: false,
      paused: false,
      progressSeconds: Math.max(session.progressSeconds, session.targetSeconds - remaining),
      remainingSeconds: 0,
      endsAt: null,
      status: 'boundary',
    };
    setPartialSession(wasPartial);
    publishSession(stopped, 'sync');
    setBoundaryVisible(true);
  }, [chunkRemaining, publishSession, remaining, session]);
  useEffect(() => {
    if (!session.active && !session.paused) return undefined;
    const confirmBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', confirmBeforeUnload);
    return () => window.removeEventListener('beforeunload', confirmBeforeUnload);
  }, [session.active, session.paused]);
  useEffect(() => {
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (leaveConfirmOpen) {
          setLeaveConfirmOpen(false);
          event.preventDefault();
          return;
        }
        if (boundaryVisible) return;
        if (panel) { setPanel(null); event.preventDefault(); }
        else if (!hidden) setHidden(true);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (event.code === 'Space' && !panel && target?.tagName !== 'BUTTON'
        && target?.tagName !== 'INPUT' && target?.tagName !== 'TEXTAREA') {
        event.preventDefault();
        toggleSession();
      }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [boundaryVisible, hidden, leaveConfirmOpen, panel]);
  useEffect(() => {
    if (panel) panelCloseRef.current?.focus();
    else panelTriggerRef.current?.focus();
  }, [panel]);
  useEffect(() => {
    const room = roomRef.current;
    if (!room || !panel) return undefined;

    const viewport = window.visualViewport;
    let frame = 0;
    let blurTimeout = 0;
    const updateKeyboardLayout = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const activeElement = document.activeElement;
        const textField = activeElement instanceof HTMLTextAreaElement
          || (activeElement instanceof HTMLInputElement
            && !['button', 'checkbox', 'file', 'hidden', 'radio', 'range', 'reset', 'submit'].includes(activeElement.type));

        if (!textField) {
          room.style.setProperty('--room-keyboard-inset', '0px');
          room.style.removeProperty('--room-panel-max-height');
          return;
        }

        const visibleHeight = viewport?.height ?? window.innerHeight;
        const keyboardInset = Math.max(
          0,
          window.innerHeight - visibleHeight - (viewport?.offsetTop ?? 0),
        );
        room.style.setProperty('--room-keyboard-inset', `${keyboardInset}px`);
        room.style.setProperty('--room-panel-max-height', `${Math.max(144, visibleHeight - 80)}px`);

        const content = room.querySelector<HTMLElement>('.room-panel-content');
        if (!content) return;
        const form = activeElement.closest('form');
        const target = form instanceof HTMLElement ? form : activeElement;
        const contentRect = content.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const margin = 12;

        if (targetRect.bottom > contentRect.bottom - margin) {
          content.scrollTop += targetRect.bottom - contentRect.bottom + margin;
        } else if (targetRect.top < contentRect.top + margin) {
          content.scrollTop -= contentRect.top - targetRect.top + margin;
        }
      });
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        window.clearTimeout(blurTimeout);
        updateKeyboardLayout();
      }
    };
    const handleFocusOut = () => {
      window.clearTimeout(blurTimeout);
      blurTimeout = window.setTimeout(updateKeyboardLayout, 100);
    };

    room.addEventListener('focusin', handleFocusIn);
    room.addEventListener('focusout', handleFocusOut);
    viewport?.addEventListener('resize', updateKeyboardLayout);
    viewport?.addEventListener('scroll', updateKeyboardLayout);
    updateKeyboardLayout();

    return () => {
      room.removeEventListener('focusin', handleFocusIn);
      room.removeEventListener('focusout', handleFocusOut);
      viewport?.removeEventListener('resize', updateKeyboardLayout);
      viewport?.removeEventListener('scroll', updateKeyboardLayout);
      window.clearTimeout(blurTimeout);
      window.cancelAnimationFrame(frame);
      room.style.removeProperty('--room-keyboard-inset');
      room.style.removeProperty('--room-panel-max-height');
    };
  }, [panel]);
  useEffect(() => {
    if (!boundaryVisible || !boundaryRef.current) return undefined;
    const dialog = boundaryRef.current;
    const firstSelect = dialog.querySelector<HTMLElement>('select:not([disabled])');
    firstSelect?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', trapFocus);
    return () => dialog.removeEventListener('keydown', trapFocus);
  }, [boundaryVisible]);
  useEffect(() => {
    if (!leaveConfirmOpen || !leaveDialogRef.current) return undefined;
    const dialog = leaveDialogRef.current;
    const stayButton = dialog.querySelector<HTMLElement>('[data-testid="button-stay-in-room"]');
    stayButton?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setLeaveConfirmOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', trapFocus);
    return () => dialog.removeEventListener('keydown', trapFocus);
  }, [leaveConfirmOpen]);
  useEffect(() => {
    if (!leaveConfirmOpen) leaveTriggerRef.current?.focus();
  }, [leaveConfirmOpen]);
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.min(1, Math.max(0, volume / 100));
      audioRef.current.muted = muted || soundSource !== 'library';
    }
    if (backgroundVideoRef.current) {
      backgroundVideoRef.current.volume = Math.min(1, Math.max(0, volume / 100));
      backgroundVideoRef.current.muted = muted || soundSource !== 'video' || selectedBackground?.kind !== 'video';
    }
  }, [muted, volume, soundUrl, soundSource, selectedBackground?.kind]);

  const toggleSession = () => {
    if (session.active && !session.paused) {
      const next = {
        ...session,
        active: false,
        paused: true,
        progressSeconds: session.targetSeconds - remaining,
        remainingSeconds: remaining,
        endsAt: null,
        status: 'paused',
      };
      publishSession(next, 'pause');
      return;
    }
    const resume = session.paused;
    if (session.phase === 'focus') primeSessionCueAudio();
    const targetSeconds = session.phase === 'focus' ? session.focusMinutes * 60 : session.breakMinutes * 60;
    const nextRemaining = resume ? remaining : targetSeconds;
    const next = {
      ...session,
      active: true,
      paused: false,
      targetSeconds,
      progressSeconds: resume ? session.progressSeconds : 0,
      remainingSeconds: nextRemaining,
      endsAt: new Date(Date.now() + nextRemaining * 1000).toISOString(),
      status: 'running',
    };
    setRemaining(nextRemaining);
    publishSession(next, resume ? 'resume' : 'start');
  };
  const resetSession = () => {
    const targetSeconds = session.phase === 'focus' ? session.focusMinutes * 60 : session.breakMinutes * 60;
    const next = {
      ...session,
      active: false,
      paused: false,
      targetSeconds,
      progressSeconds: 0,
      remainingSeconds: targetSeconds,
      endsAt: null,
      status: 'ready',
    };
    setRemaining(next.targetSeconds);
    publishSession(next, 'reset');
  };
  const startPhase = (phase: 'focus' | 'break') => {
    if (phase === 'focus') primeSessionCueAudio();
    const targetSeconds = (phase === 'focus' ? session.focusMinutes : session.breakMinutes) * 60;
    const next = {
      ...session,
      phase,
      targetSeconds,
      progressSeconds: 0,
      active: true,
      paused: false,
      remainingSeconds: targetSeconds,
      endsAt: new Date(Date.now() + targetSeconds * 1000).toISOString(),
      status: 'running',
    };
    setRemaining(targetSeconds);
    publishSession(next, 'start');
  };
  const finishSession = () => {
    const next = {
      ...session, active: false, paused: false,
      completedSessions: session.phase === 'focus' ? Math.min(session.plannedSessions, session.completedSessions + 1) : session.completedSessions,
      progressSeconds: Math.max(session.progressSeconds, session.targetSeconds - remaining),
      remainingSeconds: 0,
      endsAt: null,
      status: session.phase === 'focus' && session.completedSessions + 1 >= session.plannedSessions ? 'completed' : 'ready',
    };
    setRemaining(0);
    publishSession(next, 'finish');
  };
  const updateSettings = (patch: Partial<FocusSessionState>, persist = true) => {
    if (session.active || session.paused) return;
    const next = { ...session, ...patch };
    if (patch.focusMinutes !== undefined && next.phase === 'focus') next.targetSeconds = next.focusMinutes * 60;
    if (patch.breakMinutes !== undefined && next.phase === 'break') next.targetSeconds = next.breakMinutes * 60;
    if (patch.focusMinutes !== undefined || patch.breakMinutes !== undefined) {
      next.progressSeconds = 0;
      next.remainingSeconds = next.targetSeconds;
      next.endsAt = null;
      setRemaining(next.targetSeconds);
    }
    publishSession(next);
    if (persist) {
      void Promise.resolve(onPlanSettingsChange?.(next)).catch((error: unknown) => {
        setValidation(error instanceof Error ? error.message : 'Timer settings could not be saved.');
      });
    }
  };
  const savePlanSettings = () => {
    void Promise.resolve(onPlanSettingsChange?.(session)).catch((error: unknown) => {
      setValidation(error instanceof Error ? error.message : 'Timer settings could not be saved.');
    });
  };
  const chooseSoundSource = (source: FocusSoundSource) => {
    setSoundSource(source);
    onSoundSourceChange?.(source);
    setValidation('');
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setSoundPlaying(false);
  };
  const selectBackground = (entry: FocusMediaEntry | null) => {
    const nextId = entry?.id ?? null;
    setBackgroundId(nextId);
    setBackgroundPlaying(false);
    setValidation('');
    if (soundSource === 'video' && entry?.kind !== 'video') chooseSoundSource('silence');
    onSelectBackground?.(entry);
  };
  const selectSound = (entry: FocusMediaEntry | null) => {
    setSoundId(entry?.id ?? null);
    setValidation('');
    setSoundPlaying(false);
    if (entry) chooseSoundSource('library');
    onSelectSound?.(entry);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };
  const toggleBackground = async () => {
    if (reduceMotion && (selectedBackground?.kind === 'video' || animatedImage)) {
      setValidation('Turn off Reduce motion before playing moving background media.');
      return;
    }
    if (selectedBackground?.kind === 'video' && backgroundVideoRef.current) {
      if (backgroundPlaying) {
        backgroundVideoRef.current.pause();
        setBackgroundPlaying(false);
      } else {
        try {
          await backgroundVideoRef.current.play();
          setBackgroundPlaying(true);
        } catch {
          setValidation('This video could not be played in this browser.');
        }
      }
    } else if (backgroundVisual) {
      setBackgroundPlaying((playing) => !playing);
    } else {
      setValidation('Choose a stored image or video to place behind the room.');
    }
  };
  const toggleSound = async () => {
    if (soundSource !== 'library' || !soundUrl || !audioRef.current) {
      setValidation('Choose a library track before playing separate audio.');
      return;
    }
    if (audioRef.current.paused) {
      try {
        await audioRef.current.play();
        setSoundPlaying(true);
      } catch {
        setValidation('This sound could not be played. You can still use the room quietly.');
      }
    } else {
      audioRef.current.pause();
      setSoundPlaying(false);
    }
  };
  const changeVolume = (value: number) => {
    const next = Math.min(100, Math.max(0, value));
    setVolume(next);
    onVolumeChange?.(next);
  };
  const changeMute = () => {
    setMuted((value) => {
      onMuteChange?.(!value);
      return !value;
    });
  };
  const toggleReduceMotion = () => {
    const next = !reduceMotion;
    setHasSavedMotionChoice(true);
    setReduceMotion(next);
    onReduceMotionChange?.(next);
  };
  const requestLeave = () => {
    if (session.active || session.paused) {
      leaveTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setLeaveConfirmOpen(true);
      return;
    }
    onBack();
  };
  const confirmLeave = () => {
    setLeaveConfirmOpen(false);
    leaveTriggerRef.current = null;
    onBack();
  };
  const toggleChecklist = (item: CurrentChunkChecklistItem) => {
    const updated = { ...item, completed: !item.completed };
    if (!onToggleChecklistItem) return;
    void Promise.resolve(onToggleChecklistItem(updated)).catch((error: unknown) => {
      setValidation(error instanceof Error ? error.message : 'Checklist step could not be updated.');
    });
  };
  const addChecklistItem = (taskId: number | string, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const key = String(taskId);
    const title = (checklistDrafts[key] ?? '').trim();
    if (!title || title.length > 120 || !onAddChecklistItem) return;
    void Promise.resolve(onAddChecklistItem(taskId, title)).catch((error: unknown) => {
      setValidation(error instanceof Error ? error.message : 'Checklist step could not be added.');
    });
    setChecklistDrafts((current) => ({ ...current, [key]: '' }));
  };
  const saveChecklistEdit = (event: FormEvent<HTMLFormElement>, item: CurrentChunkChecklistItem) => {
    event.preventDefault();
    const title = editingChecklistDraft.trim();
    if (!title || title.length > 120 || !onUpdateChecklistItem) return;
    void Promise.resolve(onUpdateChecklistItem({ ...item, title })).catch((error: unknown) => {
      setValidation(error instanceof Error ? error.message : 'Checklist step could not be updated.');
    });
    setEditingChecklistId(null);
    setEditingChecklistDraft('');
  };
  const confirmChecklistDelete = () => {
    if (!checklistDeleteConfirm || !onDeleteChecklistItem) return;
    void Promise.resolve(onDeleteChecklistItem(checklistDeleteConfirm)).catch((error: unknown) => {
      setValidation(error instanceof Error ? error.message : 'Checklist step could not be deleted.');
    });
    setChecklistDeleteConfirm(null);
  };
  const chooseTaskDestination = (task: CurrentChunkTask) => {
    const id = String(task.id);
    const choice = taskDestinations[id];
    if (!choice) return;
    if (choice === 'delete') {
      setDeleteParentConfirm(task);
      return;
    }
    let destination: TaskMoveDestination | null = null;
    if (choice === 'next' && nextChunk) {
      destination = { type: 'next-chunk', chunkId: nextChunk.id, date: nextChunk.date };
    } else if (choice === 'tomorrow') {
      const tomorrowDate = nextDate(date);
      if (tomorrowDate) destination = { type: 'tomorrow-same-chunk', chunkId: chunk.id, date: tomorrowDate };
    } else if (choice === 'other') {
      const selection = otherTaskDestinations[id];
      if (selection?.chunkId && selection.date) {
        destination = { type: 'other-chunk-date', chunkId: selection.chunkId, date: selection.date };
      }
    }
    if (!destination || !onMoveTask) return;
    setPendingTaskIds((current) => new Set(current).add(id));
    void Promise.resolve().then(() => onMoveTask(task, destination)).then(() => {
      setResolvedTaskIds((current) => new Set(current).add(id));
    }).catch(() => {
      setValidation(`Could not move “${task.title}”. Please try again.`);
    }).finally(() => {
      setPendingTaskIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    });
  };
  const confirmParentTaskDelete = () => {
    if (!deleteParentConfirm || !onDeleteParentTask) return;
    const task = deleteParentConfirm;
    const id = String(task.id);
    setPendingTaskIds((current) => new Set(current).add(id));
    void Promise.resolve().then(() => onDeleteParentTask(task)).then(() => {
      setResolvedTaskIds((current) => new Set(current).add(id));
      setDeleteParentConfirm(null);
    }).catch(() => {
      setValidation(`Could not delete “${task.title}”. Please try again.`);
    }).finally(() => {
      setPendingTaskIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    });
  };
  const proceedToNextChunk = () => {
    if (!nextChunk || !canSwitchToNext || !onSwitchToChunk || switchingChunks) return;
    const permittedTarget = Math.max(0, nextSessionAutoStart?.remainingTargetSeconds ?? 0);
    const autoStart = nextSessionAutoStart?.automaticMode === true && permittedTarget > 0;
    setSwitchingChunks(true);
    void Promise.resolve(onSwitchToChunk(nextChunk, { autoStart, remainingTargetSeconds: permittedTarget }))
      .then(() => setSwitchingChunks(false))
      .catch((error: unknown) => {
        setSwitchingChunks(false);
        setValidation(error instanceof Error ? error.message : 'Could not continue to the next chunk. Please try again.');
      });
  };
  const onSessionTimeInput = (field: 'focusMinutes' | 'breakMinutes' | 'plannedSessions', value: string) => {
    const parsed = Number(value);
    const maxFocusMinutes = chunkRemaining === null
      ? 180
      : Math.min(180, Math.floor(chunkRemaining / 60));
    const max = field === 'focusMinutes' ? maxFocusMinutes : field === 'breakMinutes' ? 180 : 12;
    const minimum = field === 'breakMinutes' ? 0 : 1;
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > max) {
      setValidation(field === 'focusMinutes'
        ? `Focus can be from 1 to ${maxFocusMinutes} minutes in this chunk.`
        : field === 'breakMinutes' ? 'Breaks can be from 0 to 180 minutes.' : 'Choose 1 to 12 focus sessions.');
      return;
    }
    setValidation('');
    updateSettings(field === 'plannedSessions' ? { plannedSessions: parsed } : { [field]: parsed }, false);
  };
  const completedSteps = checklist.filter((item) => item.completed).length;
  const plannedTotalSeconds = session.plannedSessions * session.focusMinutes * 60
    + Math.max(0, session.plannedSessions - 1) * session.breakMinutes * 60;
  const remainingTarget = Math.max(0, session.plannedSessions - session.completedSessions);
  const remainingPlanSeconds = session.remainingPlanSeconds
    ?? (remainingTarget * session.focusMinutes * 60 + Math.max(0, remainingTarget - 1) * session.breakMinutes * 60);
  const planExceedsChunk = chunkRemaining !== null && remainingPlanSeconds > chunkRemaining;
  const maxFocusMinutes = chunkRemaining === null ? 180 : Math.min(180, Math.floor(chunkRemaining / 60));
  const unfinishedTasks = tasks.filter((task) => !task.completedAt);
  const unresolvedTasks = unfinishedTasks.filter((task) => !resolvedTaskIds.has(String(task.id)));
  const canSwitchToNext = Boolean(nextChunk && onSwitchToChunk && unresolvedTasks.length === 0);
  const usableMedia = mediaCatalog.filter((entry) => entry.kind === 'audio' || entry.kind === 'video' || entry.kind === 'image');

  return (
    <main ref={roomRef} className={`focus-room${hidden ? ' is-hidden' : ''}${reduceMotion ? ' is-reduced-motion' : ''}`} data-testid="focus-room">
      <div className={`room-backdrop${backgroundPlaying && backgroundVisual ? ' has-media' : ''}`} aria-hidden="true">
        {backgroundVisual && selectedBackground?.kind === 'image' && backgroundPlaying && !(reduceMotion && animatedImage) && (
          <img className="room-background-image" src={backgroundVisual} alt="" />
        )}
        {backgroundVisual && selectedBackground?.kind === 'video' && (
          <video
            ref={backgroundVideoRef}
            className="room-background-video"
            src={backgroundVisual}
            muted={muted || soundSource !== 'video' || selectedBackground?.kind !== 'video'}
            loop
            playsInline
            aria-hidden="true"
          />
        )}
      </div>
      <div className="room-wash" aria-hidden="true" />
      {soundUrl && (
        <audio
          ref={audioRef}
          src={soundUrl}
          loop
          preload="none"
          aria-hidden="true"
          onError={() => { setSoundPlaying(false); setValidation('This sound could not be loaded.'); }}
          onPlay={() => { setSoundPlaying(true); setValidation(''); }}
          onPause={() => setSoundPlaying(false)}
        />
      )}

      {!hidden && (
        <>
          <header className="room-header">
            <button type="button" className="room-back" onClick={requestLeave} data-testid="button-focus-back">
              <ArrowLeft size={17} aria-hidden="true" /><span>Leave room</span>
            </button>
            <div className="room-identity">
              <span className="room-mark" aria-hidden="true"><span /></span>
              <span>chunked</span>
            </div>
            <div className="room-chunk">
              <span className="room-chunk-name" data-testid="text-chunk-name">{chunk.name}</span>
              <span className="room-chunk-time" data-testid="text-chunk-time">{formatRange(chunk.startTime, chunk.endTime)}</span>
            </div>
            <div className="room-until" aria-label={chunkRemaining === null ? 'Chunk end time unavailable' : `${formatClock(chunkRemaining)} until this chunk ends`}>
              <Clock3 size={15} aria-hidden="true" />
              <span><small>CHUNK ENDS IN</small><strong data-testid="text-chunk-countdown">{chunkRemaining === null ? '—' : formatClock(chunkRemaining)}</strong></span>
            </div>
          </header>

          <section className="room-center" aria-label="Current focus session">
            <p className="room-overline">{session.phase === 'focus' ? 'A little focus' : 'A little pause'}</p>
            <h1 className="room-timer" role="timer" aria-label={`${formatClock(remaining)} remaining`} data-testid="text-session-countdown">{formatClock(remaining)}</h1>
            <div className="room-progress" role="progressbar" aria-label="Session progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
              <span style={{ width: `${progress}%` }} />
            </div>
            <p className="room-invitation" aria-live="polite">
              {partialSession ? 'This session ended with the chunk. It counts as partial.' : session.active && !session.paused ? 'You’re here. That is enough.' : session.paused ? 'Paused. Take the time you need.' : 'One manageable piece at a time.'}
            </p>
            <div className="room-main-controls">
              <button
                type="button"
                className="room-start"
                onClick={toggleSession}
                disabled={!onTimerAction || (!session.active && !session.paused && (planExceedsChunk || session.status === 'completed' || session.status === 'boundary' || session.completedSessions >= session.plannedSessions))}
                data-testid="button-session-toggle"
              >
                {session.active && !session.paused ? <><Pause size={17} /> Pause</> : <><Play size={17} fill="currentColor" />{session.paused ? 'Resume' : session.phase === 'break' ? 'Begin break' : 'Begin when ready'}</>}
              </button>
              {(session.active || session.paused || session.progressSeconds > 0) && (
                <button type="button" className="room-icon-control" onClick={resetSession} aria-label="Reset this session" data-testid="button-session-reset"><RotateCcw size={17} /></button>
              )}
              {session.phase === 'focus' && (session.active || session.paused) && (
                <button type="button" className="room-finish" onClick={finishSession} disabled={!onTimerAction} data-testid="button-session-finish">Finish</button>
              )}
            </div>
            <p className="room-session-count" data-testid="text-session-count">{session.completedSessions} of {session.plannedSessions} sessions · {session.transitions === 'automatic' ? 'breaks included' : 'at your pace'}</p>
          </section>

          {panel && (
            <section id="focus-room-panel" className={`room-panel room-panel-${panel}`} aria-labelledby="focus-room-panel-heading">
              <div className="room-panel-heading">
                <div>
                  <p className="room-panel-kicker">{panel === 'tasks' ? 'THE SMALL STEPS' : panel === 'timer' ? 'MAKE IT YOURS' : panel === 'background' ? 'A PLACE TO LAND' : panel === 'history' ? 'A LOOK BACK' : 'OPTIONAL ATMOSPHERE'}</p>
                  <h2 id="focus-room-panel-heading">{panel === 'tasks' ? 'Your checklist' : panel === 'timer' ? 'Timer settings' : panel === 'background' ? 'Background' : panel === 'history' ? 'Recent focus' : 'Sound'}</h2>
                </div>
                <button ref={panelCloseRef} type="button" className="room-panel-close" onClick={() => setPanel(null)} aria-label="Close panel"><X size={18} /></button>
              </div>

              {panel === 'history' && (
                <div className="room-panel-content room-history-content" data-testid="section-focus-history">
                  <p className="room-panel-note">A gentle look at the last 30 days. Time reflects focus recorded for each session; notes are yours to add or leave blank.</p>
                  {focusHistory.length === 0 ? (
                    <p className="room-empty" data-testid="text-focus-history-empty">Your focus history will appear here when you start a session.</p>
                  ) : (
                    <div className="room-history-days">
                      {focusHistory.map((day) => (
                        <section className="room-history-day" key={day.date} data-testid={`section-focus-day-${day.date}`}>
                          <header>
                            <h3>{new Intl.DateTimeFormat('en', { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(`${day.date}T12:00:00`))}</h3>
                            <strong data-testid={`text-focus-day-total-${day.date}`}>{formatFocusedTime(day.focusedSeconds)}</strong>
                          </header>
                          {day.chunks.map((historyChunk) => (
                            <section className="room-history-chunk" key={`${day.date}-${historyChunk.chunkName}`} data-testid={`section-focus-chunk-${day.date}-${historyChunk.chunkName}`}>
                              <header><h4>{historyChunk.chunkName}</h4><span>{formatFocusedTime(historyChunk.focusedSeconds)}</span></header>
                              {historyChunk.sessions.map((historySession) => (
                                <FocusHistorySessionCard
                                  key={historySession.id}
                                  session={historySession}
                                  onSave={onSaveFocusContext}
                                />
                              ))}
                            </section>
                          ))}
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {panel === 'tasks' && (
                <div className="room-panel-content">
                  <p className="room-panel-note">{completedSteps} of {checklist.length} steps complete. This list is separate from marking a task done.</p>
                  <div className="room-task-cards" data-testid="list-room-checklist">
                    {tasks.length === 0 ? <p className="room-empty">No parent tasks are assigned to this chunk yet.</p> : visibleTasks.map((task) => {
                      const taskItems = checklist.filter((item) => String(item.taskId) === String(task.id));
                      const taskId = String(task.id);
                      const taskCompleted = Boolean(task.completedAt);
                      const draft = checklistDrafts[taskId] ?? '';
                      return (
                        <article className={`room-task-card${taskCompleted ? ' parent-complete' : ''}`} key={task.id} data-testid={`card-room-task-${task.id}`}>
                          <div className="room-parent-task">
                            <button type="button" className="room-parent-toggle" onClick={() => onToggleTask(task)} aria-label={`${taskCompleted ? 'Reopen' : 'Complete'} parent task: ${task.title}`} aria-pressed={taskCompleted} data-testid={`button-toggle-parent-task-${task.id}`}>
                              {taskCompleted && <Check size={13} />}
                            </button>
                            <div className="room-parent-copy">
                              <p className="room-parent-title">{task.title}</p>
                              {task.description && <p className="room-parent-description">{task.description}</p>}
                            </div>
                            <span className="room-parent-progress">{taskItems.filter((item) => item.completed).length}/{taskItems.length}</span>
                          </div>
                          <div className="room-checklist">
                            {taskItems.length === 0 ? <p className="room-child-empty">No small steps added.</p> : taskItems.map((item) => (
                              <div key={item.id} className={`room-check-item${item.completed ? ' is-complete' : ''}`}>
                                {editingChecklistId === item.id ? (
                                  <form className="room-check-edit" onSubmit={(event) => saveChecklistEdit(event, item)}>
                                    <label className="visually-hidden" htmlFor={`edit-checklist-${item.id}`}>Edit checklist item</label>
                                    <input id={`edit-checklist-${item.id}`} value={editingChecklistDraft} maxLength={120} onChange={(event) => setEditingChecklistDraft(event.target.value)} autoFocus />
                                    <button type="submit" disabled={!editingChecklistDraft.trim() || !onUpdateChecklistItem}>Save</button>
                                    <button type="button" onClick={() => { setEditingChecklistId(null); setEditingChecklistDraft(''); }}>Cancel</button>
                                  </form>
                                ) : (
                                  <>
                                    <input id={`checklist-${item.id}`} type="checkbox" checked={item.completed} disabled={!onToggleChecklistItem} onChange={() => toggleChecklist(item)} data-testid={`checkbox-checklist-${item.id}`} />
                                    <span className="room-check-box" aria-hidden="true">{item.completed && <Check size={13} />}</span>
                                    <label className="room-check-label" htmlFor={`checklist-${item.id}`}>{item.title}</label>
                                    <div className="room-check-actions">
                                      <button type="button" disabled={!onUpdateChecklistItem} onClick={() => { setEditingChecklistId(item.id); setEditingChecklistDraft(item.title); }} aria-label={`Edit ${item.title}`} data-testid={`button-edit-checklist-${item.id}`}><Pencil size={14} /></button>
                                      <button type="button" disabled={!onDeleteChecklistItem} onClick={() => setChecklistDeleteConfirm(item)} aria-label={`Delete ${item.title}`} data-testid={`button-delete-checklist-${item.id}`}><Trash2 size={14} /></button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                          {checklistDeleteConfirm && String(checklistDeleteConfirm.taskId) === taskId && (
                            <div className="room-check-delete-confirm" role="alertdialog" aria-label={`Delete checklist item ${checklistDeleteConfirm.title}`}>
                              <span>Delete “{checklistDeleteConfirm.title}” from this checklist?</span>
                              <button type="button" onClick={() => setChecklistDeleteConfirm(null)}>Keep</button>
                              <button type="button" className="danger" onClick={confirmChecklistDelete} disabled={!onDeleteChecklistItem}>Delete</button>
                            </div>
                          )}
                          <form className="room-add-step" onSubmit={(event) => addChecklistItem(task.id, event)}>
                            <label className="visually-hidden" htmlFor={`room-add-checklist-${task.id}`}>Add a step for {task.title}</label>
                            <input id={`room-add-checklist-${task.id}`} value={draft} onChange={(event) => setChecklistDrafts((current) => ({ ...current, [taskId]: event.target.value }))} maxLength={120} placeholder="Add a small step" disabled={!onAddChecklistItem} />
                            <button type="submit" disabled={!draft.trim() || !onAddChecklistItem}>Add</button>
                          </form>
                        </article>
                      );
                    })}
                  </div>
                  <nav className="room-task-pagination" aria-label="Parent task pages">
                    <button type="button" onClick={() => setTaskPage((current) => Math.max(0, current - 1))} disabled={taskPage === 0} data-testid="button-previous-parent-tasks">
                      <ChevronLeft size={15} aria-hidden="true" /> Previous
                    </button>
                    <span aria-live="polite" aria-atomic="true" data-testid="status-parent-task-page">Page {taskPage + 1} of {taskPageCount}</span>
                    <button type="button" onClick={() => setTaskPage((current) => Math.min(taskPageCount - 1, current + 1))} disabled={taskPage >= taskPageCount - 1} data-testid="button-next-parent-tasks">
                      Next <ChevronRight size={15} aria-hidden="true" />
                    </button>
                  </nav>
                  {(!onToggleChecklistItem || !onUpdateChecklistItem || !onDeleteChecklistItem) && checklist.length > 0 && (
                    <p className="room-connection-note">Some checklist actions are waiting to be connected.</p>
                  )}
                  {!onAddChecklistItem && tasks.length > 0 && <p className="room-connection-note">Checklist changes will be available when this room is connected.</p>}
                </div>
              )}

              {panel === 'timer' && (
                <div className="room-panel-content room-timer-settings">
                  <div className="room-setting-row">
                    <label htmlFor="focus-length">Focus length <small>1–{maxFocusMinutes} min</small></label>
                    <div className="room-number-control"><input id="focus-length" type="number" min={1} max={maxFocusMinutes} value={session.focusMinutes} disabled={session.active || session.paused || !onPlanSettingsChange || session.status === 'boundary' || session.status === 'completed'} onChange={(event) => onSessionTimeInput('focusMinutes', event.target.value)} onBlur={savePlanSettings} /><span>min</span></div>
                  </div>
                  <div className="room-setting-row">
                    <label htmlFor="break-length">Break length <small>0–180 min</small></label>
                    <div className="room-number-control"><input id="break-length" type="number" min={0} max={180} value={session.breakMinutes} disabled={session.active || session.paused || !onPlanSettingsChange || session.status === 'boundary' || session.status === 'completed'} onChange={(event) => onSessionTimeInput('breakMinutes', event.target.value)} onBlur={savePlanSettings} /><span>min</span></div>
                  </div>
                  <div className="room-setting-row">
                    <label htmlFor="planned-sessions">Planned sessions <small>1–12</small></label>
                    <div className="room-number-control"><input id="planned-sessions" type="number" min={1} max={12} value={session.plannedSessions} disabled={session.active || session.paused || !onPlanSettingsChange || session.status === 'boundary' || session.status === 'completed'} onChange={(event) => onSessionTimeInput('plannedSessions', event.target.value)} onBlur={savePlanSettings} /><span>sessions</span></div>
                  </div>
                  <fieldset className="room-transition">
                    <legend>Between focus sessions</legend>
                    <label><input type="radio" name="transitions" checked={session.transitions === 'manual'} disabled={session.active || session.paused || !onPlanSettingsChange || session.status === 'boundary' || session.status === 'completed'} onChange={() => updateSettings({ transitions: 'manual' })} /> I’ll choose</label>
                    <label><input type="radio" name="transitions" checked={session.transitions === 'automatic'} disabled={session.active || session.paused || !onPlanSettingsChange || session.status === 'boundary' || session.status === 'completed'} onChange={() => updateSettings({ transitions: 'automatic' })} /> Start breaks automatically</label>
                  </fieldset>
                  {session.transitions === 'manual' && !session.active && !session.paused && session.status !== 'boundary' && session.status !== 'completed' && (
                    <div className="room-manual-phases" role="group" aria-label="Choose a timer phase">
                      {session.phase === 'focus' && session.completedSessions < session.plannedSessions && <button type="button" onClick={() => startPhase('focus')}>Start focus</button>}
                      {session.phase === 'break' && session.completedSessions > 0 && session.completedSessions < session.plannedSessions && <button type="button" onClick={() => startPhase('break')}>Start a break</button>}
                    </div>
                  )}
                  <div className="room-plan-summary" data-testid="status-plan-total">
                    <span>Planned total</span>
                    <strong>{formatPlanDuration(plannedTotalSeconds)}</strong>
                    <small>{Math.max(0, session.plannedSessions - 1)} breaks between focus sessions</small>
                  </div>
                  {planExceedsChunk ? (
                    <p className="room-plan-warning" role="status" data-testid="status-boundary-validation">
                      The remaining plan extends {formatPlanDuration(remainingPlanSeconds - (chunkRemaining ?? 0))} past the chunk boundary. Adjust the plan before starting; your choices have not changed.
                    </p>
                  ) : chunkRemaining === null ? (
                    <p className="room-plan-warning is-muted" role="status" data-testid="status-boundary-validation">
                      No chunk end is set. Focus sessions can be up to three hours.
                    </p>
                  ) : (
                    <p className="room-plan-fit" role="status" data-testid="status-boundary-validation">This plan fits within the remaining chunk time.</p>
                  )}
                  <p className="room-panel-note">A break follows each focus session. Nothing starts without your say-so unless automatic transitions are on.</p>
                </div>
              )}

              {panel === 'background' && (
                <div className="room-panel-content">
                  <p className="room-panel-note">Choose a saved image or video for the room background.</p>
                  <div className="room-media-list">
                    <button type="button" className={`room-media-option${!selectedBackground ? ' selected' : ''}`} aria-pressed={!selectedBackground} onClick={() => selectBackground(null)} data-testid="button-background-still">
                      <span className="room-media-swatch room-media-none" aria-hidden="true"><Image size={15} /></span><span>Still background · Chunked theme</span>
                    </button>
                    {usableMedia.filter((entry) => entry.kind === 'video' || entry.kind === 'image').map((entry) => (
                      <button type="button" key={entry.id} className={`room-media-option${backgroundId === entry.id ? ' selected' : ''}`} aria-pressed={backgroundId === entry.id} onClick={() => selectBackground(entry)}>
                        <span className="room-media-swatch" aria-hidden="true">{entry.thumbnailUrl && <img src={entry.thumbnailUrl} alt="" />}{entry.kind === 'video' ? 'MOV' : 'IMG'}</span>
                        <span>{entry.title}<small>Room background</small></span>
                      </button>
                    ))}
                  </div>
                  {selectedBackground && <button className="room-subtle-action" type="button" disabled={reduceMotion && (selectedBackground.kind === 'video' || animatedImage)} onClick={toggleBackground} data-testid="button-toggle-background">
                    {reduceMotion && (selectedBackground.kind === 'video' || animatedImage) ? 'Paused by Reduce motion' : backgroundPlaying ? 'Pause background' : 'Show background'}
                  </button>}
                  <div className="room-motion-setting">
                    <div>
                      <strong>Reduce motion</strong>
                      <small>{typeof reduceMotionProp === 'boolean' ? 'Saved preference' : hasSavedMotionChoice ? 'Chosen for this room' : 'Following your device setting'}</small>
                    </div>
                    <button type="button" role="switch" aria-label="Reduce motion" aria-checked={reduceMotion} onClick={toggleReduceMotion} data-testid="button-toggle-reduce-motion">
                      <span>{reduceMotion ? 'On' : 'Off'}</span>
                    </button>
                  </div>
                  {reduceMotion && <p className="room-sound-note" role="status">Room motion is reduced. Moving background media stays paused until you turn this off.</p>}
                </div>
              )}

              {panel === 'sound' && (
                <div className="room-panel-content">
                  <p className="room-panel-note">Choose one sound source. Switching sources never starts playback.</p>
                  <fieldset className="room-sound-sources">
                    <legend>Sound source</legend>
                    <label className={!hasVideoSound ? 'is-unavailable' : ''}>
                      <input type="radio" name="room-sound-source" value="video" checked={soundSource === 'video'} disabled={!hasVideoSound} onChange={() => chooseSoundSource('video')} />
                      <span><strong>Selected video</strong><small>{selectedBackground?.kind === 'video' ? selectedBackground.title : 'Choose a saved video in Background'}</small></span>
                    </label>
                    <label className={!librarySounds.length ? 'is-unavailable' : ''}>
                      <input type="radio" name="room-sound-source" value="library" checked={soundSource === 'library'} disabled={!librarySounds.length} onChange={() => chooseSoundSource('library')} />
                      <span><strong>Library audio</strong><small>A separate track, started only when you press play</small></span>
                    </label>
                    <label>
                      <input type="radio" name="room-sound-source" value="silence" checked={soundSource === 'silence'} onChange={() => chooseSoundSource('silence')} />
                      <span><strong>Silence</strong><small>Pause separate audio and keep video muted</small></span>
                    </label>
                  </fieldset>

                  {soundSource === 'library' && (
                    <>
                      <div className="room-sound-tracks" role="group" aria-label="Choose a library audio track">
                        {librarySounds.length ? librarySounds.map((entry) => (
                          <button type="button" key={entry.id} className={`room-media-option${soundId === entry.id ? ' selected' : ''}`} aria-pressed={soundId === entry.id} onClick={() => selectSound(entry)}>
                            <span className="room-media-swatch room-media-sound" aria-hidden="true"><Headphones size={15} /></span><span>{entry.title}</span>
                          </button>
                        )) : <p className="room-empty">No library tracks are available.</p>}
                      </div>
                      {soundId && !soundUrl && <p className="room-sound-note" role="status">Choose a valid saved audio track to play.</p>}
                      {soundUrl && <button className="room-subtle-action" type="button" onClick={toggleSound} aria-label="Library audio playback" aria-pressed={soundPlaying} data-testid="button-toggle-sound">{soundPlaying ? <><Pause size={14} /> Pause track</> : <><Play size={14} /> Play track</>}</button>}
                    </>
                  )}

                  {hostedVideoAudio && (
                    <div className="room-sound-selected">
                      <p className="room-sound-note">{backgroundPlaying ? 'The selected video is playing with its audio source available.' : 'The video is muted until you choose this source. Start it when you are ready.'}</p>
                      <button className="room-subtle-action" type="button" onClick={toggleBackground} aria-label="Background video audio" aria-pressed={backgroundPlaying} data-testid="button-toggle-video-audio">
                        {backgroundPlaying ? <><Pause size={14} /> Pause video</> : <><Play size={14} /> Play video with sound</>}
                      </button>
                    </div>
                  )}

                  {(soundSource === 'library' || hostedVideoAudio) && (
                    <div className="room-volume">
                      <button type="button" onClick={changeMute} aria-label={muted ? 'Unmute selected sound' : 'Mute selected sound'} aria-pressed={muted}>
                        {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                      </button>
                      <label htmlFor="room-volume">Volume</label>
                      <input id="room-volume" type="range" min={0} max={100} value={volume} onChange={(event) => changeVolume(Number(event.target.value))} />
                      <span>{muted ? 'Muted' : `${volume}%`}</span>
                    </div>
                  )}
                  {soundSource === 'silence' && <p className="room-sound-note">Sound is off. The video remains muted and separate audio is paused.</p>}
                  <section className="room-session-cues" aria-label="Focus session sound cues">
                    <p className="room-panel-note">Session cues</p>
                    <div className="room-motion-setting">
                      <div>
                        <strong>Focus starts</strong>
                        <small>Play a gentle chime when a focus timer begins.</small>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-label="Play a chime when focus starts"
                        aria-checked={initialSessionCues.start}
                        disabled={!onSessionCuesChange}
                        onClick={() => {
                          const start = !initialSessionCues.start;
                          if (start) primeSessionCueAudio();
                          onSessionCuesChange?.({ ...initialSessionCues, start });
                        }}
                        data-testid="button-toggle-focus-start-chime"
                      >
                        <span>{initialSessionCues.start ? 'On' : 'Off'}</span>
                      </button>
                    </div>
                    <div className="room-motion-setting">
                      <div>
                        <strong>Focus ends</strong>
                        <small>Play a gentle chime when a focus timer finishes.</small>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-label="Play a chime when focus ends"
                        aria-checked={initialSessionCues.end}
                        disabled={!onSessionCuesChange}
                        onClick={() => {
                          const end = !initialSessionCues.end;
                          if (end) primeSessionCueAudio();
                          onSessionCuesChange?.({ ...initialSessionCues, end });
                        }}
                        data-testid="button-toggle-focus-end-chime"
                      >
                        <span>{initialSessionCues.end ? 'On' : 'Off'}</span>
                      </button>
                    </div>
                    <p className="room-sound-note">Chimes are independent from background music mute and volume.</p>
                  </section>
                </div>
              )}
              {validation && <p className="room-validation" role="status">{validation}</p>}
            </section>
          )}

          <nav className="room-toolbar" aria-label="Room controls">
            <button type="button" className={panel === 'tasks' ? 'active' : ''} aria-controls="focus-room-panel" aria-pressed={panel === 'tasks'} onClick={(event) => { panelTriggerRef.current = event.currentTarget; setPanel(panel === 'tasks' ? null : 'tasks'); }} data-testid="button-open-tasks"><ListTodo size={17} /><span>Tasks</span>{checklist.length > 0 && <small>{completedSteps}/{checklist.length}</small>}</button>
            <button type="button" className={panel === 'timer' ? 'active' : ''} aria-controls="focus-room-panel" aria-pressed={panel === 'timer'} onClick={(event) => { panelTriggerRef.current = event.currentTarget; setPanel(panel === 'timer' ? null : 'timer'); }} data-testid="button-open-timer"><Settings2 size={17} /><span>Timer settings</span></button>
            <button type="button" className={panel === 'background' ? 'active' : ''} aria-controls="focus-room-panel" aria-pressed={panel === 'background'} onClick={(event) => { panelTriggerRef.current = event.currentTarget; setPanel(panel === 'background' ? null : 'background'); }} data-testid="button-open-background"><Image size={17} /><span>Background</span></button>
            <button type="button" className={panel === 'sound' ? 'active' : ''} aria-controls="focus-room-panel" aria-pressed={panel === 'sound'} onClick={(event) => { panelTriggerRef.current = event.currentTarget; primeSessionCueAudio(); setPanel(panel === 'sound' ? null : 'sound'); }} data-testid="button-open-sound">{soundSource === 'silence' || muted ? <VolumeX size={17} /> : <Volume2 size={17} />}<span>Sound</span></button>
            {hasRoomMuteControl && (
              <button
                type="button"
                className={muted ? 'active' : ''}
                onClick={changeMute}
                aria-label={muted ? 'Unmute background sound' : 'Mute background sound'}
                aria-pressed={muted}
                title={muted ? 'Unmute background sound' : 'Mute background sound'}
                data-testid="button-toggle-room-mute"
              >
                {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                <span>{muted ? 'Unmute' : 'Mute'}</span>
              </button>
            )}
            <button type="button" className={panel === 'history' ? 'active' : ''} aria-controls="focus-room-panel" aria-pressed={panel === 'history'} onClick={(event) => { panelTriggerRef.current = event.currentTarget; setPanel(panel === 'history' ? null : 'history'); }} data-testid="button-open-focus-history"><History size={17} /><span>History</span></button>
            <button type="button" onClick={() => { setPanel(null); setHidden(true); }} data-testid="button-hide-room"><X size={17} /><span>Hide</span></button>
          </nav>
        </>
      )}
      {hidden && (
        <button type="button" className="room-restore" onClick={() => setHidden(false)} data-testid="button-show-room">
          <span className="room-mark" aria-hidden="true"><span /></span> Show room controls
        </button>
      )}
      {boundaryVisible && (
        <div className="room-boundary-scrim">
          <section ref={boundaryRef} className="room-boundary" role="dialog" aria-modal="true" aria-labelledby="room-boundary-heading">
            <p className="room-panel-kicker">THIS PART OF THE DAY IS COMPLETE</p>
            <h2 id="room-boundary-heading">Let’s place what’s still open.</h2>
            <p className="room-boundary-intro">
              {partialSession
                ? 'Your focus session is partial, not complete. Nothing has been moved or removed.'
                : 'Nothing has been moved or removed. Choose where each open task belongs.'}
            </p>
            {validation && <p className="room-boundary-error" role="alert">{validation}</p>}
            {!onMoveTask && !onDeleteParentTask && unfinishedTasks.length > 0 && <p className="room-connection-note">Task decisions will be available when this room is connected.</p>}
            {unfinishedTasks.length === 0 ? (
              <p className="room-boundary-empty">All parent tasks are already complete. Your checklist does not change that status.</p>
            ) : (
              <div className="room-boundary-list">
                {unfinishedTasks.map((task) => {
                  const taskId = String(task.id);
                  const destination = taskDestinations[taskId] ?? '';
                  const otherSelection = otherTaskDestinations[taskId];
                  const destinationIsValid = destination === 'next'
                    ? Boolean(nextChunk)
                    : destination === 'tomorrow'
                      ? Boolean(nextDate(date))
                      : destination === 'other'
                        ? Boolean(otherSelection?.chunkId && otherSelection.date)
                        : false;
                  const resolved = resolvedTaskIds.has(taskId);
                  return (
                    <article className={`room-boundary-task${resolved ? ' is-resolved' : ''}`} key={task.id}>
                      <div className="room-boundary-task-heading">
                        <strong>{task.title}</strong>
                        {resolved && <span>Decision sent</span>}
                      </div>
                      {!resolved && (
                        <>
                          <label className="visually-hidden" htmlFor={`destination-${task.id}`}>Choose where {task.title} should go</label>
                          <select
                            id={`destination-${task.id}`}
                            value={destination}
                            disabled={pendingTaskIds.has(taskId)}
                            onChange={(event) => {
                              const value = event.target.value as 'next' | 'tomorrow' | 'other' | 'delete' | '';
                              if (value === 'delete') {
                                setTaskDestinations((current) => ({ ...current, [taskId]: value }));
                                setDeleteParentConfirm(task);
                                return;
                              }
                              setDeleteParentConfirm(null);
                              if (value) setTaskDestinations((current) => ({ ...current, [taskId]: value }));
                            }}
                          >
                            <option value="">Choose a destination</option>
                            <option value="next" disabled={!nextChunk}>Next chunk{nextChunk ? ` · ${nextChunk.name}` : ' · unavailable'}</option>
                            <option value="tomorrow">Tomorrow · same chunk</option>
                            <option value="other">Another available chunk / date</option>
                            <option value="delete">Delete this task…</option>
                          </select>
                          {destination === 'other' && (
                            <div className="room-other-destination">
                              <label>
                                <span>Chunk</span>
                                <select
                                  value={otherSelection?.chunkId ?? ''}
                                  onChange={(event) => {
                                    const selected = availableChunks.find((item) => String(item.id) === event.target.value);
                                    setOtherTaskDestinations((current) => ({
                                      ...current,
                                      [taskId]: { chunkId: event.target.value, date: selected?.date ?? current[taskId]?.date ?? '' },
                                    }));
                                  }}
                                >
                                  <option value="">Choose a chunk</option>
                                  {availableChunks.filter((item) => String(item.id) !== String(chunk.id) || item.date !== date).map((item) => <option key={`${item.id}-${item.date}`} value={String(item.id)}>{item.name} · {item.date}</option>)}
                                </select>
                              </label>
                              <label>
                                <span>Date</span>
                                <input type="date" value={otherSelection?.date ?? ''} onChange={(event) => setOtherTaskDestinations((current) => ({
                                  ...current, [taskId]: { chunkId: current[taskId]?.chunkId ?? '', date: event.target.value },
                                }))} />
                              </label>
                            </div>
                          )}
                          <div className="room-boundary-actions">
                            {destination === 'delete' ? (
                              <span className="room-boundary-hint">Deletion always asks for confirmation.</span>
                            ) : (
                              <button type="button" className="room-boundary-move" disabled={!onMoveTask || !destinationIsValid || pendingTaskIds.has(taskId)} onClick={() => chooseTaskDestination(task)} data-testid={`button-place-task-${task.id}`}>
                                {pendingTaskIds.has(taskId) ? 'Sending…' : 'Place task'}
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
            {deleteParentConfirm && (
              <div className="room-parent-delete-confirm" role="alertdialog" aria-label={`Confirm deleting ${deleteParentConfirm.title}`}>
                <p>Remove “{deleteParentConfirm.title}” from your plan?</p>
                <button type="button" onClick={() => {
                  const id = String(deleteParentConfirm.id);
                  setDeleteParentConfirm(null);
                  setTaskDestinations((current) => {
                    const next = { ...current };
                    delete next[id];
                    return next;
                  });
                }}>Keep task</button>
                <button type="button" className="danger" disabled={!onDeleteParentTask || pendingTaskIds.has(String(deleteParentConfirm.id))} onClick={confirmParentTaskDelete}>Delete task</button>
              </div>
            )}
            <div className="room-boundary-footer">
              <button type="button" className="room-boundary-leave" onClick={requestLeave}>Return to the day</button>
              {nextChunk && (
                <button type="button" className="room-boundary-next" disabled={!canSwitchToNext || switchingChunks} onClick={proceedToNextChunk} data-testid="button-switch-next-chunk">
                  {switchingChunks ? 'Moving to the next chunk…' : `Continue to ${nextChunk.name}`}
                </button>
              )}
              {unfinishedTasks.length > 0 && unresolvedTasks.length > 0 && <span className="room-boundary-hint">Choose a place for each open task before continuing.</span>}
            </div>
          </section>
        </div>
      )}
      {leaveConfirmOpen && (
        <div className="room-leave-scrim">
          <section ref={leaveDialogRef} className="room-leave-dialog" role="dialog" aria-modal="true" aria-labelledby="room-leave-title" aria-describedby="room-leave-description">
            <p className="room-panel-kicker">YOUR SESSION STAYS WITH YOU</p>
            <h2 id="room-leave-title">Leave the focus room?</h2>
            <p id="room-leave-description">
              Your timer stays in the app’s mini timer. If it is running, it will keep running; if paused, it will stay paused. Leaving will not finish or count this session.
            </p>
            <div className="room-leave-actions">
              <button type="button" className="room-leave-stay" onClick={() => setLeaveConfirmOpen(false)} data-testid="button-stay-in-room">Stay</button>
              <button type="button" className="room-leave-confirm" onClick={confirmLeave} data-testid="button-confirm-leave-room">Leave room</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
