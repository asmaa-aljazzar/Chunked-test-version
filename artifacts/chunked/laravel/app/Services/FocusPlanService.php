<?php

namespace App\Services;

use App\Models\Chunk;
use App\Models\FocusPlan;
use App\Models\FocusSession;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class FocusPlanService
{
    public function chunkEndAt(Chunk $chunk, string $date, string $timezone): ?CarbonImmutable
    {
        if (! $chunk->end_time) {
            return null;
        }

        $end = CarbonImmutable::parse($date.' '.substr((string) $chunk->end_time, 0, 5), $timezone);
        if ($chunk->start_time) {
            $start = CarbonImmutable::parse($date.' '.substr((string) $chunk->start_time, 0, 5), $timezone);
            if ($end->lessThanOrEqualTo($start)) {
                $end = $end->addDay();
            }
        }

        return $end->utc();
    }

    public function findOrCreate(User $user, string $date, Chunk $chunk, ?CarbonImmutable $chunkEndAt): FocusPlan
    {
        $plan = $user->focusPlans()
            ->whereDate('planned_date', $date)
            ->where('current_chunk_id', $chunk->id)
            ->latest('id')
            ->first();

        if (! $plan) {
            $now = CarbonImmutable::now('UTC');
            $plan = $user->focusPlans()->create([
                'uuid' => (string) Str::uuid(),
                'planned_date' => $date,
                'current_chunk_id' => $chunk->id,
                'current_chunk_name_snapshot' => $chunk->name,
                'focus_minutes' => 25,
                'break_minutes' => 5,
                'planned_sessions' => 1,
                'transition_mode' => 'manual',
                'phase' => 'focus',
                'status' => $chunkEndAt && $chunkEndAt->lessThanOrEqualTo($now) ? 'boundary' : 'ready',
                'phase_remaining_seconds' => 25 * 60,
                'chunk_ends_at' => $chunkEndAt,
            ]);
        } elseif (! in_array($plan->status, ['running', 'paused', 'boundary'], true)) {
            $plan->update([
                'current_chunk_name_snapshot' => $chunk->name,
                'chunk_ends_at' => $chunkEndAt,
            ]);
        }

        return $this->sync($plan);
    }

    public function sync(FocusPlan $plan): FocusPlan
    {
        return DB::transaction(function () use ($plan) {
            $plan = FocusPlan::query()->lockForUpdate()->findOrFail($plan->id);
            $now = CarbonImmutable::now('UTC');

            for ($guard = 0; $guard < 30; $guard++) {
                if (! in_array($plan->status, ['running', 'paused', 'ready'], true)) {
                    break;
                }

                $boundary = $plan->chunk_ends_at
                    ? CarbonImmutable::parse($plan->chunk_ends_at)->utc()
                    : null;

                $phaseEnd = $plan->phase_ends_at
                    ? CarbonImmutable::parse($plan->phase_ends_at)->utc()
                    : null;

                if ($boundary && $boundary->lessThanOrEqualTo($now)
                    && (! $phaseEnd || $boundary->lessThanOrEqualTo($phaseEnd))
                    && $plan->status !== 'completed') {
                    if ($plan->phase === 'focus' && $plan->current_session_id) {
                        $session = FocusSession::query()
                            ->whereKey($plan->current_session_id)
                            ->lockForUpdate()
                            ->first();
                        if ($session && in_array($session->status, ['running', 'paused'], true)) {
                            $endsWithSession = $phaseEnd && $phaseEnd->lessThanOrEqualTo($boundary);
                            $sessionEnd = $endsWithSession ? $phaseEnd : $boundary;
                            $this->closeFocusSession($session, $sessionEnd, $endsWithSession);
                            if ($endsWithSession) {
                                $plan->completed_sessions = min($plan->planned_sessions, $plan->completed_sessions + 1);
                                $plan->current_session_id = null;
                            }
                        }
                    }

                    $plan->status = 'boundary';
                    $plan->phase_ends_at = null;
                    $plan->phase_started_at = null;
                    $plan->phase_remaining_seconds = 0;
                    $plan->save();
                    break;
                }

                if ($plan->status !== 'running' || ! $plan->phase_ends_at) {
                    break;
                }

                $phaseEnd = CarbonImmutable::parse($plan->phase_ends_at)->utc();
                if ($phaseEnd->greaterThan($now)) {
                    break;
                }

                if ($plan->phase === 'focus') {
                    $session = FocusSession::query()
                        ->whereKey($plan->current_session_id)
                        ->lockForUpdate()
                        ->first();
                    if (! $session || $session->status !== 'running') {
                        $plan->status = 'ready';
                        $plan->phase_ends_at = null;
                        $plan->phase_started_at = null;
                        $plan->phase_remaining_seconds = $plan->focus_minutes * 60;
                        $plan->save();
                        break;
                    }

                    $this->closeFocusSession($session, $phaseEnd, true);
                    $plan->completed_sessions = min($plan->planned_sessions, $plan->completed_sessions + 1);
                    $plan->current_session_id = null;

                    if ($plan->completed_sessions >= $plan->planned_sessions) {
                        $this->completePlan($plan);
                    } elseif ($plan->transition_mode === 'automatic' && $plan->break_minutes > 0) {
                        $this->startBreakAt($plan, $phaseEnd);
                    } elseif ($plan->transition_mode === 'automatic') {
                        $this->startNextFocusAt($plan, $phaseEnd);
                    } elseif ($plan->break_minutes === 0) {
                        $plan->phase = 'focus';
                        $plan->status = 'ready';
                        $plan->phase_remaining_seconds = $plan->focus_minutes * 60;
                        $plan->phase_started_at = null;
                        $plan->phase_ends_at = null;
                    } else {
                        $plan->phase = 'break';
                        $plan->status = 'ready';
                        $plan->phase_remaining_seconds = $plan->break_minutes * 60;
                        $plan->phase_started_at = null;
                        $plan->phase_ends_at = null;
                    }
                } else {
                    if ($plan->transition_mode === 'automatic') {
                        $this->startNextFocusAt($plan, $phaseEnd);
                    } else {
                $plan->phase = 'focus';
                $plan->status = 'ready';
                $plan->phase_remaining_seconds = $plan->focus_minutes * 60;
                        $plan->phase_started_at = null;
                        $plan->phase_ends_at = null;
                $plan->current_session_id = null;
                    }
                }

                $plan->save();
            }

            if ($plan->status === 'ready' && $plan->chunk_ends_at
                && CarbonImmutable::parse($plan->chunk_ends_at)->utc()->lessThanOrEqualTo($now)) {
                $plan->status = 'boundary';
                $plan->phase_remaining_seconds = 0;
                $plan->phase_ends_at = null;
                $plan->phase_started_at = null;
                $plan->save();
            }
            if ($plan->status === 'completed' && $plan->chunk_ends_at
                && CarbonImmutable::parse($plan->chunk_ends_at)->utc()->lessThanOrEqualTo($now)) {
                $plan->status = 'boundary';
                $plan->phase_remaining_seconds = 0;
                $plan->phase_ends_at = null;
                $plan->phase_started_at = null;
                $plan->save();
            }

            return $plan->fresh();
        });
    }

    public function updateSettings(FocusPlan $plan, array $settings): FocusPlan
    {
        return DB::transaction(function () use ($plan, $settings) {
            $plan = FocusPlan::query()->lockForUpdate()->findOrFail($plan->id);
            if (in_array($plan->status, ['running', 'paused'], true)) {
                throw ValidationException::withMessages([
                    'settings' => 'Finish or reset the current phase before changing timer settings.',
                ]);
            }

            if ($settings['planned_sessions'] < $plan->completed_sessions) {
                throw ValidationException::withMessages([
                    'planned_sessions' => 'The target cannot be lower than the sessions already completed.',
                ]);
            }

            $plan->fill($settings);
            if ($plan->phase === 'focus') {
                $plan->phase_remaining_seconds = $plan->focus_minutes * 60;
            } elseif ($plan->phase === 'break') {
                $plan->phase_remaining_seconds = $plan->break_minutes * 60;
            }
            if ($plan->status === 'paused') {
                $plan->status = 'ready';
                $plan->phase_started_at = null;
                $plan->phase_ends_at = null;
            }
            if ($plan->completed_sessions >= $plan->planned_sessions) {
                $this->completePlan($plan);
            }
            $plan->save();

            return $plan->fresh();
        });
    }

    public function start(FocusPlan $plan, ?string $requestedPhase = null): FocusPlan
    {
        return DB::transaction(function () use ($plan, $requestedPhase) {
            $plan = FocusPlan::query()->lockForUpdate()->findOrFail($plan->id);
            $plan = $this->syncLocked($plan);

            if (! in_array($plan->status, ['ready'], true)) {
                throw ValidationException::withMessages(['timer' => 'This timer is not ready to start.']);
            }
            if ($plan->completed_sessions >= $plan->planned_sessions) {
                $this->completePlan($plan);
                return $plan->fresh();
            }

            if ($requestedPhase === 'focus') {
                $plan->phase = 'focus';
                $plan->phase_remaining_seconds = $plan->focus_minutes * 60;
            } elseif ($requestedPhase === 'break') {
                if ($plan->completed_sessions < 1 || $plan->break_minutes < 1) {
                    throw ValidationException::withMessages(['timer' => 'Complete a focus session before starting a break.']);
                }
                $plan->phase = 'break';
                $plan->phase_remaining_seconds = $plan->break_minutes * 60;
            }

            if ($plan->phase === 'break') {
                $this->beginPhase($plan, 'break', CarbonImmutable::now('UTC'));
            } else {
                $this->startFocusSession($plan, CarbonImmutable::now('UTC'));
            }

            $plan->save();
            return $plan->fresh();
        });
    }

    public function pause(FocusPlan $plan): FocusPlan
    {
        return DB::transaction(function () use ($plan) {
            $plan = FocusPlan::query()->lockForUpdate()->findOrFail($plan->id);
            $plan = $this->syncLocked($plan);
            if ($plan->status !== 'running') {
                return $plan;
            }

            $now = CarbonImmutable::now('UTC');
            $remaining = $plan->phase_ends_at
                ? max(0, CarbonImmutable::parse($plan->phase_ends_at)->utc()->getTimestamp() - $now->getTimestamp())
                : $plan->phase_remaining_seconds;

            if ($plan->phase === 'focus' && $plan->current_session_id) {
                $session = FocusSession::query()->lockForUpdate()->find($plan->current_session_id);
                if ($session && $session->status === 'running') {
                    $elapsed = $session->last_resumed_at
                        ? max(0, $now->getTimestamp() - CarbonImmutable::parse($session->last_resumed_at)->utc()->getTimestamp())
                        : 0;
                    $session->focused_seconds = min($session->planned_seconds, $session->focused_seconds + $elapsed);
                    $session->remaining_seconds = $remaining;
                    $session->last_resumed_at = null;
                    $session->status = 'paused';
                    $session->save();
                }
            }

            $plan->status = 'paused';
            $plan->phase_remaining_seconds = $remaining;
            $plan->phase_started_at = null;
            $plan->phase_ends_at = null;
            $plan->save();

            return $plan->fresh();
        });
    }

    public function resume(FocusPlan $plan): FocusPlan
    {
        return DB::transaction(function () use ($plan) {
            $plan = FocusPlan::query()->lockForUpdate()->findOrFail($plan->id);
            $plan = $this->syncLocked($plan);
            if ($plan->status !== 'paused') {
                throw ValidationException::withMessages(['timer' => 'This timer is not paused.']);
            }

            $now = CarbonImmutable::now('UTC');
            if ($plan->phase === 'focus') {
                $session = FocusSession::query()->lockForUpdate()->find($plan->current_session_id);
                if (! $session || $session->status !== 'paused') {
                    throw ValidationException::withMessages(['timer' => 'The focus session is no longer available.']);
                }
                $session->status = 'running';
                $session->last_resumed_at = $now;
                $session->save();
            }

            $this->beginPhase($plan, $plan->phase, $now, $plan->phase_remaining_seconds);
            $plan->save();

            return $plan->fresh();
        });
    }

    public function reset(FocusPlan $plan): FocusPlan
    {
        return DB::transaction(function () use ($plan) {
            $plan = FocusPlan::query()->lockForUpdate()->findOrFail($plan->id);
            $now = CarbonImmutable::now('UTC');

            if ($plan->phase === 'focus' && $plan->current_session_id) {
                $session = FocusSession::query()->lockForUpdate()->find($plan->current_session_id);
                if ($session && in_array($session->status, ['running', 'paused'], true)) {
                    if ($session->status === 'running' && $session->last_resumed_at) {
                        $elapsed = max(0, $now->getTimestamp() - CarbonImmutable::parse($session->last_resumed_at)->utc()->getTimestamp());
                        $session->focused_seconds = min($session->planned_seconds, $session->focused_seconds + $elapsed);
                    }
                    $session->status = 'abandoned';
                    $session->ended_at = $now;
                    $session->last_resumed_at = null;
                    $session->save();
                }
            }

            $plan->phase = 'focus';
            $plan->status = 'ready';
            $plan->phase_remaining_seconds = $plan->focus_minutes * 60;
            $plan->phase_started_at = null;
            $plan->phase_ends_at = null;
            $plan->current_session_id = null;
            $plan->save();

            return $plan->fresh();
        });
    }

    public function finish(FocusPlan $plan): FocusPlan
    {
        return DB::transaction(function () use ($plan) {
            $plan = FocusPlan::query()->lockForUpdate()->findOrFail($plan->id);
            $plan = $this->syncLocked($plan);
            if ($plan->status !== 'running' && $plan->status !== 'paused') {
                return $plan;
            }
            if ($plan->phase !== 'focus' || ! $plan->current_session_id) {
                throw ValidationException::withMessages(['timer' => 'Finish is available during a focus session.']);
            }

            $now = CarbonImmutable::now('UTC');
            $session = FocusSession::query()->lockForUpdate()->findOrFail($plan->current_session_id);
            $this->closeFocusSession($session, $now, true);
            $plan->completed_sessions = min($plan->planned_sessions, $plan->completed_sessions + 1);
            $plan->current_session_id = null;

            if ($plan->completed_sessions >= $plan->planned_sessions) {
                $this->completePlan($plan);
            } elseif ($plan->transition_mode === 'automatic' && $plan->break_minutes > 0) {
                $this->startBreakAt($plan, $now);
            } elseif ($plan->transition_mode === 'automatic') {
                $this->startNextFocusAt($plan, $now);
            } elseif ($plan->break_minutes === 0) {
                $plan->phase = 'focus';
                $plan->status = 'ready';
                $plan->phase_remaining_seconds = $plan->focus_minutes * 60;
                $plan->phase_started_at = null;
                $plan->phase_ends_at = null;
            } else {
                $plan->phase = 'break';
                $plan->status = 'ready';
                $plan->phase_remaining_seconds = $plan->break_minutes * 60;
                $plan->phase_started_at = null;
                $plan->phase_ends_at = null;
            }
            $plan->save();

            return $plan->fresh();
        });
    }

    public function switchChunk(FocusPlan $plan, Chunk $chunk, string $date, ?CarbonImmutable $chunkEndAt, bool $autoStart): FocusPlan
    {
        return DB::transaction(function () use ($plan, $chunk, $date, $chunkEndAt, $autoStart) {
            $plan = FocusPlan::query()->lockForUpdate()->findOrFail($plan->id);
            if ($plan->status !== 'boundary') {
                throw ValidationException::withMessages(['chunk' => 'The current chunk has not ended.']);
            }

            $plan->planned_date = $date;
            $plan->current_chunk_id = $chunk->id;
            $plan->current_chunk_name_snapshot = $chunk->name;
            $plan->chunk_ends_at = $chunkEndAt;
            $plan->phase = 'focus';
            $plan->phase_remaining_seconds = $plan->focus_minutes * 60;
            $plan->phase_started_at = null;
            $plan->phase_ends_at = null;
            $plan->current_session_id = null;
            $plan->status = 'ready';
            $plan->save();

            $remaining = max(0, $plan->planned_sessions - $plan->completed_sessions);
            $remainingPlanSeconds = ($remaining * $plan->focus_minutes * 60)
                + (max(0, $remaining - 1) * $plan->break_minutes * 60);
            $newChunkAvailable = $chunkEndAt
                ? max(0, $chunkEndAt->getTimestamp() - CarbonImmutable::now('UTC')->getTimestamp())
                : null;
            $planFits = $newChunkAvailable === null || $remainingPlanSeconds <= $newChunkAvailable;
            if ($autoStart && $plan->transition_mode === 'automatic' && $remaining > 0 && $planFits) {
                $this->startFocusSession($plan, CarbonImmutable::now('UTC'));
            }

            return $plan->fresh();
        });
    }

    public function state(FocusPlan $plan): array
    {
        $now = CarbonImmutable::now('UTC');
        $isRunning = $plan->status === 'running';
        $remaining = $isRunning && $plan->phase_ends_at
            ? max(0, CarbonImmutable::parse($plan->phase_ends_at)->utc()->getTimestamp() - $now->getTimestamp())
            : (int) $plan->phase_remaining_seconds;
        $target = $plan->phase === 'focus' ? (int) $plan->focus_minutes * 60 : (int) $plan->break_minutes * 60;
        $progress = max(0, $target - $remaining);
        $currentSession = null;
        if ($plan->current_session_id) {
            $currentSession = $plan->sessions()->whereKey($plan->current_session_id)->first();
        }
        if ($plan->phase === 'focus' && $currentSession) {
            $progress = (int) $currentSession->focused_seconds;
            if ($isRunning && $currentSession->last_resumed_at) {
                $progress += max(0, $now->getTimestamp() - CarbonImmutable::parse($currentSession->last_resumed_at)->utc()->getTimestamp());
            }
            $progress = min($target, $progress);
        } elseif ($plan->status === 'boundary') {
            $progress = 0;
        }

        $available = $plan->chunk_ends_at
            ? max(0, CarbonImmutable::parse($plan->chunk_ends_at)->utc()->getTimestamp() - $now->getTimestamp())
            : null;
        $remainingSessions = max(0, $plan->planned_sessions - $plan->completed_sessions);
        $remainingPlanSeconds = ($remainingSessions * $plan->focus_minutes * 60)
            + (max(0, $remainingSessions - 1) * $plan->break_minutes * 60);
        $totalPlanSeconds = ($plan->planned_sessions * $plan->focus_minutes * 60)
            + (max(0, $plan->planned_sessions - 1) * $plan->break_minutes * 60);

        return [
            'planId' => $plan->id,
            'sessionId' => $plan->current_session_id,
            'phase' => $plan->phase,
            'active' => $isRunning,
            'paused' => $plan->status === 'paused',
            'status' => $plan->status,
            'targetSeconds' => $target,
            'progressSeconds' => min($target, $progress),
            'remainingSeconds' => $remaining,
            'endsAt' => $plan->phase_ends_at?->toISOString(),
            'plannedSessions' => (int) $plan->planned_sessions,
            'completedSessions' => (int) $plan->completed_sessions,
            'focusMinutes' => (int) $plan->focus_minutes,
            'breakMinutes' => (int) $plan->break_minutes,
            'transitions' => $plan->transition_mode,
            'chunkEndsAt' => $plan->chunk_ends_at?->toISOString(),
            'availableSeconds' => $available,
            'totalPlanSeconds' => $totalPlanSeconds,
            'remainingPlanSeconds' => $remainingPlanSeconds,
            'planExceedsChunk' => $available !== null && $remainingPlanSeconds > $available,
            'maxFocusMinutes' => $available === null ? 180 : min(180, (int) floor($available / 60)),
            'remainingTargetSessions' => $remainingSessions,
            'partialSession' => $currentSession?->status === 'partial',
        ];
    }

    public function activeSummary(User $user): ?array
    {
        $plan = $user->focusPlans()
            ->whereIn('status', ['running', 'paused', 'boundary'])
            ->latest('id')
            ->first();
        if (! $plan) {
            return null;
        }

        $plan = $this->sync($plan);
        if (! in_array($plan->status, ['running', 'paused', 'boundary'], true)) {
            return null;
        }

        $state = $this->state($plan);
        return [
            ...$state,
            'date' => $plan->planned_date->toDateString(),
            'chunkId' => $plan->current_chunk_id,
            'chunkName' => $plan->current_chunk_name_snapshot ?? $plan->chunk?->name ?? 'Current chunk',
            'url' => route('focus.index', [
                'date' => $plan->planned_date->toDateString(),
                'chunk' => $plan->current_chunk_id,
            ], false),
        ];
    }

    private function syncLocked(FocusPlan $plan): FocusPlan
    {
        $now = CarbonImmutable::now('UTC');
        if ($plan->status === 'running' || $plan->status === 'paused' || $plan->status === 'ready') {
            $boundary = $plan->chunk_ends_at
                ? CarbonImmutable::parse($plan->chunk_ends_at)->utc()
                : null;

            if ($boundary && $boundary->lessThanOrEqualTo($now)) {
                $phaseEnd = $plan->phase_ends_at
                    ? CarbonImmutable::parse($plan->phase_ends_at)->utc()
                    : null;
                if ($plan->phase === 'focus' && $plan->current_session_id) {
                    $session = FocusSession::query()->lockForUpdate()->find($plan->current_session_id);
                    if ($session && in_array($session->status, ['running', 'paused'], true)) {
                        $completedByTimer = $phaseEnd && $phaseEnd->lessThanOrEqualTo($boundary);
                        $this->closeFocusSession($session, $completedByTimer ? $phaseEnd : $boundary, $completedByTimer);
                        if ($completedByTimer) {
                            $plan->completed_sessions = min($plan->planned_sessions, $plan->completed_sessions + 1);
                            $plan->current_session_id = null;
                        }
                    }
                }
                $plan->status = 'boundary';
                $plan->phase_ends_at = null;
                $plan->phase_started_at = null;
                $plan->phase_remaining_seconds = 0;
                $plan->save();

                return $plan;
            }
        }

        return $plan;
    }

    private function startFocusSession(FocusPlan $plan, CarbonImmutable $at): void
    {
        if ($plan->completed_sessions >= $plan->planned_sessions) {
            $this->completePlan($plan);
            return;
        }

        if ($plan->chunk_ends_at) {
            $chunkEnd = CarbonImmutable::parse($plan->chunk_ends_at)->utc();
            $available = max(0, $chunkEnd->getTimestamp() - $at->getTimestamp());
            $focusSeconds = $plan->focus_minutes * 60;
            if ($available < $focusSeconds) {
                $plan->status = 'boundary';
                $plan->phase = 'focus';
                $plan->phase_remaining_seconds = 0;
                $plan->phase_started_at = null;
                $plan->phase_ends_at = null;
                return;
            }
        }

        $session = $plan->sessions()->create([
            'session_key' => (string) Str::uuid(),
            'user_id' => $plan->user_id,
            'chunk_id' => $plan->current_chunk_id,
            'chunk_name_snapshot' => $plan->current_chunk_name_snapshot,
            'planned_date' => $plan->planned_date,
            'session_number' => $plan->completed_sessions + 1,
            'status' => 'running',
            'planned_seconds' => $plan->focus_minutes * 60,
            'focused_seconds' => 0,
            'remaining_seconds' => $plan->focus_minutes * 60,
            'started_at' => $at,
            'last_resumed_at' => $at,
        ]);

        $plan->current_session_id = $session->id;
        $this->beginPhase($plan, 'focus', $at);
    }

    private function startBreakAt(FocusPlan $plan, CarbonImmutable $at): void
    {
        if ($plan->chunk_ends_at) {
            $chunkEnd = CarbonImmutable::parse($plan->chunk_ends_at)->utc();
            if ($chunkEnd->lessThanOrEqualTo($at)) {
                $plan->status = 'boundary';
                $plan->phase = 'break';
                $plan->phase_remaining_seconds = 0;
                $plan->phase_started_at = null;
                $plan->phase_ends_at = null;
                return;
            }
        }

        $this->beginPhase($plan, 'break', $at);
    }

    private function startNextFocusAt(FocusPlan $plan, CarbonImmutable $at): void
    {
        $this->startFocusSession($plan, $at);
    }

    private function beginPhase(FocusPlan $plan, string $phase, CarbonImmutable $at, ?int $seconds = null): void
    {
        $duration = $seconds ?? ($phase === 'focus' ? $plan->focus_minutes * 60 : $plan->break_minutes * 60);
        $plan->phase = $phase;
        $plan->status = 'running';
        $plan->phase_remaining_seconds = $duration;
        $plan->phase_started_at = $at;
        $plan->phase_ends_at = $at->addSeconds($duration);

        if ($phase === 'focus' && $plan->current_session_id) {
            $session = FocusSession::query()->find($plan->current_session_id);
            if ($session) {
                $session->status = 'running';
                $session->remaining_seconds = $duration;
                $session->last_resumed_at = $at;
                $session->save();
            }
        }
    }

    private function closeFocusSession(FocusSession $session, CarbonImmutable $at, bool $completed): void
    {
        if (! in_array($session->status, ['running', 'paused'], true)) {
            return;
        }

        $focused = (int) $session->focused_seconds;
        if ($session->status === 'running' && $session->last_resumed_at) {
            $focused += max(0, $at->getTimestamp() - CarbonImmutable::parse($session->last_resumed_at)->utc()->getTimestamp());
        }
        $session->focused_seconds = min((int) $session->planned_seconds, $focused);
        $session->remaining_seconds = $completed ? 0 : max(0, (int) $session->planned_seconds - $session->focused_seconds);
        $session->status = $completed ? 'completed' : 'partial';
        $session->ended_at = $at;
        $session->counted_at = $completed ? $at : null;
        $session->last_resumed_at = null;
        $session->save();
    }

    private function completePlan(FocusPlan $plan): void
    {
        $plan->status = 'completed';
        $plan->phase = 'focus';
        $plan->phase_remaining_seconds = 0;
        $plan->phase_started_at = null;
        $plan->phase_ends_at = null;
    }
}
