<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use App\Services\FocusPlanService;
use Inertia\Inertia;
use Inertia\Response;

class SettingsController extends Controller
{
    public function show(Request $request, FocusPlanService $focusPlans): Response
    {
        $settings = $request->user()->settings()->firstOrCreate([]);
        $structure = $request->user()->dayStructure()->with('chunks')->first();

        return Inertia::render('App', [
            'settings' => [
                'theme' => $settings->theme_key,
                'language' => $settings->language,
                'navigationPosition' => $settings->navigation_position,
                'timezone' => $settings->timezone,
            ],
            'structure' => $structure ? [
                'type' => $structure->type === 'time_of_day' ? 'day' : $structure->type,
                'name' => $structure->name,
            ] : null,
            'chunks' => $structure?->chunks->map(fn ($chunk) => [
                'id' => $chunk->id,
                'name' => $chunk->name,
                'startTime' => $chunk->start_time ? substr((string) $chunk->start_time, 0, 5) : null,
                'endTime' => $chunk->end_time ? substr((string) $chunk->end_time, 0, 5) : null,
                'sortOrder' => $chunk->sort_order,
            ])->values() ?? [],
            'today' => now($settings->timezone ?: 'Asia/Amman')->toDateString(),
            'activeFocusTimer' => $focusPlans->activeSummary($request->user()),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'theme' => ['required', 'in:light,dark,system'],
            'language' => ['required', 'in:en,ar'],
            'navigationPosition' => ['required', 'in:sidebar,top'],
        ]);

        $request->user()->settings()->updateOrCreate([], [
            'theme_key' => $validated['theme'],
            'language' => $validated['language'],
            'navigation_position' => $validated['navigationPosition'],
        ]);

        return back()->with('success', 'Preferences saved.');
    }
}
