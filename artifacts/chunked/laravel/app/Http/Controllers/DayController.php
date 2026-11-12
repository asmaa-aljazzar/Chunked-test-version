<?php

namespace App\Http\Controllers;

use App\Models\Chunk;
use Carbon\CarbonImmutable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Inertia\Inertia;
use Inertia\Response;

class DayController extends Controller
{
    public function index(Request $request): Response|RedirectResponse
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

        $tasks = $user->tasks()
            ->whereDate('planned_date', $date)
            ->with('chunk')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();
        $overdueTasks = $user->tasks()
            ->whereDate('planned_date', '<', $date)
            ->whereNull('completed_at')
            ->with('chunk')
            ->orderBy('planned_date')
            ->orderBy('sort_order')
            ->get();

        $chunks = $structure->chunks->map(function (Chunk $chunk) use ($tasks) {
            $chunkTasks = $tasks->where('chunk_id', $chunk->id)->values();

            return [
                'id' => $chunk->id,
                'name' => $chunk->name,
                'startTime' => $chunk->start_time ? substr((string) $chunk->start_time, 0, 5) : null,
                'endTime' => $chunk->end_time ? substr((string) $chunk->end_time, 0, 5) : null,
                'sortOrder' => $chunk->sort_order,
            ];
        })->values();

        $unassignedTasks = $tasks->whereNull('chunk_id')->values();
        $selectedChunkId = $this->selectedChunkId($request, $chunks, $timezone);

        return Inertia::render('App', [
            'date' => $date,
            'today' => $date,
            'structure' => [
                'type' => $structure->type,
                'name' => $structure->name,
            ],
            'chunks' => $chunks,
            'selectedChunkId' => $selectedChunkId,
            'tasks' => $tasks->map(fn ($task) => $this->taskData($task))->all(),
            'overdueTasks' => $overdueTasks->map(fn ($task) => $this->taskData($task))->all(),
            'summary' => [
                'total' => $tasks->count(),
                'completed' => $tasks->whereNotNull('completed_at')->count(),
                'remaining' => $tasks->whereNull('completed_at')->count(),
            ],
            'settings' => [
                'theme' => $settings->theme_key,
                'language' => $settings->language,
                'navigationPosition' => $settings->navigation_position,
                'timezone' => $timezone,
            ],
        ]);
    }

    private function selectedChunkId(Request $request, $chunks, string $timezone): ?int
    {
        $requested = $request->query('chunk');
        if ($requested !== null) {
            $requestedId = filter_var($requested, FILTER_VALIDATE_INT);
            if ($requestedId && $chunks->contains('id', $requestedId)) {
                return (int) $requestedId;
            }
        }

        $now = CarbonImmutable::now($timezone)->format('H:i');
        foreach ($chunks as $chunk) {
            if ($chunk['startTime'] && $chunk['endTime'] && $this->timeIsInChunk($now, $chunk['startTime'], $chunk['endTime'])) {
                return $chunk['id'];
            }
        }

        return $chunks->first()['id'] ?? null;
    }

    private function timeIsInChunk(string $now, string $start, string $end): bool
    {
        if ($start <= $end) {
            return $now >= $start && $now < $end;
        }

        return $now >= $start || $now < $end;
    }

    private function taskData($task): array
    {
        return [
            'id' => $task->id,
            'title' => $task->title,
            'description' => $task->description,
            'plannedDate' => $task->planned_date->toDateString(),
            'chunkId' => $task->chunk?->trashed() ? null : $task->chunk_id,
            'chunkName' => $task->chunk?->trashed()
                ? $task->chunk_name_snapshot
                : ($task->chunk?->name ?? $task->chunk_name_snapshot),
            'priority' => $task->priority,
            'completedAt' => $task->completed_at?->toISOString(),
        ];
    }
}
