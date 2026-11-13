<?php

namespace App\Http\Controllers;

use App\Models\Chunk;
use Carbon\CarbonImmutable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use App\Models\FocusMediaAsset;
use App\Services\FocusPlanService;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class FocusController extends Controller
{
    public function index(Request $request, FocusPlanService $focusPlans): Response|RedirectResponse
    {
        $user = $request->user();
        $settings = $user->settings;
        $structure = $user->dayStructure()
            ->with(['chunks' => fn ($query) => $query->orderBy('sort_order')])
            ->first();

        if (! $structure || ! $settings?->onboarded_at) {
            return redirect()->route('onboarding.index');
        }

        $timezone = $settings->timezone ?: 'Asia/Amman';
        $date = $request->query('date', CarbonImmutable::now($timezone)->toDateString());
        Validator::make(['date' => $date], ['date' => ['required', 'date_format:Y-m-d']])->validate();

        $chunks = $structure->chunks->values();
        $chunk = $this->selectedChunk($request, $chunks, $timezone);
        if (! $chunk) {
            return redirect()->route('day.index', ['date' => $date]);
        }

        $activePlan = $user->focusPlans()
            ->whereIn('status', ['running', 'paused', 'boundary'])
            ->latest('id')
            ->first();
        if ($activePlan && ($activePlan->planned_date->toDateString() !== $date
            || (int) $activePlan->current_chunk_id !== (int) $chunk->id)) {
            return redirect()->route('focus.index', [
                'date' => $activePlan->planned_date->toDateString(),
                'chunk' => $activePlan->current_chunk_id,
            ]);
        }

        $chunkEndAt = $focusPlans->chunkEndAt($chunk, $date, $timezone);
        $plan = $activePlan ?: $user->focusPlans()
            ->whereDate('planned_date', $date)
            ->where('current_chunk_id', $chunk->id)
            ->latest('id')
            ->first();
        $plan = $plan
            ? $focusPlans->sync($plan)
            : $focusPlans->findOrCreate($user, $date, $chunk, $chunkEndAt);

        $tasks = $user->tasks()
            ->whereDate('planned_date', $date)
            ->where('chunk_id', $chunk->id)
            ->with(['chunk', 'checklistItems'])
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();
        $tomorrow = CarbonImmutable::parse($date, $timezone)->addDay()->toDateString();
        $chunkOptions = collect([$date, $tomorrow])->flatMap(
            fn (string $optionDate) => $chunks->map(fn (Chunk $item) => [
                'id' => $item->id,
                'name' => $item->name,
                'startTime' => $item->start_time ? substr((string) $item->start_time, 0, 5) : null,
                'endTime' => $item->end_time ? substr((string) $item->end_time, 0, 5) : null,
                'date' => $optionDate,
            ]),
        )->values();
        $chunkIndex = $chunks->search(fn (Chunk $item) => (int) $item->id === (int) $chunk->id);
        $nextChunkModel = $chunkIndex !== false ? $chunks->get($chunkIndex + 1) : null;
        $nextChunkDate = $date;
        if (! $nextChunkModel) {
            $nextChunkModel = $chunks->first();
            $nextChunkDate = $tomorrow;
        }
        $nextChunk = $nextChunkModel ? [
            'id' => $nextChunkModel->id,
            'name' => $nextChunkModel->name,
            'startTime' => $nextChunkModel->start_time ? substr((string) $nextChunkModel->start_time, 0, 5) : null,
            'endTime' => $nextChunkModel->end_time ? substr((string) $nextChunkModel->end_time, 0, 5) : null,
            'date' => $nextChunkDate,
        ] : null;
        $mediaCatalog = FocusMediaAsset::query()
            ->where('is_active', true)
            ->where(fn ($query) => $query->whereNull('user_id')->orWhere('user_id', $user->id))
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->filter(fn (FocusMediaAsset $asset) => $asset->external_url
                || ($asset->file_path && ($asset->storage_disk === 'object_storage'
                    || Storage::disk($asset->storage_disk ?: 'public')->exists($asset->file_path))))
            ->map(fn (FocusMediaAsset $asset) => [
                'id' => (string) $asset->id,
                'title' => $asset->title,
                'kind' => $asset->kind,
                'url' => $asset->public_url,
                'thumbnailUrl' => $asset->public_thumbnail_url,
            ])
            ->filter(fn (array $asset) => is_string($asset['url']) && $asset['url'] !== '')
            ->values();
        $timerState = $focusPlans->state($plan);
        $focusHistory = $focusPlans->history(
            $user,
            CarbonImmutable::parse($date, $timezone)->subDays(29)->toDateString(),
            $date,
        );

        return Inertia::render('App', [
            'date' => $date,
            'today' => $date,
            'userKey' => (string) $user->id,
            'chunk' => [
                'id' => $chunk->id,
                'name' => $chunk->name,
                'startTime' => $chunk->start_time ? substr((string) $chunk->start_time, 0, 5) : null,
                'endTime' => $chunk->end_time ? substr((string) $chunk->end_time, 0, 5) : null,
                'sortOrder' => $chunk->sort_order,
            ],
            'chunks' => $chunks->map(fn (Chunk $item) => [
                'id' => $item->id,
                'name' => $item->name,
                'startTime' => $item->start_time ? substr((string) $item->start_time, 0, 5) : null,
                'endTime' => $item->end_time ? substr((string) $item->end_time, 0, 5) : null,
                'sortOrder' => $item->sort_order,
            ])->all(),
            'selectedChunkId' => $chunk->id,
            'nextChunk' => $nextChunk,
            'availableChunks' => $chunkOptions->all(),
            'focusPlanId' => $plan->id,
            'session' => $timerState,
            'focusHistory' => $focusHistory,
            'nextSessionAutoStart' => [
                'automaticMode' => $plan->transition_mode === 'automatic',
                'remainingTargetSeconds' => $timerState['remainingPlanSeconds'],
            ],
            'checklistItems' => $tasks->flatMap(fn ($task) => $task->checklistItems->map(fn ($item) => [
                'id' => $item->id,
                'taskId' => $task->id,
                'title' => $item->title,
                'completed' => $item->completed_at !== null,
                'order' => $item->sort_order,
            ]))->values()->all(),
            'mediaCatalog' => $mediaCatalog->all(),
            'tasks' => $tasks->map(fn ($task) => [
                'id' => $task->id,
                'title' => $task->title,
                'description' => $task->description,
                'plannedDate' => $task->planned_date->toDateString(),
                'chunkId' => $task->chunk_id,
                'chunkName' => $task->chunk?->name ?? $task->chunk_name_snapshot,
                'priority' => $task->priority,
                'completedAt' => $task->completed_at?->toISOString(),
            ])->all(),
            'settings' => [
                'theme' => $settings->theme_key,
                'language' => $settings->language,
                'navigationPosition' => $settings->navigation_position,
                'timezone' => $timezone,
            ],
        ]);
    }

    private function selectedChunk(Request $request, $chunks, string $timezone): ?Chunk
    {
        $requested = $request->query('chunk');
        if ($requested !== null) {
            $requestedId = filter_var($requested, FILTER_VALIDATE_INT);
            if ($requestedId && $chunks->contains('id', $requestedId)) {
                return $chunks->firstWhere('id', $requestedId);
            }
        }

        $now = CarbonImmutable::now($timezone)->format('H:i');
        foreach ($chunks as $chunk) {
            if ($chunk->start_time && $chunk->end_time && $this->timeIsInChunk(
                $now,
                substr((string) $chunk->start_time, 0, 5),
                substr((string) $chunk->end_time, 0, 5),
            )) {
                return $chunk;
            }
        }

        return $chunks->first();
    }

    private function timeIsInChunk(string $now, string $start, string $end): bool
    {
        if ($start <= $end) {
            return $now >= $start && $now < $end;
        }

        return $now >= $start || $now < $end;
    }
}
