import { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type FormEvent, type ReactNode } from 'react';
import { Link as InertiaLink, router, useForm } from '@inertiajs/react';
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2,
  ChevronLeft, ChevronRight, Circle, Clock3, Coffee, Compass, Ellipsis, Menu, Play,
  Moon, Plus, Settings2, SlidersHorizontal, Sun, Trash2, X,
} from 'lucide-react';
import CurrentChunkPage, {
  type AvailableChunk,
  type CurrentChunkChecklistItem,
  type FocusHistoryDay,
  type FocusMediaEntry,
  type FocusSoundSource,
  type FocusSessionState,
  type FocusTimerAction,
  type TaskMoveDestination,
} from './CurrentChunkPage';

export type DayStructure = { type: string; name: string };
export type Chunk = {
  id: number | string;
  name: string;
  startTime?: string | null;
  endTime?: string | null;
  sortOrder: number;
};
export type AffectedTask = {
  id: number;
  title: string;
  plannedDate: string;
  chunkName?: string | null;
  chunkStartTime?: string | null;
  chunkEndTime?: string | null;
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
};
type TaskMoveSuggestion = { chunkIndex: number; reason: string } | null;
export type Task = {
  id: number | string;
  title: string;
  description?: string;
  plannedDate: string;
  chunkId?: number | string | null;
  chunkName?: string | null;
  priority: 'low' | 'medium' | 'high';
  completedAt?: string | null;
};
export type UserSettings = {
  theme: 'light' | 'dark' | 'system';
  navigationPosition: 'sidebar' | 'top';
  language: string;
};
export type ChunkedRoutes = Partial<{
  day: string;
  focus: string;
  focusPlanAction: string;
  focusPlanSettings: string;
  focusPlanSwitchChunk: string;
  focusSessionContext: string;
  focusMediaYoutube: string;
  taskStore: string;
  taskUpdate: string;
  taskComplete: string;
  taskDestroy: string;
  taskChecklistStore: string;
  taskChecklistUpdate: string;
  taskChecklistDestroy: string;
  settingsUpdate: string;
  structureUpdate: string;
  structureSkip: string;
  login: string;
  register: string;
  logout: string;
}>;
export type ChunkedPageProps = {
  chunks?: Chunk[];
  tasks?: Task[];
  overdueTasks?: Task[];
  structure?: DayStructure;
  settings?: UserSettings;
  routes?: ChunkedRoutes;
  user?: { name?: string; email?: string };
  today?: string;
  date?: string;
  userKey?: string;
  chunk?: Chunk;
  focusPlanId?: number;
  session?: Partial<FocusSessionState>;
  focusHistory?: FocusHistoryDay[];
  checklistItems?: CurrentChunkChecklistItem[];
  availableChunks?: AvailableChunk[];
  nextChunk?: AvailableChunk | null;
  mediaCatalog?: FocusMediaEntry[];
  activeFocusTimer?: FocusTimerSummary | null;
  selectedChunkId?: Chunk['id'] | null;
  completedCount?: number;
  current?: { type: string; name: string; chunks?: { id?: number; name: string; startTime?: string | null; endTime?: string | null }[] } | null;
  affectedTasks?: AffectedTask[];
  flash?: { success?: string };
  [key: string]: unknown;
};

const defaultChunks: Chunk[] = [
  { id: 'morning', name: 'Morning', startTime: '8:00', endTime: '12:00', sortOrder: 0 },
  { id: 'afternoon', name: 'Afternoon', startTime: '12:00', endTime: '17:00', sortOrder: 1 },
  { id: 'evening', name: 'Evening', startTime: '17:00', endTime: '21:00', sortOrder: 2 },
];
const presets = [
  { name: 'A gentle day', type: 'day', parts: ['Morning', 'Afternoon', 'Evening'], detail: 'A little shape, lots of room.' },
  { name: 'Prayer periods', type: 'prayer', parts: ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'], detail: 'Five natural pauses in your day.' },
  { name: 'School day', type: 'school', parts: ['Before school', 'Classes', 'After school', 'Evening'], detail: 'Make space around the timetable.' },
  { name: 'University', type: 'university', parts: ['Morning', 'Campus', 'Study time', 'Evening'], detail: 'A flexible frame for campus life.' },
  { name: 'Work blocks', type: 'work', parts: ['Morning block', 'Midday break', 'Afternoon block', 'Evening'], detail: 'Keep the rest of life in view, too.' },
  { name: 'Make my own', type: 'custom', parts: ['First part', 'Middle part', 'Later'], detail: 'Start simple. Change it whenever.' },
];
function dateKey(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function timeSegments(start: string, end: string): [number, number][] {
  const toMinutes = (time: string) => {
    const [hours, minutes] = time.slice(0, 5).split(':').map(Number);
    return (hours * 60) + minutes;
  };
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (startMinutes === endMinutes) return [];
  return endMinutes > startMinutes
    ? [[startMinutes, endMinutes]]
    : [[startMinutes, 1440], [0, endMinutes]];
}
function shiftedDate(base: string, offset: number) {
  const date = new Date(`${base}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function displayDate(date: string) {
  if (date === dateKey()) return 'Today';
  const value = new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(value);
}
function timeRange(chunk: Chunk) {
  return chunk.startTime && chunk.endTime ? `${chunk.startTime} – ${chunk.endTime}` : 'A little room';
}
function normalizedChunkName(name?: string | null) {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function dayPart(name?: string | null) {
  const normalized = normalizedChunkName(name);
  if (/\b(morning|dawn)\b/.test(normalized)) return 'morning';
  if (/\b(afternoon|midday|noon)\b/.test(normalized)) return 'afternoon';
  if (/\b(evening|night)\b/.test(normalized)) return 'evening';
  return null;
}
function timeOverlapMinutes(oldStart: string, oldEnd: string, newStart: string, newEnd: string) {
  const oldSegments = timeSegments(oldStart, oldEnd);
  const newSegments = timeSegments(newStart, newEnd);
  return oldSegments.reduce((total, [oldFrom, oldTo]) => total + newSegments.reduce((subtotal, [newFrom, newTo]) => (
    subtotal + Math.max(0, Math.min(oldTo, newTo) - Math.max(oldFrom, newFrom))
  ), 0), 0);
}
function suggestTaskDestination(task: AffectedTask, chunks: { name: string; startTime?: string; endTime?: string }[]): TaskMoveSuggestion {
  const oldName = normalizedChunkName(task.chunkName);
  const sameName = chunks.map((chunk, index) => ({ chunk, index })).filter(({ chunk }) => normalizedChunkName(chunk.name) === oldName);
  if (oldName && sameName.length === 1) return { chunkIndex: sameName[0].index, reason: 'same block name' };
  if (oldName) {
    const oldPart = dayPart(task.chunkName);
    const samePart = chunks.map((chunk, index) => ({ chunk, index })).filter(({ chunk }) => oldPart !== null && dayPart(chunk.name) === oldPart);
    if (samePart.length === 1) return { chunkIndex: samePart[0].index, reason: 'same part of day' };
  }
  if (!task.chunkStartTime || !task.chunkEndTime) return null;

  let bestIndex = -1;
  let bestOverlap = 0;
  let tied = false;
  chunks.forEach((chunk, index) => {
    if (!chunk.startTime || !chunk.endTime) return;
    const overlap = timeOverlapMinutes(task.chunkStartTime!, task.chunkEndTime!, chunk.startTime, chunk.endTime);
    if (overlap > bestOverlap) {
      bestIndex = index;
      bestOverlap = overlap;
      tied = false;
    } else if (overlap > 0 && overlap === bestOverlap) {
      tied = true;
    }
  });
  return bestOverlap > 0 && !tied ? { chunkIndex: bestIndex, reason: 'overlapping times' } : null;
}
const PageContext = createContext<ChunkedPageProps>({});
function useChunkedPage() { return useContext(PageContext); }
function Link(props: ComponentProps<typeof InertiaLink>) {
  return <InertiaLink {...props} />;
}

type FocusTimerSummary = Partial<FocusSessionState> & {
  planId: number;
  date: string;
  chunkId: number | string;
  chunkName: string;
  url: string;
};

type FocusMediaPreferences = {
  backgroundId: string | null;
  soundId: string | null;
  soundSource: FocusSoundSource;
  volume: number;
  muted: boolean;
  reduceMotion: boolean | null;
};

function miniClock(seconds: number) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function FocusMiniTimer({ timer }: { timer?: FocusTimerSummary | null }) {
  const [now, setNow] = useState(Date.now());
  const lastSyncKey = useRef('');

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const remaining = timer?.status === 'running' && timer.endsAt
    ? Math.max(0, Math.ceil((new Date(timer.endsAt).getTime() - now) / 1000))
    : timer?.remainingSeconds ?? 0;
  const chunkRemaining = timer?.chunkEndsAt
    ? Math.max(0, Math.ceil((new Date(timer.chunkEndsAt).getTime() - now) / 1000))
    : null;

  useEffect(() => {
    if (!timer || (timer.status !== 'running' && !(timer.status === 'paused' && chunkRemaining !== null))) return;
    const timerEnded = timer.status === 'running' && remaining <= 0;
    const chunkEnded = chunkRemaining !== null && chunkRemaining <= 0;
    if (!timerEnded && !chunkEnded) return;
    const syncKey = `${timer.planId}:${timer.phase}:${timer.endsAt ?? ''}:${timer.chunkEndsAt ?? ''}`;
    if (lastSyncKey.current === syncKey) return;
    lastSyncKey.current = syncKey;
    router.post(`/focus/plans/${timer.planId}/action`, { action: 'sync' }, { preserveScroll: true });
  }, [timer, remaining, chunkRemaining]);

  if (!timer) return null;
  const detail = timer.status === 'boundary'
    ? 'Chunk ended · choose what happens next'
    : timer.status === 'paused'
      ? `Paused · ${miniClock(remaining)}`
      : `${timer.phase === 'break' ? 'Break' : 'Focus'} · ${miniClock(remaining)}`;

  return <Link
    href={timer.url}
    className="fixed bottom-4 right-4 z-30 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-[hsl(var(--foreground))] shadow-lg no-underline transition hover:-translate-y-0.5 hover:shadow-xl sm:bottom-6 sm:right-6"
    aria-label={`${detail}. Return to the ${timer.chunkName} focus room.`}
    data-testid="link-focus-mini-timer"
  >
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><Play size={14} fill="currentColor" /></span>
    <span className="min-w-0">
      <span className="block truncate text-[11px] font-semibold">{timer.chunkName}</span>
      <span className="mt-0.5 block truncate text-[10px] text-muted">{detail}</span>
    </span>
    <span className="shrink-0 text-[10px] font-semibold text-[hsl(var(--primary))]">{timer.status === 'boundary' ? 'Continue' : 'Return'}</span>
  </Link>;
}

function Wordmark({ onDarkSurface = false }: { onDarkSurface?: boolean }) {
  return <Link href="/" className={`flex items-center gap-2.5 no-underline ${onDarkSurface ? 'text-[hsl(var(--sidebar-foreground))]' : 'text-[hsl(var(--foreground))]'}`} aria-label="Chunked, Day">
    <span className="grid h-8 w-8 place-items-center rounded-[11px] bg-[#d9a38f] text-[#203a31]"><span className="h-3.5 w-3.5 rounded-[4px] border-[1.5px] border-current" /></span>
    <span className="text-[19px] font-semibold tracking-[-.055em]">chunked<span className="text-[#d9a38f]">.</span></span>
  </Link>;
}

function AppShell({ children, current = 'day', settings, user, focusChunk, focusDate, focusHref }: {
  children: ReactNode; current?: string; settings: UserSettings; user?: ChunkedPageProps['user'];
  focusChunk?: Chunk; focusDate?: string; focusHref?: string;
}) {
  const pageProps = useChunkedPage();
  const { routes } = pageProps;
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const systemDark = settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', settings.theme === 'dark' || systemDark);
  }, [settings.theme]);
  const navChunk = focusChunk ?? pageProps.chunk ?? pageProps.chunks?.find((chunk) => String(chunk.id) === String(pageProps.selectedChunkId));
  const dateForFocus = focusDate ?? pageProps.today ?? pageProps.date ?? dateKey();
  const baseFocusHref = routes?.focus || '/focus';
  const navFocusHref = focusHref ?? (navChunk
    ? `${baseFocusHref}?${new URLSearchParams({ date: dateForFocus, chunk: String(navChunk.id) }).toString()}`
    : baseFocusHref);
  const links: { href: string; label: string; detail?: string; icon: typeof Compass; active: boolean }[] = [
    { href: '/day', label: 'Day', icon: Compass, active: current === 'day' },
    { href: navFocusHref, label: 'Focus', detail: navChunk?.name ?? 'Current chunk', icon: Play, active: current === 'focus' },
    { href: '/settings', label: 'Settings', icon: Settings2, active: current === 'settings' },
  ];
  const navLinks = <nav className="flex flex-col gap-1.5" aria-label="Main navigation">
    {links.map(({ href, label, detail, icon: Icon, active }) => <Link key={label} href={href} className={`group flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm no-underline transition-colors ${active ? 'bg-white/10 text-white' : 'text-white/65 hover:bg-white/[.06] hover:text-white'}`} aria-current={active ? 'page' : undefined} aria-label={detail ? `${label}, ${detail}` : label} data-testid={`link-nav-${label.toLowerCase()}`}>
      <Icon size={17} strokeWidth={1.7} />
      <span className="min-w-0 flex-1"><span className="block truncate">{label}</span>{detail && <span className={`mt-0.5 block truncate text-[10px] leading-4 ${active ? 'text-white/70' : 'text-white/45'}`}>{detail}</span>}</span>
      {active && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[#dda993]" />}
    </Link>)}
  </nav>;
  return <div className="app-shell grain flex">
    {settings.navigationPosition !== 'top' && <aside className="sidebar hidden min-h-[100dvh] flex-col px-5 pb-5 pt-7 md:flex">
      <Wordmark onDarkSurface />
      <div className="mt-14 px-3 text-[10px] font-bold uppercase tracking-[.19em] text-white/35">Your space</div>
      <div className="mt-3">{navLinks}</div>
      <div className="mt-auto rounded-[18px] border border-white/10 bg-white/[.045] p-4">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-[#e9b9a3]"><Coffee size={14} /> A small reminder</div>
        <p className="m-0 text-[12px] leading-[1.65] text-white/65">Your day is a guide, not a scorecard. Plans can change.</p>
      </div>
      <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-[#e5c8b7] text-xs font-semibold text-[#294238]">{user?.name?.slice(0, 1).toUpperCase() || 'Y'}</div>
        <div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{user?.name || 'Your day, your way'}</div><div className="mt-0.5 truncate text-[10px] text-white/45">{user?.email || 'A little space to begin'}</div></div>
        <Link href="/settings" className="rounded-lg p-2 text-white/55 hover:bg-white/10 hover:text-white" aria-label="Open settings"><Ellipsis size={17} /></Link>
      </div>
      {routes?.logout && <button onClick={() => router.post(routes.logout!)} className="mt-3 self-start rounded-lg px-2 py-1 text-[10px] text-white/50 hover:bg-white/10 hover:text-white">Sign out</button>}
    </aside>}
    <div className="min-w-0 flex-1">
      {settings.navigationPosition === 'top' && <header className="hidden h-[72px] items-center justify-between gap-4 border-b border-soft px-6 md:flex lg:px-8"><Wordmark /><nav className="flex items-center gap-1.5" aria-label="Main navigation">{links.map(({ href, label, detail, icon: Icon, active }) => <Link key={label} href={href} className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs no-underline transition-colors ${active ? 'bg-[hsl(var(--muted))] font-semibold text-[hsl(var(--primary))]' : 'text-muted hover:bg-[hsl(var(--muted))]'}`} aria-current={active ? 'page' : undefined} aria-label={detail ? `${label}, ${detail}` : label} data-testid={`link-nav-${label.toLowerCase()}`}>
        <Icon size={15} /><span className="flex min-w-0 flex-col items-start leading-tight"><span>{label}</span>{detail && <span className="max-w-[88px] truncate text-[9px] font-normal text-muted">{detail}</span>}</span>
      </Link>)}</nav><div className="flex shrink-0 items-center gap-2 text-xs text-muted"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#e5c8b7] font-semibold text-[#294238]">{user?.name?.slice(0, 1).toUpperCase() || 'Y'}</span>{user?.name || 'Your day'}</div></header>}
      <header className="flex h-[68px] items-center justify-between border-b border-soft px-5 md:hidden">
        <button onClick={() => setMobileOpen((open) => !open)} className="rounded-xl p-2" aria-label="Open navigation" data-testid="button-open-menu"><Menu size={19} /></button>
        <Wordmark />
        <div className="flex items-center gap-1"><Link href={navFocusHref} className="rounded-xl p-2 text-muted hover:bg-[hsl(var(--muted))]" aria-label={navChunk ? `Focus ${navChunk.name}` : 'Open current chunk'} data-testid="link-nav-focus-mobile"><Play size={17} /></Link><Link href="/settings" className="rounded-xl p-2 text-muted" aria-label="Settings"><Settings2 size={18} /></Link></div>
      </header>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-[hsl(var(--sidebar))] p-6 md:hidden"><div className="flex justify-between"><Wordmark onDarkSurface /><button onClick={() => setMobileOpen(false)} className="text-white" aria-label="Close navigation"><X /></button></div><div className="mt-12">{navLinks}</div><p className="mt-10 max-w-xs text-sm leading-6 text-white/60">Your day is a guide, not a scorecard. Plans can change.</p></div>}
      <main className="main-canvas min-h-[calc(100dvh-68px)]">{children}</main>
    </div>
    <FocusMiniTimer timer={pageProps.activeFocusTimer} />
  </div>;
}

