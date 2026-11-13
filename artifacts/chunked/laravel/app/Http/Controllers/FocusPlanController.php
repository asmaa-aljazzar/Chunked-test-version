<?php

namespace App\Http\Controllers;

use App\Models\Chunk;
use App\Models\FocusPlan;
use App\Services\FocusPlanService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class FocusPlanController extends Controller
{
    public function settings(Request $request, int $planId, FocusPlanService $service): RedirectResponse
    {
        $plan = $this->ownedPlan($request, $planId);
        $validated = $request->validate([
            'focus_minutes' => ['required', 'integer', 'min:1', 'max:180'],
            'break_minutes' => ['required', 'integer', 'min:0', 'max:180'],
            'planned_sessions' => ['required', 'integer', 'min:1', 'max:12'],
            'transition_mode' => ['required', 'in:manual,automatic'],
        ]);

        $service->updateSettings($plan, $validated);

        return back()->with('success', 'Timer plan saved.');
    }

    public function action(Request $request, int $planId, FocusPlanService $service): RedirectResponse
    {
        $plan = $this->ownedPlan($request, $planId);
        $validated = $request->validate([
            'action' => ['required', 'in:start,pause,resume,reset,finish,sync'],
            'phase' => ['sometimes', 'in:focus,break'],
        ]);
        $plan = $service->sync($plan);

        if ($validated['action'] === 'start') {
            $otherRunningPlan = $request->user()->focusPlans()
                ->where('id', '!=', $plan->id)
                ->whereIn('status', ['running', 'paused'])
                ->exists();
            if ($otherRunningPlan) {
                throw ValidationException::withMessages([
                    'timer' => 'Another focus timer is already running. Return to that room first.',
                ]);
            }

            $state = $service->state($plan);
            if ($state['planExceedsChunk']) {
                throw ValidationException::withMessages([
                    'timer' => 'This plan is longer than the time left in this chunk. Adjust the plan before starting.',
                ]);
            }
        }

        match ($validated['action']) {
            'start' => $service->start($plan, $validated['phase'] ?? null),
            'pause' => $service->pause($plan),
            'resume' => $service->resume($plan),
            'reset' => $service->reset($plan),
            'finish' => $service->finish($plan),
            'sync' => $plan,
        };

        return back();
    }

    public function switchChunk(Request $request, int $planId, FocusPlanService $service): RedirectResponse
    {
        $plan = $this->ownedPlan($request, $planId);
        $validated = $request->validate([
            'chunk_id' => ['required', 'integer'],
            'date' => ['required', 'date_format:Y-m-d'],
            'auto_start' => ['sometimes', 'boolean'],
        ]);

        $chunk = Chunk::query()
            ->whereKey($validated['chunk_id'])
            ->whereNull('deleted_at')
            ->whereHas('dayStructure', fn ($query) => $query->where('user_id', $request->user()->id))
            ->firstOrFail();

        $openTasksRemain = $request->user()->tasks()
            ->whereDate('planned_date', $plan->planned_date)
            ->where('chunk_id', $plan->current_chunk_id)
            ->whereNull('completed_at')
            ->exists();
        if ($openTasksRemain) {
            throw ValidationException::withMessages([
                'tasks' => 'Choose where each unfinished task belongs before continuing.',
            ]);
        }

        $timezone = $request->user()->settings?->timezone ?: 'Asia/Amman';
        $chunkEndAt = $service->chunkEndAt($chunk, $validated['date'], $timezone);
        $autoStart = (bool) ($validated['auto_start'] ?? false)
            && $plan->transition_mode === 'automatic'
            && $plan->completed_sessions < $plan->planned_sessions;

        $service->switchChunk($plan, $chunk, $validated['date'], $chunkEndAt, $autoStart);

        return redirect()->route('focus.index', [
            'date' => $validated['date'],
            'chunk' => $chunk->id,
        ]);
    }

    private function ownedPlan(Request $request, int $planId): FocusPlan
    {
        return $request->user()->focusPlans()->whereKey($planId)->firstOrFail();
    }
}
