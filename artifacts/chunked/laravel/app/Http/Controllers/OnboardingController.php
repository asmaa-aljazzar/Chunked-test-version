<?php

namespace App\Http\Controllers;

use App\Models\Chunk;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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

        DB::transaction(function () use ($request, $validated, $chunks, $type) {
            $user = $request->user();
            $structure = $user->dayStructure()->updateOrCreate([], [
                'type' => $type,
                'name' => $validated['name'] ?: $this->templateName($type),
            ]);

            $structure->chunks()->whereNull('deleted_at')->get()->each->delete();
            foreach (array_values($chunks) as $index => $chunk) {
                $structure->chunks()->create([
                    'name' => trim($chunk['name']),
                    'start_time' => $chunk['start_time'] ?? null,
                    'end_time' => $chunk['end_time'] ?? null,
                    'sort_order' => $index,
                ]);
            }

            $uiSettings = $validated['settings'] ?? [];
            $user->settings()->updateOrCreate([], [
                'theme_key' => $uiSettings['theme'] ?? 'light',
                'language' => $uiSettings['language'] ?? 'en',
                'navigation_position' => $uiSettings['navigationPosition'] ?? 'sidebar',
                'onboarded_at' => now(),
            ]);
        });

        return redirect()->route('day.index')->with('success', 'Your day is ready. You can change it any time.');
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
}
