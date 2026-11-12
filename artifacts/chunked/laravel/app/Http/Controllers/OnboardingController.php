<?php

namespace App\Http\Controllers;

use App\Models\Chunk;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class OnboardingController extends Controller
{
    private const TEMPLATES = [
        'time_of_day' => [
            ['name' => 'Morning'],
            ['name' => 'Afternoon'],
            ['name' => 'Evening'],
        ],
        'prayer' => [
            ['name' => 'Fajr'],
            ['name' => 'Dhuhr'],
            ['name' => 'Asr'],
            ['name' => 'Maghrib'],
            ['name' => 'Isha'],
        ],
        'school' => [
            ['name' => 'Before school'],
            ['name' => 'School'],
            ['name' => 'After school'],
            ['name' => 'Evening'],
        ],
        'university' => [
            ['name' => 'Morning classes'],
            ['name' => 'Afternoon classes'],
            ['name' => 'Study time'],
            ['name' => 'Evening'],
        ],
        'work' => [
            ['name' => 'Morning block', 'start_time' => '08:00', 'end_time' => '12:00'],
            ['name' => 'Midday break', 'start_time' => '12:00', 'end_time' => '13:00'],
            ['name' => 'Afternoon block', 'start_time' => '13:00', 'end_time' => '17:00'],
            ['name' => 'Evening', 'start_time' => '17:00', 'end_time' => '22:00'],
        ],
        'custom' => [
            ['name' => 'Morning'],
            ['name' => 'Afternoon'],
            ['name' => 'Evening'],
        ],
    ];

    public function index(Request $request): Response
    {
        $structure = $request->user()->dayStructure()
            ->with(['chunks' => fn ($query) => $query->orderBy('sort_order')])
            ->first();
        $settings = $request->user()->settings;
        $activeChunks = $structure?->chunks ?? collect();
        $chunkById = $activeChunks->keyBy('id');
        $affectedTasks = $chunkById->isEmpty()
            ? []
            : $request->user()->tasks()
                ->whereIn('chunk_id', $chunkById->keys())
                ->with('chunk')
                ->orderBy('planned_date')
                ->orderBy('sort_order')
                ->get()
                ->map(fn ($task) => [
                    'id' => $task->id,
                    'title' => $task->title,
                    'plannedDate' => $task->planned_date->toDateString(),
                    'chunkName' => $task->chunk?->name ?? $task->chunk_name_snapshot,
                    'chunkStartTime' => $task->chunk?->start_time ? substr((string) $task->chunk->start_time, 0, 5) : null,
                    'chunkEndTime' => $task->chunk?->end_time ? substr((string) $task->chunk->end_time, 0, 5) : null,
                    'priority' => $task->priority,
                    'completed' => $task->completed_at !== null,
                ])
                ->all();

        return Inertia::render('App', [
            'current' => $structure ? [
                'type' => $structure->type === 'time_of_day' ? 'day' : $structure->type,
                'name' => $structure->name,
                'chunks' => $structure->chunks->map(fn (Chunk $chunk) => [
                    'id' => $chunk->id,
                    'name' => $chunk->name,
                    'startTime' => $chunk->start_time ? substr((string) $chunk->start_time, 0, 5) : null,
                    'endTime' => $chunk->end_time ? substr((string) $chunk->end_time, 0, 5) : null,
                ])->all(),
            ] : null,
            'settings' => [
                'theme' => $settings?->theme_key ?? 'light',
                'language' => $settings?->language ?? 'en',
                'navigationPosition' => $settings?->navigation_position ?? 'sidebar',
                'timezone' => $settings?->timezone ?? 'Asia/Amman',
            ],
            'affectedTasks' => $affectedTasks,
            'themes' => [
                ['key' => 'soft-sage', 'name' => 'Soft sage'],
                ['key' => 'warm-sunrise', 'name' => 'Warm sunrise'],
                ['key' => 'quiet-lavender', 'name' => 'Quiet lavender'],
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'type' => ['required', 'in:day,time_of_day,prayer,school,university,work,custom'],
            'name' => ['nullable', 'string', 'max:100'],
            'chunks' => ['nullable', 'array', 'max:12'],
            'chunks.*' => ['required', 'string', 'max:120'],
            'chunkTimes' => ['nullable', 'array', 'max:12'],
            'chunkTimes.*.startTime' => ['nullable', 'date_format:H:i'],
            'chunkTimes.*.endTime' => ['nullable', 'date_format:H:i'],
            'taskAction' => ['nullable', 'in:delete,move_by_time'],
            'settings' => ['nullable', 'array'],
            'settings.theme' => ['nullable', 'in:light,dark,system'],
            'settings.language' => ['nullable', 'in:en,ar'],
            'settings.navigationPosition' => ['nullable', 'in:sidebar,top'],
        ]);

        $type = $validated['type'] === 'day' ? 'time_of_day' : $validated['type'];
        $templateChunks = self::TEMPLATES[$type] ?? [];
        $providedTimes = $validated['chunkTimes'] ?? [];
        $chunks = array_map(function ($name, $index) use ($templateChunks, $providedTimes) {
            $times = $providedTimes[$index] ?? [];

            return [
                'name' => $name,
                'start_time' => array_key_exists('startTime', $times) ? $times['startTime'] : ($templateChunks[$index]['start_time'] ?? null),
                'end_time' => array_key_exists('endTime', $times) ? $times['endTime'] : ($templateChunks[$index]['end_time'] ?? null),
            ];
        }, $validated['chunks'] ?? [], array_keys($validated['chunks'] ?? []));
        if ($type === 'custom' && count($chunks) === 0) {
            return back()->withErrors(['chunks' => 'Add at least one part to your day.']);
        }
        if (count($chunks) === 0) {
            $chunks = self::TEMPLATES[$type];
        }

        $taskOutcome = DB::transaction(function () use ($request, $validated, $chunks, $type) {
            $user = $request->user();
            $structure = $user->dayStructure()->first();
            $structureAttributes = [
                'type' => $type,
                'name' => $validated['name'] ?: $this->templateName($type),
            ];

            if ($structure) {
                $structure->update($structureAttributes);
            } else {
                $structure = $user->dayStructure()->create($structureAttributes);
            }

            $activeChunks = $structure->chunks()->orderBy('sort_order')->lockForUpdate()->get();
            $chunksChanged = $this->chunkConfigurationChanged($activeChunks, $chunks);
            $taskAction = $validated['taskAction'] ?? null;
            $affectedTasks = $chunksChanged && $activeChunks->isNotEmpty()
                ? $user->tasks()
                    ->whereIn('chunk_id', $activeChunks->modelKeys())
                    ->with('chunk')
                    ->lockForUpdate()
                    ->get()
                : collect();

            if ($affectedTasks->isNotEmpty() && ! in_array($taskAction, ['delete', 'move_by_time'], true)) {
                throw ValidationException::withMessages([
                    'taskAction' => 'Choose whether to delete affected tasks or move them by time before changing your rhythm.',
                ]);
            }

            $outcome = [
                'action' => $taskAction,
                'affected' => $affectedTasks->count(),
                'moved' => 0,
                'unassigned' => 0,
                'deleted' => 0,
            ];

            if ($chunksChanged) {
                $oldChunksById = $activeChunks->keyBy('id');
                if ($taskAction === 'delete') {
                    $affectedTasks->each(fn ($task) => $task->delete());
                    $outcome['deleted'] = $affectedTasks->count();
                }

                $activeChunks->each->delete();
                $newChunks = collect();
                foreach (array_values($chunks) as $index => $chunk) {
                    $newChunks->push($structure->chunks()->create([
                        'name' => trim($chunk['name']),
                        'start_time' => $chunk['start_time'] ?? null,
                        'end_time' => $chunk['end_time'] ?? null,
                        'sort_order' => $index,
                    ]));
                }

                if ($taskAction === 'move_by_time') {
                    foreach ($affectedTasks as $task) {
                        $oldChunk = $oldChunksById->get($task->chunk_id);
                        $newChunk = $this->bestTimeMatch($oldChunk, $newChunks);
                        $task->update([
                            'chunk_id' => $newChunk?->id,
                            'chunk_name_snapshot' => $newChunk?->name ?? $oldChunk?->name ?? $task->chunk_name_snapshot,
                        ]);
                        $outcome[$newChunk ? 'moved' : 'unassigned']++;
                    }
                }
            }

            $uiSettings = $validated['settings'] ?? [];
            $user->settings()->updateOrCreate([], [
                'theme_key' => $uiSettings['theme'] ?? 'light',
                'language' => $uiSettings['language'] ?? 'en',
                'navigation_position' => $uiSettings['navigationPosition'] ?? 'sidebar',
                'onboarded_at' => now(),
            ]);

            return $outcome;
        });

        $message = 'Your day is ready. You can change it any time.';
        if ($taskOutcome['deleted'] > 0) {
            $message = "Your rhythm is updated. {$taskOutcome['deleted']} tasks were deleted.";
        } elseif ($taskOutcome['action'] === 'move_by_time' && $taskOutcome['affected'] > 0) {
            $message = "Your rhythm is updated. {$taskOutcome['moved']} tasks moved by time; {$taskOutcome['unassigned']} stayed unassigned because there was no clear time match.";
        }

        return redirect()->route('day.index')->with('success', $message);
    }

    public function skip(Request $request): RedirectResponse
    {
        return $this->store($request->merge([
            'type' => 'day',
            'name' => 'A gentle day',
            'chunks' => ['Morning', 'Afternoon', 'Evening'],
            'settings' => [
                'theme' => 'light',
                'language' => 'en',
                'navigationPosition' => 'sidebar',
            ],
        ]));
    }

    private function templateName(string $type): string
    {
        return match ($type) {
            'time_of_day' => 'Morning, afternoon, evening',
            'prayer' => 'Prayer times',
            'school' => 'School day',
            'university' => 'University day',
            'work' => 'Work day',
            default => 'My custom day',
        };
    }

    private function chunkConfigurationChanged($activeChunks, array $newChunks): bool
    {
        if ($activeChunks->count() !== count($newChunks)) {
            return true;
        }

        foreach ($activeChunks->values() as $index => $activeChunk) {
            $newChunk = $newChunks[$index] ?? null;
            if (
                $newChunk === null
                || $activeChunk->name !== trim($newChunk['name'])
                || $this->normalizeTime($activeChunk->start_time) !== $this->normalizeTime($newChunk['start_time'] ?? null)
                || $this->normalizeTime($activeChunk->end_time) !== $this->normalizeTime($newChunk['end_time'] ?? null)
            ) {
                return true;
            }
        }

        return false;
    }

    private function bestTimeMatch(?Chunk $oldChunk, $newChunks): ?Chunk
    {
        if (! $oldChunk || ! $oldChunk->start_time || ! $oldChunk->end_time) {
            return null;
        }

        $bestChunk = null;
        $bestOverlap = 0;
        $tied = false;

        foreach ($newChunks as $newChunk) {
            if (! $newChunk->start_time || ! $newChunk->end_time) {
                continue;
            }

            $overlap = $this->overlapMinutes(
                (string) $oldChunk->start_time,
                (string) $oldChunk->end_time,
                (string) $newChunk->start_time,
                (string) $newChunk->end_time,
            );

            if ($overlap > $bestOverlap) {
                $bestChunk = $newChunk;
                $bestOverlap = $overlap;
                $tied = false;
            } elseif ($overlap > 0 && $overlap === $bestOverlap) {
                $tied = true;
            }
        }

        return $bestOverlap > 0 && ! $tied ? $bestChunk : null;
    }

    private function overlapMinutes(string $firstStart, string $firstEnd, string $secondStart, string $secondEnd): int
    {
        $firstSegments = $this->timeSegments($firstStart, $firstEnd);
        $secondSegments = $this->timeSegments($secondStart, $secondEnd);
        $overlap = 0;

        foreach ($firstSegments as [$firstSegmentStart, $firstSegmentEnd]) {
            foreach ($secondSegments as [$secondSegmentStart, $secondSegmentEnd]) {
                $overlap += max(0, min($firstSegmentEnd, $secondSegmentEnd) - max($firstSegmentStart, $secondSegmentStart));
            }
        }

        return $overlap;
    }

    private function timeSegments(string $start, string $end): array
    {
        $start = $this->minutesAfterMidnight($start);
        $end = $this->minutesAfterMidnight($end);

        if ($start === $end) {
            return [];
        }

        return $end > $start
            ? [[$start, $end]]
            : [[$start, 1440], [0, $end]];
    }

    private function minutesAfterMidnight(string $time): int
    {
        [$hours, $minutes] = array_map('intval', explode(':', substr($time, 0, 5)));

        return ($hours * 60) + $minutes;
    }

    private function normalizeTime(?string $time): ?string
    {
        return $time ? substr($time, 0, 5) : null;
    }
}
