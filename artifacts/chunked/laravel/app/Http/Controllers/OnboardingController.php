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
            'taskDecisions' => ['nullable', 'array', 'max:500'],
            'taskDecisions.*.taskId' => ['required', 'integer', 'distinct'],
            'taskDecisions.*.action' => ['required', 'in:move,unassigned,delete'],
            'taskDecisions.*.chunkIndex' => ['nullable', 'integer', 'min:0', 'max:11'],
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
            $affectedTasks = $chunksChanged && $activeChunks->isNotEmpty()
                ? $user->tasks()
                    ->whereIn('chunk_id', $activeChunks->modelKeys())
                    ->with('chunk')
                    ->lockForUpdate()
                    ->get()
                : collect();
            $decisions = collect($validated['taskDecisions'] ?? [])
                ->keyBy(fn ($decision) => (int) $decision['taskId']);

            if ($affectedTasks->isNotEmpty()) {
                $expectedTaskIds = $affectedTasks->modelKeys();
                $submittedTaskIds = $decisions->keys()->map(fn ($id) => (int) $id)->all();
                sort($expectedTaskIds);
                sort($submittedTaskIds);
                $hasInvalidDestination = $decisions->contains(fn ($decision) => (
                    $decision['action'] === 'move'
                    && (
                        ! isset($decision['chunkIndex'])
                        || $decision['chunkIndex'] >= count($chunks)
                    )
                ));

                if ($expectedTaskIds !== $submittedTaskIds || $hasInvalidDestination) {
                throw ValidationException::withMessages([
                        'taskDecisions' => 'Choose an action and destination for every affected task before changing your rhythm.',
                ]);
                }
            }

            $outcome = [
                'affected' => $affectedTasks->count(),
                'moved' => 0,
                'unassigned' => 0,
                'deleted' => 0,
            ];

            if ($chunksChanged) {
                $oldChunksById = $activeChunks->keyBy('id');
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

                foreach ($affectedTasks as $task) {
                    $decision = $decisions->get((int) $task->id);
                    $oldChunk = $oldChunksById->get($task->chunk_id);

                    if ($decision['action'] === 'delete') {
                        $task->delete();
                        $outcome['deleted']++;
                    } elseif ($decision['action'] === 'unassigned') {
                        $task->update([
                            'chunk_id' => null,
                            'chunk_name_snapshot' => $oldChunk?->name ?? $task->chunk_name_snapshot,
                        ]);
                        $outcome['unassigned']++;
                    } else {
                        $newChunk = $newChunks->get((int) $decision['chunkIndex']);
                        $task->update([
                            'chunk_id' => $newChunk->id,
                            'chunk_name_snapshot' => $newChunk->name,
                        ]);
                        $outcome['moved']++;
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
        if ($taskOutcome['affected'] > 0) {
            $message = "Rhythm updated: {$taskOutcome['moved']} moved, {$taskOutcome['deleted']} deleted, and {$taskOutcome['unassigned']} left unassigned.";
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

    private function normalizeTime(?string $time): ?string
    {
        return $time ? substr($time, 0, 5) : null;
    }
}
