<?php

namespace App\Http\Controllers;

use App\Models\Chunk;
use Carbon\CarbonImmutable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Inertia\Inertia;
use Inertia\Response;

class FocusController extends Controller
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

        $chunks = $structure->chunks->values();
        $chunk = $this->selectedChunk($request, $chunks, $timezone);
        if (! $chunk) {
            return redirect()->route('day.index', ['date' => $date]);
        }

        $tasks = $user->tasks()
            ->whereDate('planned_date', $date)
            ->where('chunk_id', $chunk->id)
            ->with('chunk')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

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