function Overlay({ title, eyebrow, onClose, children }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return <div className="dialog-backdrop fixed inset-0 z-[60] flex items-center justify-center p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="surface fade-up w-full max-w-[480px] rounded-[26px] p-6 sm:p-8">
      <div className="flex items-start justify-between"><div>{eyebrow && <div className="mono mb-2 text-[10px] uppercase tracking-[.16em] text-muted">{eyebrow}</div>}<h2 id="dialog-title" className="serif m-0 text-[32px] font-normal leading-none">{title}</h2></div><button onClick={onClose} aria-label="Close dialog" className="rounded-full p-2 text-muted hover:bg-[hsl(var(--muted))]"><X size={18} /></button></div>
      {children}
    </section>
  </div>;
}

function TaskDialog({ chunks, close, onCreate, selectedChunk, plannedDate, taskStore, taskUpdate, task, onCreated }: { chunks: Chunk[]; close: () => void; onCreate: (task: Omit<Task, 'id'>) => void; selectedChunk: Chunk['id']; plannedDate: string; taskStore?: string; taskUpdate?: string; task?: Task; onCreated: () => void }) {
  const form = useForm({
    title: task?.title ?? '',
    description: task?.description ?? '',
    plannedDate: task?.plannedDate ?? plannedDate,
    chunkId: task ? (task.chunkId ? String(task.chunkId) : '') : String(selectedChunk),
    priority: task?.priority ?? 'medium' as Task['priority'],
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.data.title.trim()) return;
    const payload = { ...form.data, title: form.data.title.trim(), chunkId: form.data.chunkId || undefined, priority: form.data.priority as Task['priority'] };
    if (task && taskUpdate) {
      form.transform(() => payload);
      form.patch(`${taskUpdate}/${task.id}`, { onSuccess: () => { close(); onCreated(); } });
    } else if (taskStore) {
      form.transform(() => payload);
      form.post(taskStore, { onSuccess: () => { close(); onCreated(); } });
    } else {
      onCreate(payload);
      close();
    }
  };
  return <Overlay title={task ? 'Edit this task' : 'Add a small thing'} eyebrow={task ? 'Change the plan' : 'Make room for it'} onClose={close}>
    <form onSubmit={submit} className="mt-6 space-y-4">
      <label className="block text-xs font-semibold">What would you like to do?
        <input autoFocus value={form.data.title} onChange={(e) => form.setData('title', e.target.value)} placeholder="e.g. Water the little plants" className="mt-2 h-12 w-full rounded-xl border border-soft bg-[hsl(var(--background))] px-4 text-sm outline-none focus:border-[hsl(var(--primary))]" data-testid="input-task-title" />
      </label>
      <label className="block text-xs font-semibold">A note, if useful
        <textarea value={form.data.description} onChange={(e) => form.setData('description', e.target.value)} placeholder="Anything you want to remember…" rows={2} className="mt-2 w-full resize-none rounded-xl border border-soft bg-[hsl(var(--background))] px-4 py-3 text-sm outline-none focus:border-[hsl(var(--primary))]" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold">Day<input type="date" value={form.data.plannedDate} onChange={(e) => form.setData('plannedDate', e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-soft bg-[hsl(var(--background))] px-3 text-xs" /></label>
        <label className="block text-xs font-semibold">Chunk<select value={form.data.chunkId} onChange={(e) => form.setData('chunkId', e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-soft bg-[hsl(var(--background))] px-3 text-xs">{chunks.map((chunk) => <option key={chunk.id} value={chunk.id}>{chunk.name}</option>)}<option value="">Leave unassigned</option></select></label>
      </div>
      {Object.values(form.errors).length > 0 && <p role="alert" className="m-0 text-xs text-[#a34f43]">{Object.values(form.errors).join(' ')}</p>}
      <div className="flex items-center justify-between pt-2"><button type="button" onClick={close} className="px-2 py-2 text-sm text-muted">Not now</button><button type="submit" disabled={form.processing} className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-3 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-transform hover:-translate-y-0.5 disabled:opacity-60"><Plus size={16} />{form.processing ? 'Saving…' : task ? 'Save changes' : 'Add to my day'}</button></div>
    </form>
  </Overlay>;
}

function DayPage() {
  const props = useChunkedPage();
  const routes = props.routes || {};
  const [chunks, setChunks] = useState<Chunk[]>(props.chunks ?? []);
  const [tasks, setTasks] = useState<Task[]>(props.tasks ?? []);
  const [overdueTasks, setOverdueTasks] = useState<Task[]>(props.overdueTasks ?? []);
  const [settings, setSettings] = useState<UserSettings>(props.settings || { theme: 'light', navigationPosition: 'sidebar', language: 'en' });
  const [focusChunkId, setFocusChunkId] = useState<Chunk['id']>(props.selectedChunkId ?? props.chunks?.[0]?.id ?? '');
  const [showAdd, setShowAdd] = useState(false);
  const [showOverdue, setShowOverdue] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [reviewTask, setReviewTask] = useState<Task | null>(null);
  const [moveDate, setMoveDate] = useState(shiftedDate(props.today ?? dateKey(), 1));
  const [moveDateChunk, setMoveDateChunk] = useState('');
  const [menuTask, setMenuTask] = useState<Task['id'] | null>(null);
  const [toast, setToast] = useState('');
  useEffect(() => setChunks(props.chunks ?? []), [props.chunks]);
  useEffect(() => setTasks(props.tasks ?? []), [props.tasks]);
  useEffect(() => setOverdueTasks(props.overdueTasks ?? []), [props.overdueTasks]);
  useEffect(() => { if (overdueTasks.length === 0) setShowOverdue(false); }, [overdueTasks.length]);
  useEffect(() => setSettings(props.settings || { theme: 'light', navigationPosition: 'sidebar', language: 'en' }), [props.settings]);
  useEffect(() => setFocusChunkId(props.selectedChunkId ?? props.chunks?.[0]?.id ?? ''), [props.selectedChunkId, props.chunks]);
  useEffect(() => setMoveDateChunk(reviewTask?.chunkId ? String(reviewTask.chunkId) : ''), [reviewTask]);
  const today = props.today ?? dateKey();
  const isToday = today === dateKey();
  const navigateDate = (offset: number) => {
    router.get(routes.day || '/day', { date: shiftedDate(today, offset) }, { preserveState: false });
  };
  const chunkSorted = useMemo(() => [...chunks].sort((a, b) => a.sortOrder - b.sortOrder), [chunks]);
  const focusChunk = chunkSorted.find((chunk) => String(chunk.id) === String(focusChunkId)) || chunkSorted[0];
  const dailyTasks = tasks.filter((task) => task.plannedDate === today);
  const focusTasks = dailyTasks.filter((task) => String(task.chunkId) === String(focusChunk?.id));
  const otherTasks = dailyTasks.filter((task) => String(task.chunkId) !== String(focusChunk?.id));
  const completeCount = dailyTasks.filter((task) => task.completedAt).length;
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2600); };
  useEffect(() => {
    if (props.flash?.success) notify(props.flash.success);
  }, [props.flash?.success]);
  const saveTask = (task: Task) => {
    if (routes.taskComplete) router.patch(`${routes.taskComplete}/${task.id}/complete`, { completed: Boolean(task.completedAt) });
  };
  const toggleTask = (task: Task) => {
    const updated = { ...task, completedAt: task.completedAt ? null : new Date().toISOString() };
    setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
    setOverdueTasks((current) => current.map((item) => item.id === task.id ? updated : item).filter((item) => !item.completedAt));
    saveTask(updated);
  };
  const createTask = (data: Omit<Task, 'id'>) => {
    const form = { ...data };
    setTasks((current) => [...current, { ...form, id: `new-${Date.now()}` }]);
    notify('Added to your day.');
  };
  const removeTask = (task: Task) => {
    setTasks((current) => current.filter((item) => item.id !== task.id));
    setOverdueTasks((current) => current.filter((item) => item.id !== task.id));
    if (routes.taskDestroy) router.delete(`${routes.taskDestroy}/${task.id}`);
    setMenuTask(null); setReviewTask(null); notify('Let go. It’s okay.');
  };
  const moveTask = (task: Task, chunkId: string | null, plannedDate = today) => {
    const updated = { ...task, chunkId: chunkId || undefined, plannedDate };
    setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
    setOverdueTasks((current) => current.map((item) => item.id === task.id ? updated : item).filter((item) => item.plannedDate < today && !item.completedAt));
    if (routes.taskUpdate) router.patch(`${routes.taskUpdate}/${task.id}`, { chunkId: chunkId || null, plannedDate });
    setMenuTask(null); setReviewTask(null); notify(plannedDate !== today ? 'Moved to another day.' : 'Moved to another part of your day.');
  };
  const settingsForShell = settings;
  return <AppShell current="day" settings={settingsForShell} user={props.user} focusChunk={focusChunk} focusDate={today}>
    <div className="mx-auto max-w-[1070px] px-5 pb-20 pt-9 sm:px-8 sm:pt-12">
      <div className="fade-up flex flex-wrap items-center justify-between gap-3">
        <div className="mono flex items-center gap-2 text-[10px] uppercase tracking-[.15em] text-muted"><span className="h-1.5 w-1.5 rounded-full bg-[#cb8d72]" /> Your day, in little pieces</div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigateDate(-1)} aria-label="Previous day" className="rounded-full border border-soft p-2 text-muted hover:bg-[hsl(var(--card))]" data-testid="button-previous-day"><ChevronLeft size={16} /></button>
          <span className="min-w-[96px] text-center text-xs font-medium">{displayDate(today)}</span>
          <button onClick={() => navigateDate(1)} aria-label="Next day" className="rounded-full border border-soft p-2 text-muted hover:bg-[hsl(var(--card))]" data-testid="button-next-day"><ChevronRight size={16} /></button>
        </div>
      </div>
      {overdueTasks.length > 0 && <section className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#d9c9b9] bg-[#f4ece4] px-5 py-4">
        <div><div className="text-xs font-semibold text-[#5b493e]">A few tasks are still on earlier days</div><p className="mb-0 mt-1 text-[11px] leading-5 text-[#75675b]">Nothing moved by itself. You can choose what feels right for each one.</p></div>
        <button onClick={() => setShowOverdue(true)} className="rounded-full border border-[#cbb6a4] px-4 py-2.5 text-xs font-semibold text-[#604f42] hover:bg-white/50">Review {overdueTasks.length} {overdueTasks.length === 1 ? 'task' : 'tasks'}</button>
      </section>}
      <section className="fade-up-delay relative mt-8 overflow-hidden rounded-[28px] bg-[#e9e6d9] px-6 py-7 sm:px-9 sm:py-9">
        <div className="absolute -right-8 -top-14 h-56 w-56 rounded-full border border-[#53715f]/10 sm:right-16 sm:top-[-105px] sm:h-[330px] sm:w-[330px]" />
        <div className="absolute -right-1 top-2 h-44 w-44 rounded-full border border-[#53715f]/10 sm:right-[105px] sm:top-[-54px] sm:h-[230px] sm:w-[230px]" />
        <div className="relative z-10 max-w-[620px]">
          <p className="mono mb-3 text-[10px] uppercase tracking-[.16em] text-[#66766a]">{displayDate(today)}</p>
          <h1 className="serif m-0 text-[43px] font-normal leading-[.98] tracking-[-.035em] text-[#253a30] sm:text-[58px]">{isToday ? 'Let the day be' : 'A day at a time.'}<br /><span className="italic text-[#7a8875]">{isToday ? 'what it is.' : 'No catching up.'}</span></h1>
          <p className="mb-0 mt-4 max-w-[395px] text-[13px] leading-[1.75] text-[#657166]">A soft plan is still a plan. Start where you are, and let the rest wait.</p>
        </div>
        <div className="relative z-10 mt-7 flex items-end justify-between sm:absolute sm:bottom-8 sm:right-9 sm:mt-0 sm:w-[170px]">
          <div><div className="mono text-[10px] uppercase tracking-[.14em] text-[#758075]">A little progress</div><div className="mt-1 flex items-baseline gap-1 text-[#345a47]"><span className="serif text-[39px] leading-none">{completeCount}</span><span className="text-sm text-[#6b766a]">of {dailyTasks.length}</span></div></div>
          <div className="mb-1 flex h-[46px] w-[46px] items-center justify-center rounded-full border border-[#97a08f] text-[#58735f]"><Check size={20} strokeWidth={1.6} /></div>
        </div>
      </section>

      <section className="fade-up-later mt-9">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div><div className="mono mb-2 text-[10px] uppercase tracking-[.15em] text-muted">One thing at a time</div><h2 className="serif m-0 text-[29px] font-normal tracking-[-.02em]">In this part of your day</h2></div>
          <div className="flex items-center gap-2">
            {focusChunk && <Link href={`${routes.focus || '/focus'}?date=${encodeURIComponent(today)}&chunk=${encodeURIComponent(String(focusChunk.id))}`} className="inline-flex items-center gap-2 rounded-full border border-soft px-4 py-2.5 text-xs font-semibold text-[hsl(var(--primary))] no-underline transition-colors hover:bg-[hsl(var(--muted))]" data-testid="link-focus-current-chunk"><Play size={14} /> Focus here</Link>}
            <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--primary))] px-4 py-2.5 text-xs font-semibold text-[hsl(var(--primary-foreground))] shadow-sm transition-transform hover:-translate-y-0.5" data-testid="button-add-task"><Plus size={15} /> Add a task</button>
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_290px]">
          <div className="surface min-h-[310px] rounded-[22px] border border-white/70 p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-soft pb-5">
              <div><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#ce947a]" /><span className="mono text-[10px] uppercase tracking-[.15em] text-muted">In focus</span></div><h3 className="serif mb-0 mt-2 text-[32px] font-normal">{focusChunk?.name || 'A little room'}</h3></div>
              {focusChunk && <div className="mt-1 flex items-center gap-1.5 rounded-full bg-[hsl(var(--muted))] px-3 py-2 text-[11px] text-muted"><Clock3 size={13} />{timeRange(focusChunk)}</div>}
            </div>
            <div className="pt-2">
              {focusTasks.length === 0 ? <div className="flex min-h-[190px] flex-col items-center justify-center text-center">
                <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-[#e6eee5] text-[#4c6a53]"><Coffee size={19} strokeWidth={1.5} /></div>
                <p className="m-0 text-sm font-medium">There’s room to breathe here.</p><p className="mb-3 mt-1 text-xs text-muted">Add a task when something comes to mind.</p>
                <button onClick={() => setShowAdd(true)} className="text-xs font-semibold text-[hsl(var(--primary))] hover:underline">Add something gently</button>
              </div> : focusTasks.map((task) => <TaskRow key={task.id} task={task} menuOpen={menuTask === task.id} setMenuOpen={() => setMenuTask(menuTask === task.id ? null : task.id)} onToggle={() => toggleTask(task)} onReview={() => { setReviewTask(task); setMenuTask(null); }} onEdit={() => { setEditingTask(task); setMenuTask(null); }} />)}
              {focusTasks.length > 0 && <button onClick={() => setShowAdd(true)} className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-xs text-muted transition-colors hover:bg-[hsl(var(--muted))]"><span className="grid h-5 w-5 place-items-center rounded-full border border-[hsl(var(--border))]"><Plus size={12} /></span>Add another, if you like</button>}
            </div>
          </div>
          <aside className="flex flex-col gap-4">
            <div className="rounded-[22px] border border-soft bg-[hsl(var(--card)/.62)] p-5">
              <div className="mb-4 flex items-center justify-between"><div><div className="mono text-[10px] uppercase tracking-[.14em] text-muted">Your day, gently</div><div className="mt-1 text-sm font-semibold">Day chunks</div></div><Link href="/settings" className="rounded-lg p-1.5 text-muted hover:bg-[hsl(var(--muted))]" aria-label="Edit day structure"><SlidersHorizontal size={15} /></Link></div>
              <div className="space-y-1.5">
                {chunkSorted.map((chunk) => {
                  const isFocused = String(chunk.id) === String(focusChunkId);
                  const count = dailyTasks.filter((task) => String(task.chunkId) === String(chunk.id)).length;
                  return <button key={chunk.id} onClick={() => setFocusChunkId(chunk.id)} className={`chunk-row flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left ${isFocused ? 'border-[#a8b7a5] bg-[#eaf0e8]' : 'border-transparent hover:bg-[hsl(var(--background))]'}`} aria-pressed={isFocused} data-testid={`button-chunk-${chunk.id}`}>
                    <span className={`h-2 w-2 rounded-full ${isFocused ? 'bg-[#52755b]' : 'bg-[#c2c9be]'}`} />
                    <span className="min-w-0 flex-1"><span className={`block text-xs ${isFocused ? 'font-semibold text-[#385540]' : 'font-medium'}`}>{chunk.name}</span><span className="mt-1 block text-[10px] text-muted">{timeRange(chunk)}</span></span>
                    <span className="mono text-[10px] text-muted">{count}</span>
                  </button>;
                })}
              </div>
            </div>
            <div className="rounded-[22px] bg-[#dce6df] p-5">
              <div className="flex items-center gap-2 text-[#49624f]"><Moon size={15} /><span className="mono text-[10px] uppercase tracking-[.14em]">No rush to finish</span></div>
              <p className="serif mb-0 mt-3 text-[23px] leading-[1.08] text-[#334d3d]">The plan can change<br />as you do.</p>
              <p className="mb-0 mt-3 text-[11px] leading-[1.65] text-[#667568]">Move things, leave them, or let them go. You get to choose.</p>
            </div>
          </aside>
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-3 border-b border-soft pb-4"><div><div className="mono mb-2 text-[10px] uppercase tracking-[.15em] text-muted">Everything else</div><h2 className="serif m-0 text-[26px] font-normal">Later in the day</h2></div><span className="text-xs text-muted">{otherTasks.filter((t) => !t.completedAt).length} to come</span></div>
        {chunkSorted.filter((chunk) => String(chunk.id) !== String(focusChunkId)).map((chunk) => {
          const list = dailyTasks.filter((task) => String(task.chunkId) === String(chunk.id));
          return <div key={chunk.id} className="flex flex-col gap-3 border-b border-soft py-4 sm:flex-row sm:items-start">
            <button onClick={() => setFocusChunkId(chunk.id)} className="flex min-w-[180px] items-center gap-2 pt-1 text-left text-xs font-semibold hover:text-[hsl(var(--primary))]"><span className="h-1.5 w-1.5 rounded-full bg-[#c5a291]" />{chunk.name}<span className="ml-1 text-[10px] font-normal text-muted">{timeRange(chunk)}</span><ArrowUpRight size={13} className="ml-auto text-muted" /></button>
            <div className="min-w-0 flex-1">{list.length ? list.map((task) => <TaskRow compact key={task.id} task={task} menuOpen={menuTask === task.id} setMenuOpen={() => setMenuTask(menuTask === task.id ? null : task.id)} onToggle={() => toggleTask(task)} onReview={() => { setReviewTask(task); setMenuTask(null); }} onEdit={() => { setEditingTask(task); setMenuTask(null); }} />) : <button onClick={() => { setFocusChunkId(chunk.id); setShowAdd(true); }} className="rounded-lg px-2 py-1 text-xs text-muted hover:text-[hsl(var(--primary))]">Nothing planned. Keep it that way, or add a little something.</button>}</div>
          </div>;
        })}
        {otherTasks.filter((task) => !task.chunkId).length > 0 && <div className="border-b border-soft py-3"><div className="mb-2 text-xs font-semibold text-muted">Unassigned</div>{otherTasks.filter((task) => !task.chunkId).map((task) => <TaskRow key={task.id} compact task={task} menuOpen={menuTask === task.id} setMenuOpen={() => setMenuTask(menuTask === task.id ? null : task.id)} onToggle={() => toggleTask(task)} onReview={() => setReviewTask(task)} onEdit={() => { setEditingTask(task); setMenuTask(null); }} />)}</div>}
      </section>
      <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 text-[10px] text-muted"><span>One day, in its own time.</span><Link href="/settings" className="inline-flex items-center gap-1.5 text-muted no-underline hover:text-[hsl(var(--primary))]">Make this day fit you <ArrowRight size={12} /></Link></footer>
    </div>
    {(showAdd || editingTask) && <TaskDialog key={editingTask?.id ?? 'new-task'} chunks={chunkSorted} selectedChunk={focusChunk?.id ?? ''} plannedDate={today} taskStore={routes.taskStore} taskUpdate={routes.taskUpdate} task={editingTask ?? undefined} close={() => { setShowAdd(false); setEditingTask(null); }} onCreate={createTask} onCreated={() => notify(editingTask ? 'Task updated.' : 'Added to your day.')} />}
    {showOverdue && <Overlay title="What would you like to do?" eyebrow="Your choice, one task at a time" onClose={() => setShowOverdue(false)}>
      <p className="mt-4 text-xs leading-5 text-muted">These tasks stayed on their original dates. Move one, mark it done, or leave it for later.</p>
      <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto">
        {overdueTasks.map((task) => <div key={task.id} className="flex items-center gap-3 rounded-xl border border-soft p-3">
          <div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{task.title}</div><div className="mt-1 text-[10px] text-muted">{displayDate(task.plannedDate)}{task.chunkName ? ` · ${task.chunkName}` : ''}</div></div>
          <button onClick={() => { setShowOverdue(false); setReviewTask(task); }} className="rounded-full border border-soft px-3 py-2 text-[10px] font-semibold">Choose</button>
          <button onClick={() => toggleTask(task)} aria-label={`Mark ${task.title} done`} className="rounded-full p-2 text-[hsl(var(--primary))]" title="Mark done"><Check size={16} /></button>
        </div>)}
      </div>
      <button onClick={() => setShowOverdue(false)} className="mt-4 w-full rounded-xl py-2 text-xs text-muted hover:bg-[hsl(var(--muted))]">Leave these for later</button>
    </Overlay>}
    {reviewTask && <Overlay title="What feels right?" eyebrow="No wrong answer" onClose={() => setReviewTask(null)}>
      <p className="mt-5 rounded-xl bg-[hsl(var(--muted))] px-4 py-3 text-sm">{reviewTask.title}</p>
      <p className="mt-4 text-xs leading-5 text-muted">Plans are suggestions. Choose what you’d like to do with this one.</p>
      <div className="mt-5 grid gap-2">
        {chunkSorted.filter((chunk) => String(chunk.id) !== String(reviewTask.chunkId)).map((chunk) => <button key={chunk.id} onClick={() => moveTask(reviewTask, String(chunk.id))} className="flex items-center justify-between rounded-xl border border-soft px-4 py-3 text-left text-xs hover:bg-[hsl(var(--muted))]"><span>Move to {chunk.name}</span><ArrowRight size={14} className="text-muted" /></button>)}
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2"><input type="date" aria-label="Choose another date" value={moveDate} onChange={(event) => setMoveDate(event.target.value)} className="min-w-0 rounded-xl border border-soft bg-[hsl(var(--background))] px-3 text-xs" /><select aria-label="Choose a chunk for that date" value={moveDateChunk} onChange={(event) => setMoveDateChunk(event.target.value)} className="min-w-0 rounded-xl border border-soft bg-[hsl(var(--background))] px-2 text-xs"><option value="">Unassigned</option>{chunkSorted.map((chunk) => <option key={chunk.id} value={chunk.id}>{chunk.name}</option>)}</select><button onClick={() => moveTask(reviewTask, moveDateChunk || null, moveDate)} className="rounded-xl border border-soft px-3 text-xs hover:bg-[hsl(var(--muted))]">Move date</button></div>
        <button onClick={() => { setReviewTask(null); notify('We’ll leave it for later.'); }} className="flex items-center justify-between rounded-xl border border-soft px-4 py-3 text-left text-xs hover:bg-[hsl(var(--muted))]"><span>Leave it for later</span><ArrowDownLeft size={14} className="text-muted" /></button>
        <button onClick={() => removeTask(reviewTask)} className="flex items-center justify-between rounded-xl border border-transparent px-4 py-3 text-left text-xs text-[#a34f43] hover:bg-[#f6e9e4]"><span>Let it go</span><Trash2 size={14} /></button>
      </div>
    </Overlay>}
    {toast && <div role="status" className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-[#263f33] px-5 py-3 text-xs text-white shadow-lg">{toast}</div>}
  </AppShell>;
}

function FocusRoutePage() {
  const props = useChunkedPage();
  const [tasks, setTasks] = useState<Task[]>(props.tasks ?? []);
  const routes = props.routes ?? {};
  useEffect(() => setTasks(props.tasks ?? []), [props.tasks]);

  const mutate = (
    method: 'post' | 'patch' | 'delete',
    href: string,
    data: Record<string, string | number | boolean | null | undefined> = {},
  ) => new Promise<void>((resolve, reject) => {
    const options = {
      preserveScroll: true,
      preserveState: true,
      onSuccess: () => resolve(),
      onError: (errors: Record<string, string>) => {
        const message = Object.values(errors)[0];
        reject(new Error(message || 'This change could not be saved. Please try again.'));
      },
    };
    if (method === 'post') router.post(href, data, options);
    else if (method === 'patch') router.patch(href, data, options);
    else router.delete(href, options);
  });

  const toggleTask = (task: Task) => {
    const updated = { ...task, completedAt: task.completedAt ? null : new Date().toISOString() };
    setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
    if (!routes.taskComplete) return;
    router.patch(`${routes.taskComplete}/${task.id}/complete`, { completed: Boolean(updated.completedAt) }, {
      preserveScroll: true,
      onError: () => setTasks((current) => current.map((item) => item.id === task.id ? task : item)),
    });
  };

  const chunk = props.chunk ?? props.chunks?.find((item) => String(item.id) === String(props.selectedChunkId));
  const userKey = props.userKey ?? props.user?.email ?? 'guest';
  const preferencesKey = `chunked:focus-media:${userKey}`;
  const [mediaPreferences, setMediaPreferences] = useState<FocusMediaPreferences>(() => {
    const defaults: FocusMediaPreferences = { backgroundId: null, soundId: null, soundSource: 'silence', volume: 28, muted: false, reduceMotion: null };
    if (typeof window === 'undefined') return defaults;
    try {
      const saved = JSON.parse(window.localStorage.getItem(preferencesKey) ?? 'null') as Partial<FocusMediaPreferences> | null;
      if (!saved || typeof saved !== 'object') return defaults;
      const soundSource: FocusSoundSource = saved.soundSource === 'video' || saved.soundSource === 'library' || saved.soundSource === 'silence'
        ? saved.soundSource
        : defaults.soundSource;
      const volume = Number(saved.volume);
      return {
        backgroundId: typeof saved.backgroundId === 'string' ? saved.backgroundId : defaults.backgroundId,
        soundId: typeof saved.soundId === 'string' ? saved.soundId : defaults.soundId,
        soundSource,
        volume: Number.isFinite(volume) ? Math.max(0, Math.min(100, volume)) : defaults.volume,
        muted: typeof saved.muted === 'boolean' ? saved.muted : defaults.muted,
        reduceMotion: typeof saved.reduceMotion === 'boolean' ? saved.reduceMotion : null,
      };
    } catch {
      return defaults;
    }
  });
  const updateMediaPreferences = (patch: Partial<typeof mediaPreferences>) => {
    setMediaPreferences((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(preferencesKey, JSON.stringify(next));
      } catch {
        // Room playback remains usable if browser storage is unavailable.
      }
      return next;
    });
  };
  const taskBase = routes.taskUpdate ?? '/tasks';
  const taskDestroyBase = routes.taskDestroy ?? '/tasks';
  const checklistBase = routes.taskChecklistStore ?? '/tasks';
  const checklistUpdateBase = routes.taskChecklistUpdate ?? '/tasks';
  const checklistDeleteBase = routes.taskChecklistDestroy ?? '/tasks';
  const planBase = routes.focusPlanAction ?? '/focus/plans';
  const settingsBase = routes.focusPlanSettings ?? '/focus/plans';
  const switchBase = routes.focusPlanSwitchChunk ?? '/focus/plans';
  const youtubeUrl = routes.focusMediaYoutube ?? '/focus/media/youtube';
  const planId = props.focusPlanId;
  const goBack = () => {
    const date = props.today ?? props.date ?? dateKey();
    const query = new URLSearchParams({ date });
    if (chunk) query.set('chunk', String(chunk.id));
    router.get(`${routes.day || '/day'}?${query.toString()}`);
  };

  if (!chunk) {
    return <div className="grid min-h-[100dvh] place-items-center p-6 text-center"><div><p className="text-sm text-muted">There isn’t a day chunk to focus on yet.</p><Link href="/settings" className="text-sm font-semibold text-[hsl(var(--primary))]">Set up your day</Link></div></div>;
  }

  return <CurrentChunkPage
    chunk={chunk}
    tasks={tasks}
    date={props.today ?? props.date ?? dateKey()}
    userKey={userKey}
    onToggleTask={toggleTask}
    onBack={goBack}
    checklistItems={props.checklistItems ?? []}
    availableChunks={props.availableChunks ?? []}
    nextChunk={props.nextChunk ?? null}
    session={props.session}
    focusHistory={props.focusHistory ?? []}
    nextSessionAutoStart={props.session ? {
      automaticMode: props.session.transitions === 'automatic',
      remainingTargetSeconds: props.session.remainingPlanSeconds ?? 0,
    } : undefined}
    mediaCatalog={props.mediaCatalog ?? []}
    selectedBackgroundId={mediaPreferences.backgroundId}
    selectedSoundId={mediaPreferences.soundId}
    soundSource={mediaPreferences.soundSource}
    volume={mediaPreferences.volume}
    muted={mediaPreferences.muted}
    reduceMotion={mediaPreferences.reduceMotion}
    onToggleChecklistItem={(item) => mutate('patch', `${checklistUpdateBase}/${item.taskId}/checklist-items/${item.id}`, { completed: item.completed })}
    onAddChecklistItem={(taskId, title) => mutate('post', `${checklistBase}/${taskId}/checklist-items`, { title })}
    onUpdateChecklistItem={(item) => mutate('patch', `${checklistUpdateBase}/${item.taskId}/checklist-items/${item.id}`, { title: item.title })}
    onDeleteChecklistItem={(item) => mutate('delete', `${checklistDeleteBase}/${item.taskId}/checklist-items/${item.id}`)}
    onMoveTask={(task, destination: TaskMoveDestination) => mutate('patch', `${taskBase}/${task.id}`, {
      plannedDate: destination.date,
      chunkId: destination.chunkId,
    })}
    onDeleteParentTask={(task) => mutate('delete', `${taskDestroyBase}/${task.id}`)}
    onAddYouTube={(url) => mutate('post', youtubeUrl, { url })}
    onSwitchToChunk={(nextChunk, options) => {
      if (!planId) return Promise.reject(new Error('The timer plan could not be found.'));
      return mutate('post', `${switchBase}/${planId}/switch-chunk`, {
        chunk_id: nextChunk.id,
        date: nextChunk.date,
        auto_start: options.autoStart,
      });
    }}
    onTimerAction={(action: FocusTimerAction, state) => {
      if (!planId) return Promise.reject(new Error('The timer plan could not be found.'));
      return mutate('post', `${planBase}/${planId}/action`, { action, phase: state.phase });
    }}
    onSaveFocusContext={(sessionId, contextNote) => mutate(
      'patch',
      `${routes.focusSessionContext ?? '/focus/sessions'}/${sessionId}/context`,
      { context_note: contextNote },
    )}
    onPlanSettingsChange={(state) => {
      if (!planId) return Promise.reject(new Error('The timer plan could not be found.'));
      return mutate('patch', `${settingsBase}/${planId}/settings`, {
        focus_minutes: state.focusMinutes,
        break_minutes: state.breakMinutes,
        planned_sessions: state.plannedSessions,
        transition_mode: state.transitions,
      });
    }}
    onSelectBackground={(entry) => updateMediaPreferences({ backgroundId: entry?.id ?? null })}
    onSelectSound={(entry) => updateMediaPreferences({ soundId: entry?.id ?? null })}
    onSoundSourceChange={(soundSource) => updateMediaPreferences({ soundSource })}
    onReduceMotionChange={(reduceMotion) => updateMediaPreferences({ reduceMotion })}
    onVolumeChange={(volume) => updateMediaPreferences({ volume })}
    onMuteChange={(muted) => updateMediaPreferences({ muted })}
  />;
}

function TaskRow({ task, compact = false, menuOpen, setMenuOpen, onToggle, onReview, onEdit }: {
  task: Task; compact?: boolean; menuOpen: boolean; setMenuOpen: () => void; onToggle: () => void; onReview: () => void; onEdit?: () => void;
}) {
  return <div className={`group relative flex items-start gap-3 rounded-xl px-2.5 py-3 ${compact ? 'hover:bg-[hsl(var(--muted)/.55)]' : 'hover:bg-[hsl(var(--muted)/.4)]'}`}>
    <button onClick={onToggle} aria-label={task.completedAt ? `Mark ${task.title} incomplete` : `Complete ${task.title}`} aria-pressed={!!task.completedAt} className={`task-check mt-0.5 grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full border ${task.completedAt ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-white' : 'border-[#b7c0b4] text-transparent hover:border-[hsl(var(--primary))]'}`} data-testid={`button-complete-${task.id}`}>{task.completedAt && <Check size={12} strokeWidth={2.5} />}</button>
    <button onClick={onReview} className="min-w-0 flex-1 text-left" data-testid={`button-review-${task.id}`}>
      <span className={`block text-[13px] leading-5 ${task.completedAt ? 'text-muted line-through decoration-[hsl(var(--muted-foreground)/.5)]' : 'text-[hsl(var(--foreground))]'}`}>{task.title}</span>
      {task.description && !compact && <span className="mt-1 block text-[11px] text-muted">{task.description}</span>}
    </button>
    {task.priority === 'high' && <span className="mt-1 rounded-full bg-[#f2e4d9] px-2 py-1 text-[9px] font-medium text-[#96654e]">Important</span>}
    <div className="relative"><button onClick={setMenuOpen} aria-label={`Options for ${task.title}`} className="rounded-lg p-1.5 text-muted opacity-60 hover:bg-[hsl(var(--muted))] hover:opacity-100" data-testid={`button-task-menu-${task.id}`}><Ellipsis size={16} /></button>
      {menuOpen && <div className="surface absolute right-0 top-8 z-20 w-44 rounded-xl border border-soft p-1.5">
        {onEdit && <button onClick={onEdit} className="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-[hsl(var(--muted))]">Edit task</button>}
        <button onClick={onReview} className="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-[hsl(var(--muted))]">Choose what to do…</button>
        <button onClick={onToggle} className="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-[hsl(var(--muted))]">{task.completedAt ? 'Mark as unfinished' : 'Mark as done'}</button>
      </div>}
    </div>
  </div>;
}

function SettingsPage() {
  const props = useChunkedPage();
  const initialSettings = props.settings || { theme: 'light' as const, navigationPosition: 'sidebar' as const, language: 'en' };
  const form = useForm({ theme: initialSettings.theme, navigationPosition: initialSettings.navigationPosition, language: initialSettings.language });
  const chunks = props.chunks ?? defaultChunks;
  const structure = props.structure || { type: 'day', name: 'A gentle day' };
  const saveSettings = (next: Partial<typeof form.data>) => {
    form.setData({ ...form.data, ...next });
    const payload = { ...form.data, ...next };
    if (props.routes?.settingsUpdate) router.patch(props.routes.settingsUpdate, payload);
    if ('theme' in next) document.documentElement.classList.toggle('dark', next.theme === 'dark');
  };
  return <AppShell current="settings" settings={form.data} user={props.user}>
    <div className="mx-auto max-w-[900px] px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
      <Link href="/" className="mb-8 inline-flex items-center gap-2 text-xs text-muted no-underline hover:text-[hsl(var(--primary))]"><ArrowLeft size={14} /> Back to your day</Link>
      <div className="fade-up"><div className="mono mb-3 text-[10px] uppercase tracking-[.16em] text-muted">Make it feel like yours</div><h1 className="serif m-0 text-[52px] font-normal leading-none tracking-[-.035em]">Your rhythm.</h1><p className="mt-4 max-w-md text-sm leading-6 text-muted">A few small choices can make your day feel more like your own.</p></div>
      <div className="mt-9 space-y-5">
        <section className="surface rounded-[22px] p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4"><div><h2 className="m-0 text-sm font-semibold">Day rhythm</h2><p className="mb-0 mt-1.5 text-xs text-muted">Choose the shape of your day. You can change it whenever.</p></div><Link href="/onboarding" className="text-xs font-semibold text-[hsl(var(--primary))] no-underline hover:underline">Edit rhythm</Link></div>
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-[hsl(var(--muted)/.7)] p-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e2e9df] text-[#4d6952]"><Clock3 size={17} /></span><div><div className="text-xs font-semibold">{structure.name}</div><div className="mt-1 text-[10px] text-muted">{chunks.map((chunk) => chunk.name).join('  ·  ')}</div></div></div>
        </section>
        <section className="surface rounded-[22px] p-5 sm:p-7">
          <h2 className="m-0 text-sm font-semibold">Appearance</h2><p className="mb-4 mt-1.5 text-xs text-muted">A softer palette for the pace you like.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {([{ theme: 'light', title: 'Daylight', icon: Sun, description: 'Warm paper, green ink' }, { theme: 'dark', title: 'Evening', icon: Moon, description: 'Deep forest, soft linen' }, { theme: 'system', title: 'Follow device', icon: Compass, description: 'Let your device decide' }] as const).map(({ theme, title, icon: Icon, description }) => <button key={theme} onClick={() => saveSettings({ theme })} aria-pressed={form.data.theme === theme} className={`theme-glow rounded-2xl border p-4 text-left text-[hsl(var(--foreground))] transition-colors ${form.data.theme === theme ? 'border-[#78907b] bg-[#edf1e9] dark:border-[#91b18f] dark:bg-[#293b30]' : 'border-soft hover:bg-[hsl(var(--muted))]'}`}><Icon size={17} className="text-[hsl(var(--primary))]" /><div className="mt-3 text-xs font-semibold">{title}</div><div className="mt-1 text-[10px] text-muted">{description}</div></button>)}
          </div>
        </section>
        <section className="surface rounded-[22px] p-5 sm:p-7">
          <h2 className="m-0 text-sm font-semibold">Where navigation lives</h2><p className="mb-4 mt-1.5 text-xs text-muted">Pick the layout that feels natural. Day, Focus, and Settings stay easy to reach.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <button onClick={() => saveSettings({ navigationPosition: 'sidebar' })} aria-pressed={form.data.navigationPosition === 'sidebar'} className={`theme-glow rounded-2xl border p-4 text-left text-[hsl(var(--foreground))] ${form.data.navigationPosition === 'sidebar' ? 'border-[#78907b] bg-[#edf1e9] dark:border-[#91b18f] dark:bg-[#293b30]' : 'border-soft hover:bg-[hsl(var(--muted))]'}`}>
              <div className="mb-3 flex h-[82px] overflow-hidden rounded-xl border border-soft bg-[hsl(var(--background))]"><div className="flex w-[29%] flex-col gap-2 bg-[#29463a] p-2"><span className="h-2 w-9 rounded bg-white/60" /><span className="mt-2 h-2 w-12 rounded bg-white/30" /><span className="h-2 w-10 rounded bg-white/20" /></div><div className="flex-1 p-3"><span className="block h-2 w-16 rounded bg-[#6e8972]/35" /><span className="mt-3 block h-8 rounded-lg bg-[#e6e9de]" /></div></div>
              <div className="flex items-center justify-between"><span className="text-xs font-semibold">Sidebar</span>{form.data.navigationPosition === 'sidebar' && <CheckCircle2 size={15} className="text-[hsl(var(--primary))]" />}</div><div className="mt-1 text-[10px] text-muted">Links stay tucked along the left.</div>
            </button>
            <button onClick={() => saveSettings({ navigationPosition: 'top' })} aria-pressed={form.data.navigationPosition === 'top'} className={`theme-glow rounded-2xl border p-4 text-left text-[hsl(var(--foreground))] ${form.data.navigationPosition === 'top' ? 'border-[#78907b] bg-[#edf1e9] dark:border-[#91b18f] dark:bg-[#293b30]' : 'border-soft hover:bg-[hsl(var(--muted))]'}`}>
              <div className="mb-3 overflow-hidden rounded-xl border border-soft bg-[hsl(var(--background))]"><div className="flex h-6 items-center gap-2 border-b border-soft bg-[hsl(var(--card))] px-2"><span className="h-1.5 w-6 rounded bg-[#6e8972]/50" /><span className="h-1.5 w-5 rounded bg-[#6e8972]/20" /><span className="h-1.5 w-6 rounded bg-[#6e8972]/20" /></div><div className="p-3"><span className="block h-2 w-16 rounded bg-[#6e8972]/35" /><span className="mt-3 block h-8 rounded-lg bg-[#e6e9de]" /></div></div>
              <div className="flex items-center justify-between"><span className="text-xs font-semibold">Top bar</span>{form.data.navigationPosition === 'top' && <CheckCircle2 size={15} className="text-[hsl(var(--primary))]" />}</div><div className="mt-1 text-[10px] text-muted">Links sit in a slim row above your day.</div>
            </button>
          </div>
        </section>
        <section className="surface rounded-[22px] p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="m-0 text-sm font-semibold">Language</h2><p className="mb-0 mt-1.5 text-xs text-muted">The current text is English; Arabic switches the page direction to RTL.</p></div><select value={form.data.language} onChange={(event) => saveSettings({ language: event.target.value })} className="h-10 min-w-[170px] rounded-xl border border-soft bg-[hsl(var(--background))] px-3 text-xs"><option value="en">English</option><option value="ar">Arabic · RTL</option></select></div>
        </section>
      </div>
      <div className="mt-7 flex flex-wrap justify-end gap-3">
        {props.routes?.logout && <button onClick={() => router.post(props.routes!.logout!)} className="rounded-full border border-soft px-5 py-3 text-xs font-semibold text-muted">Sign out</button>}
        <Link href="/day" className="rounded-full bg-[hsl(var(--primary))] px-5 py-3 text-xs font-semibold text-[hsl(var(--primary-foreground))] no-underline">Done for now</Link>
      </div>
    </div>
  </AppShell>;
}

function OnboardingPage() {
  const props = useChunkedPage();
  const form = useForm({
    type: props.current?.type || 'day',
    name: props.current?.name || 'A gentle day',
    chunks: props.current?.chunks?.map((chunk) => chunk.name) ?? ['Morning', 'Afternoon', 'Evening'],
  });
  const [customChunk, setCustomChunk] = useState('');
  const [activePreset, setActivePreset] = useState(props.current?.type || 'day');
  const [navigation, setNavigation] = useState<'sidebar' | 'top'>(props.settings?.navigationPosition === 'top' ? 'top' : 'sidebar');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(props.settings?.theme ?? 'light');
  const [language] = useState(props.settings?.language ?? 'en');
  const [setupError, setSetupError] = useState('');
  const [showTaskConfirmation, setShowTaskConfirmation] = useState(false);
  const [savingStructure, setSavingStructure] = useState(false);
  const [taskChoices, setTaskChoices] = useState<Record<number, string>>({});
  const [taskSuggestions, setTaskSuggestions] = useState<Record<number, TaskMoveSuggestion>>({});
  const [chunkTimes, setChunkTimes] = useState(() => props.current?.chunks?.map((chunk) => ({
    startTime: chunk.startTime || '',
    endTime: chunk.endTime || '',
  })) ?? form.data.chunks.map(() => ({ startTime: '', endTime: '' })));
  useEffect(() => {
    if (chunkTimes.length !== form.data.chunks.length) {
      setChunkTimes((current) => form.data.chunks.map((_, index) => current[index] ?? ({ startTime: '', endTime: '' })));
    }
  }, [chunkTimes.length, form.data.chunks.length]);
  const selectPreset = (preset: typeof presets[number]) => {
    setActivePreset(preset.type);
    form.setData({ type: preset.type, name: preset.name, chunks: [...preset.parts] });
    setChunkTimes(preset.parts.map((_, index) => preset.type === 'work'
      ? [
          { startTime: '08:00', endTime: '12:00' },
          { startTime: '12:00', endTime: '13:00' },
          { startTime: '13:00', endTime: '17:00' },
          { startTime: '17:00', endTime: '22:00' },
        ][index]
      : { startTime: '', endTime: '' }));
  };
  const skipSetup = () => {
    if (props.current) {
      router.visit(props.routes?.day || '/day');
      return;
    }
    const defaults = { type: 'day', name: 'A gentle day', chunks: ['Morning', 'Afternoon', 'Evening'], settings: { theme: 'light', navigationPosition: 'sidebar', language: 'en' } };
    if (props.routes?.structureSkip) router.post(props.routes.structureSkip, defaults, { onSuccess: () => router.visit(props.routes?.day || '/day') });
    else if (props.routes?.structureUpdate) router.post(props.routes.structureUpdate, defaults, { onSuccess: () => router.visit(props.routes?.day || '/day') });
    else window.location.href = props.routes?.day || '/day';
  };
  const rhythmHasChanged = () => {
    const currentChunks = props.current?.chunks ?? [];
    if (currentChunks.length !== form.data.chunks.length) return true;

    return currentChunks.some((chunk, index) => (
      chunk.name !== form.data.chunks[index]?.trim()
      || (chunk.startTime || '') !== (chunkTimes[index]?.startTime || '')
      || (chunk.endTime || '') !== (chunkTimes[index]?.endTime || '')
    ));
  };
  const submitStructure = (taskDecisions?: { taskId: number; action: 'move' | 'unassigned' | 'delete'; chunkIndex?: number }[]) => {
    const structure = { type: form.data.type, name: form.data.name, chunks: form.data.chunks };
    const settings = { navigationPosition: navigation, theme, language };
    if (form.data.chunks.length === 0 || form.data.chunks.some((chunk) => !chunk.trim())) {
      setSetupError('Give every part of your day a name, or remove the empty part.');
      return;
    }
    setSetupError('');
    if (props.routes?.structureUpdate) router.post(props.routes.structureUpdate, {
      ...structure,
      chunkTimes,
      settings,
      ...(taskDecisions ? { taskDecisions } : {}),
    }, {
      onStart: () => setSavingStructure(true),
      onFinish: () => setSavingStructure(false),
      onSuccess: () => setShowTaskConfirmation(false),
      onError: (errors) => setSetupError(Object.values(errors).join(' ')),
    });
    else window.location.href = props.routes?.day || '/day';
  };
  const prepareTaskReview = () => {
    const affectedTasks = props.affectedTasks ?? [];
    const draftChunks = form.data.chunks.map((name, index) => ({
      name: name.trim(),
      startTime: chunkTimes[index]?.startTime || '',
      endTime: chunkTimes[index]?.endTime || '',
    }));
    const suggestions = Object.fromEntries(affectedTasks.map((task) => [
      task.id,
      suggestTaskDestination(task, draftChunks),
    ])) as Record<number, TaskMoveSuggestion>;
    const choices = Object.fromEntries(affectedTasks.map((task) => [task.id, ''])) as Record<number, string>;
    setTaskSuggestions(suggestions);
    setTaskChoices(choices);
    setSetupError('');
    setShowTaskConfirmation(true);
  };
  const applyTaskChoices = () => {
    const decisions: { taskId: number; action: 'move' | 'unassigned' | 'delete'; chunkIndex?: number }[] = [];
    for (const task of props.affectedTasks ?? []) {
      const choice = taskChoices[task.id];
      if (!choice) {
        setSetupError('Choose a destination or action for every task before continuing.');
        return;
      }
      if (choice === 'delete') {
        decisions.push({ taskId: task.id, action: 'delete' });
      } else if (choice === 'unassigned') {
        decisions.push({ taskId: task.id, action: 'unassigned' });
      } else if (choice.startsWith('move:')) {
        const chunkIndex = Number(choice.slice('move:'.length));
        if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= form.data.chunks.length) {
          setSetupError('Choose a valid destination for every task.');
          return;
        }
        decisions.push({ taskId: task.id, action: 'move', chunkIndex });
      } else {
        setSetupError('Choose a destination or action for every task before continuing.');
        return;
      }
    }
    setSetupError('');
    submitStructure(decisions);
  };
  const finish = () => {
    if (form.data.chunks.length === 0 || form.data.chunks.some((chunk) => !chunk.trim())) {
      setSetupError('Give every part of your day a name, or remove the empty part.');
      return;
    }
    if (props.current && rhythmHasChanged() && (props.affectedTasks?.length ?? 0) > 0) {
      prepareTaskReview();
      return;
    }
    submitStructure();
  };
  return <div className="main-canvas grain min-h-[100dvh]">
    <header className="flex h-[72px] items-center justify-between px-5 sm:px-10"><WordmarkLight /><button onClick={skipSetup} className="text-xs text-muted hover:text-[hsl(var(--primary))]">Skip setup <ArrowRight className="ml-1 inline" size={13} /></button></header>
    <main className="mx-auto max-w-[1050px] px-5 pb-16 pt-7 sm:px-10 sm:pt-10">
      <div className="fade-up mb-8"><div className="mono mb-3 text-[10px] uppercase tracking-[.16em] text-muted">A soft start · optional</div><h1 className="serif m-0 text-[47px] font-normal leading-[.98] tracking-[-.035em] sm:text-[60px]">Let’s make a little<br /><span className="italic text-[#71816e]">room for your day.</span></h1><p className="mb-0 mt-4 max-w-lg text-sm leading-6 text-muted">Choose a shape that suits your life. Nothing here is set in stone, and skipping is always okay.</p></div>
      <div className="grid items-start gap-7 lg:grid-cols-[1fr_310px]">
        <section><div className="mb-3 flex items-baseline justify-between"><h2 className="m-0 text-sm font-semibold">Choose a day rhythm</h2><span className="text-[10px] text-muted">Edit any name later</span></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {presets.map((preset, index) => <button key={preset.type} onClick={() => selectPreset(preset)} aria-pressed={activePreset === preset.type} className={`hover-lift rounded-[19px] border p-4 text-left ${activePreset === preset.type ? 'border-[#769077] bg-[#edf1e9] shadow-[0_6px_20px_rgba(53,83,61,.08)]' : 'border-soft bg-[hsl(var(--card))] hover:border-[#b6c2b0]'}`} data-testid={`button-preset-${preset.type}`}>
              <div className="flex items-start justify-between"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#e7ece3] text-[11px] font-semibold text-[#49644d]">0{index + 1}</span>{activePreset === preset.type && <CheckCircle2 size={17} className="text-[hsl(var(--primary))]" />}</div>
              <div className="mt-3 text-sm font-semibold">{preset.name}</div><div className="mt-1 text-[11px] text-muted">{preset.detail}</div>
              <div className="mt-3 flex flex-wrap gap-1.5">{preset.parts.map((part) => <span key={part} className="rounded-full bg-[hsl(var(--muted))] px-2.5 py-1 text-[9px] text-muted">{part}</span>)}</div>
            </button>)}
          </div>
          <div className="mt-4 rounded-[18px] border border-soft bg-[hsl(var(--card))] p-4"><div className="mb-3 text-xs font-semibold">Make the chunks yours</div><div className="flex flex-wrap gap-2">{form.data.chunks.map((chunk, index) => <div key={`${chunk}-${index}`} className="flex items-center gap-1 rounded-full bg-[hsl(var(--muted))] pl-3 pr-1 text-xs"><input aria-label={`Chunk ${index + 1} name`} value={chunk} onChange={(e) => form.setData('chunks', form.data.chunks.map((name, i) => i === index ? e.target.value : name))} className="w-24 bg-transparent py-2 outline-none" /><button aria-label={`Remove ${chunk}`} onClick={() => { form.setData('chunks', form.data.chunks.filter((_, i) => i !== index)); setChunkTimes((current) => current.filter((_, i) => i !== index)); }} className="rounded-full p-1 text-muted hover:bg-white/70"><X size={12} /></button></div>)}<form onSubmit={(e) => { e.preventDefault(); if (customChunk.trim()) { form.setData('chunks', [...form.data.chunks, customChunk.trim()]); setChunkTimes((current) => [...current, { startTime: '', endTime: '' }]); setCustomChunk(''); } }} className="flex"><input value={customChunk} onChange={(e) => setCustomChunk(e.target.value)} placeholder="Add a chunk" className="w-28 rounded-full border border-soft bg-transparent px-3 text-xs" /><button aria-label="Add chunk" className="ml-1 rounded-full bg-[hsl(var(--primary))] p-2 text-white"><Plus size={13} /></button></form></div></div>
        </section>
        <aside className="surface rounded-[22px] p-5 sm:p-6">
          <div className="mono text-[10px] uppercase tracking-[.14em] text-muted">A quick preview</div><h2 className="serif mb-0 mt-2 text-[27px] font-normal">Your day, gently.</h2>
          <div className="mt-4 rounded-2xl bg-[#e8e9dc] p-4"><div className="mono text-[9px] uppercase tracking-[.12em] text-[#778075]">Today · one thing at a time</div><div className="serif mt-3 text-[25px] text-[#334a38]">{form.data.chunks[0] || 'A little room'}</div><div className="mt-3 flex items-center gap-2 rounded-xl bg-white/55 p-3 text-[10px] text-[#536354]"><Circle size={13} />Make a little room for yourself</div></div>
          <div className="mt-5"><div className="text-xs font-semibold">Navigation</div><div className="mt-2 grid grid-cols-2 gap-2"><button onClick={() => setNavigation('sidebar')} aria-pressed={navigation === 'sidebar'} className={`rounded-xl border px-3 py-2.5 text-[11px] ${navigation === 'sidebar' ? 'border-[#82977f] bg-[#edf1e9]' : 'border-soft'}`}>Sidebar</button><button onClick={() => setNavigation('top')} aria-pressed={navigation === 'top'} className={`rounded-xl border px-3 py-2.5 text-[11px] ${navigation === 'top' ? 'border-[#82977f] bg-[#edf1e9]' : 'border-soft'}`}>Top bar</button></div>
            <div className="mt-2 flex h-16 overflow-hidden rounded-lg border border-soft bg-[hsl(var(--background))]">{navigation === 'sidebar' ? <><div className="w-10 bg-[#29463a] p-2"><div className="h-1 w-5 rounded bg-white/60" /><div className="mt-3 h-1 w-6 rounded bg-white/30" /></div><div className="flex-1 p-2"><div className="h-1.5 w-12 rounded bg-[#65806c]/30" /><div className="mt-2 h-6 rounded bg-[#e8e9dc]" /></div></> : <div className="w-full"><div className="flex h-4 items-center gap-2 border-b border-soft bg-[hsl(var(--card))] px-2"><i className="h-1 w-5 rounded bg-[#65806c]/40" /><i className="h-1 w-4 rounded bg-[#65806c]/20" /></div><div className="p-2"><div className="h-1.5 w-12 rounded bg-[#65806c]/30" /><div className="mt-2 h-6 rounded bg-[#e8e9dc]" /></div></div>}</div>
          </div>
          <div className="mt-5"><div className="text-xs font-semibold">Color mood</div><div className="mt-2 flex gap-2"><button onClick={() => { setTheme('light'); document.documentElement.classList.remove('dark'); }} aria-pressed={theme === 'light'} className={`flex flex-1 items-center gap-2 rounded-xl border p-2.5 text-[10px] ${theme === 'light' ? 'border-[#82977f] bg-[#edf1e9]' : 'border-soft'}`}><Sun size={14} />Daylight</button><button onClick={() => { setTheme('dark'); document.documentElement.classList.add('dark'); }} aria-pressed={theme === 'dark'} className={`flex flex-1 items-center gap-2 rounded-xl border p-2.5 text-[10px] ${theme === 'dark' ? 'border-[#82977f] bg-[#edf1e9]' : 'border-soft'}`}><Moon size={14} />Evening</button></div></div>
          {setupError && <p role="alert" className="mt-4 rounded-xl bg-[#f5e8e3] px-3 py-2 text-[11px] text-[#984e42]">{setupError}</p>}
          <details className="mt-5 rounded-xl border border-soft p-3">
            <summary className="cursor-pointer text-[10px] font-semibold">Optional times · help place existing tasks</summary>
            <p className="mb-3 mt-2 text-[10px] leading-4 text-muted">Matching block names or day parts can suggest a destination; times are an optional extra hint.</p>
            <div className="space-y-2">{form.data.chunks.map((chunk, index) => <div key={`time-${index}`} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[10px] text-muted">{chunk || `Part ${index + 1}`}</span>
              <input type="time" aria-label={`${chunk || `Part ${index + 1}`} start time`} value={chunkTimes[index]?.startTime || ''} onChange={(event) => setChunkTimes((current) => current.map((times, i) => i === index ? { ...(times ?? { startTime: '', endTime: '' }), startTime: event.target.value } : times))} className="h-8 w-[96px] rounded-lg border border-soft bg-[hsl(var(--background))] px-2 text-[10px]" />
              <span className="text-[9px] text-muted">to</span>
              <input type="time" aria-label={`${chunk || `Part ${index + 1}`} end time`} value={chunkTimes[index]?.endTime || ''} onChange={(event) => setChunkTimes((current) => current.map((times, i) => i === index ? { ...(times ?? { startTime: '', endTime: '' }), endTime: event.target.value } : times))} className="h-8 w-[96px] rounded-lg border border-soft bg-[hsl(var(--background))] px-2 text-[10px]" />
            </div>)}</div>
          </details>
          <button onClick={finish} disabled={savingStructure} className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[hsl(var(--primary))] py-3 text-xs font-semibold text-[hsl(var(--primary-foreground))] transition-transform hover:-translate-y-0.5 disabled:opacity-60">{savingStructure ? 'Saving…' : 'Save my rhythm'} {!savingStructure && <ArrowRight size={14} />}</button>
          <button onClick={skipSetup} className="mt-3 block w-full text-center text-[10px] text-muted hover:text-[hsl(var(--primary))]">Or skip and start with a gentle default</button>
        </aside>
      </div>
    </main>
    {showTaskConfirmation && <Overlay title="Review task destinations" eyebrow="Before your rhythm changes" onClose={() => setShowTaskConfirmation(false)}>
      <p className="mt-4 text-xs leading-5 text-muted">Review the suggestion for each task, then select a destination or action for that task. Nothing changes until you confirm below.</p>
      {setupError && <p role="alert" className="mt-3 rounded-xl bg-[#f5e8e3] px-3 py-2 text-[11px] text-[#984e42]">{setupError}</p>}
      <div className="mt-4 max-h-[40vh] space-y-3 overflow-y-auto rounded-xl border border-soft p-2">
        {(props.affectedTasks ?? []).map((task) => {
          const suggestion = taskSuggestions[task.id];
          return <div key={task.id} className="rounded-xl bg-[hsl(var(--muted)/.55)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><div className="truncate text-xs font-medium">{task.title}</div><div className="mt-1 text-[10px] text-muted">{displayDate(task.plannedDate)}{task.chunkName ? ` · from ${task.chunkName}` : ''}{task.completed ? ' · completed' : ''}</div></div>
              <span className="shrink-0 rounded-full bg-white/70 px-2 py-1 text-[9px] text-muted">{task.priority}</span>
            </div>
            <label className="mt-3 block text-[10px] font-semibold">
              {suggestion ? `Suggested: ${form.data.chunks[suggestion.chunkIndex]} · ${suggestion.reason}` : 'No clear match · choose what happens'}
              <select aria-label={`Destination or action for ${task.title}`} data-testid={`select-task-decision-${task.id}`} value={taskChoices[task.id] ?? ''} onChange={(event) => setTaskChoices((current) => ({ ...current, [task.id]: event.target.value }))} className="mt-1.5 h-10 w-full rounded-lg border border-soft bg-[hsl(var(--background))] px-3 text-xs font-normal">
                <option value="">{suggestion ? 'Select to confirm or choose another action' : 'Choose a destination or action'}</option>
                {form.data.chunks.map((chunk, index) => <option key={`${chunk}-${index}`} value={`move:${index}`}>{suggestion?.chunkIndex === index ? `Move to ${chunk} · suggested` : `Move to ${chunk}`}</option>)}
                <option value="unassigned">Leave unassigned</option>
                <option value="delete">Delete this task</option>
              </select>
            </label>
          </div>;
        })}
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button type="button" data-testid="button-save-rhythm-task-choices" disabled={savingStructure || (props.affectedTasks ?? []).some((task) => !taskChoices[task.id])} onClick={applyTaskChoices} className="rounded-xl bg-[hsl(var(--primary))] px-4 py-3 text-xs font-semibold text-[hsl(var(--primary-foreground))] disabled:opacity-50 sm:col-span-2">{savingStructure ? 'Saving…' : 'Confirm choices and save rhythm'}</button>
        <button type="button" data-testid="button-cancel-rhythm-task-choices" disabled={savingStructure} onClick={() => setShowTaskConfirmation(false)} className="rounded-xl px-4 py-3 text-xs text-muted hover:bg-[hsl(var(--muted))] sm:col-span-2">Cancel rhythm change</button>
      </div>
    </Overlay>}
  </div>;
}

function WordmarkLight() {
  return <Link href="/" className="flex items-center gap-2.5 text-[hsl(var(--foreground))] no-underline"><span className="grid h-8 w-8 place-items-center rounded-[11px] bg-[#d9a38f] text-[#203a31]"><span className="h-3.5 w-3.5 rounded-[4px] border-[1.5px] border-current" /></span><span className="text-[19px] font-semibold tracking-[-.055em]">chunked<span className="text-[#c1846e]">.</span></span></Link>;
}

function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const props = useChunkedPage();
  const register = mode === 'register';
  const form = useForm({ name: '', email: '', password: '', password_confirmation: '' });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const route = register ? props.routes?.register : props.routes?.login;
    if (route) form.post(route);
  };
  return <div className="main-canvas grain grid min-h-[100dvh] lg:grid-cols-[1fr_1fr]">
    <section className="relative hidden min-h-[100dvh] overflow-hidden bg-[#29453a] p-10 text-[#f4f0e5] lg:flex lg:flex-col">
      <Wordmark onDarkSurface />
      <div className="absolute -right-20 top-28 h-[440px] w-[440px] rounded-full border border-white/10" /><div className="absolute right-[-22px] top-[180px] h-[270px] w-[270px] rounded-full border border-white/10" />
      <div className="relative z-10 my-auto max-w-[500px] pb-12 pl-8"><div className="mono mb-5 text-[10px] uppercase tracking-[.17em] text-[#c1cbb9]">A little structure. A lot of grace.</div><h1 className="serif m-0 text-[68px] font-normal leading-[.91] tracking-[-.025em]">You don’t have<br />to do it <span className="italic text-[#d9a38f]">all.</span></h1><p className="mt-6 max-w-sm text-sm leading-7 text-white/65">A calmer place to hold your many interests, one small part of the day at a time.</p></div>
      <div className="relative z-10 flex items-center gap-3 text-[11px] text-white/55"><span className="h-px w-8 bg-[#d9a38f]" />Plans can change. You can, too.</div>
    </section>
    <section className="flex min-h-[100dvh] flex-col px-5 sm:px-10">
      <header className="flex h-[76px] items-center justify-between lg:justify-end"><div className="lg:hidden"><WordmarkLight /></div><span className="text-xs text-muted">{register ? 'Already have a space?' : 'New to Chunked?'} <Link href={register ? '/login' : '/register'} className="font-semibold text-[hsl(var(--primary))] no-underline">{register ? 'Log in' : 'Create one'}</Link></span></header>
      <div className="mx-auto flex w-full max-w-[390px] flex-1 flex-col justify-center pb-16">
        <div className="mono mb-3 text-[10px] uppercase tracking-[.15em] text-muted">{register ? 'Start with a little space' : 'Welcome back'}</div>
        <h1 className="serif m-0 text-[46px] font-normal leading-none">{register ? 'Your day, your way.' : 'Good to see you.'}</h1>
        <p className="mt-3 text-sm leading-6 text-muted">{register ? 'A gentle place for everything you want to make room for.' : 'Pick up where you left off. No rush.'}</p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          {register && <label className="block text-xs font-semibold">Your name<input value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} autoComplete="name" required className="mt-2 h-12 w-full rounded-xl border border-soft bg-[hsl(var(--card))] px-4 text-sm" placeholder="What should we call you?" /></label>}
          <label className="block text-xs font-semibold">Email address<input type="email" value={form.data.email} onChange={(e) => form.setData('email', e.target.value)} autoComplete="email" required className="mt-2 h-12 w-full rounded-xl border border-soft bg-[hsl(var(--card))] px-4 text-sm" placeholder="you@example.com" /></label>
          <label className="block text-xs font-semibold">Password<input type="password" value={form.data.password} onChange={(e) => form.setData('password', e.target.value)} autoComplete={register ? 'new-password' : 'current-password'} required className="mt-2 h-12 w-full rounded-xl border border-soft bg-[hsl(var(--card))] px-4 text-sm" placeholder="At least 8 characters" /></label>
          {register && <label className="block text-xs font-semibold">Confirm password<input type="password" value={form.data.password_confirmation} onChange={(e) => form.setData('password_confirmation', e.target.value)} autoComplete="new-password" required className="mt-2 h-12 w-full rounded-xl border border-soft bg-[hsl(var(--card))] px-4 text-sm" placeholder="Type it once more" /></label>}
          {Object.values(form.errors).length > 0 && <div role="alert" className="rounded-xl bg-[#f5e8e3] px-4 py-3 text-xs text-[#984e42]">{Object.values(form.errors).join(' ')}</div>}
          <button disabled={form.processing} className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-transform hover:-translate-y-0.5 disabled:opacity-60">{form.processing ? 'One moment…' : register ? 'Make my space' : 'Come on in'}<ArrowRight size={15} /></button>
        </form>
        <div className="mt-8 border-t border-soft pt-5 text-center text-[10px] leading-5 text-muted">Your plans belong to you. Change them, leave them, begin again.</div>
      </div>
    </section>
  </div>;
}

export default function App(props: ChunkedPageProps = {}) {
  const url = window.location.pathname;
  const language = props.settings?.language || 'en';
  const theme = props.settings?.theme || 'light';
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);
  useEffect(() => {
    const systemDark = theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', theme === 'dark' || systemDark);
  }, [theme]);
  let page: ReactNode = <DayPage key={`${props?.user?.email || 'day'}-${url}`} />;
  if (url === '/settings') page = <SettingsPage />;
  if (url === '/onboarding') page = <OnboardingPage />;
  if (url === '/focus') page = <FocusRoutePage key={`focus-${props.userKey ?? props.user?.email ?? 'guest'}-${props.today ?? props.date ?? ''}-${props.chunk?.id ?? props.selectedChunkId ?? ''}`} />;
  if (url === '/login') page = <AuthPage mode="login" />;
  if (url === '/register') page = <AuthPage mode="register" />;
  return <PageContext.Provider value={props || {}}>{page}</PageContext.Provider>;
}
