<?php

namespace Tests\Feature;

use App\Models\FocusPlan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class FocusHistoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_focus_history_summarizes_actual_time_by_day_and_chunk(): void
    {
        $user = User::factory()->create();
        $user->settings()->create(['timezone' => 'UTC', 'onboarded_at' => now()]);
        $structure = $user->dayStructure()->create(['type' => 'day', 'name' => 'A gentle day']);
        $morning = $structure->chunks()->create([
            'name' => 'Morning',
            'start_time' => null,
            'end_time' => null,
            'sort_order' => 0,
        ]);
        $evening = $structure->chunks()->create([
            'name' => 'Evening',
            'start_time' => null,
            'end_time' => null,
            'sort_order' => 1,
        ]);
        $date = now('UTC')->toDateString();
        $plan = $user->focusPlans()->create([
            'uuid' => (string) Str::uuid(),
            'planned_date' => $date,
            'current_chunk_id' => $morning->id,
            'current_chunk_name_snapshot' => $morning->name,
            'focus_minutes' => 25,
            'break_minutes' => 5,
            'planned_sessions' => 3,
            'transition_mode' => 'manual',
            'phase' => 'focus',
            'status' => 'ready',
            'phase_remaining_seconds' => 1500,
        ]);

        foreach ([
            [$morning, 'completed', 600, 'A pause helped'],
            [$morning, 'partial', 120, null],
            [$evening, 'abandoned', 0, null],
        ] as [$chunk, $status, $focusedSeconds, $contextNote]) {
            $plan->sessions()->create([
                'session_key' => (string) Str::uuid(),
                'user_id' => $user->id,
                'chunk_id' => $chunk->id,
                'chunk_name_snapshot' => $chunk->name,
                'planned_date' => $date,
                'session_number' => 1,
                'status' => $status,
                'planned_seconds' => 1500,
                'focused_seconds' => $focusedSeconds,
                'remaining_seconds' => 1500 - $focusedSeconds,
                'context_note' => $contextNote,
                'started_at' => now('UTC')->subMinutes(30),
                'ended_at' => now('UTC')->subMinutes(20),
            ]);
        }

        $this->actingAs($user)
            ->get(route('focus.index', ['date' => $date, 'chunk' => $morning->id]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->has('focusHistory', 1)
                ->where('focusHistory.0.date', $date)
                ->where('focusHistory.0.focusedSeconds', 720)
                ->has('focusHistory.0.chunks', 2)
                ->where('focusHistory.0.chunks.0.chunkName', 'Evening')
                ->where('focusHistory.0.chunks.1.chunkName', 'Morning')
                ->where('focusHistory.0.chunks.1.focusedSeconds', 720)
                ->where('focusHistory.0.chunks.1.sessions.0.contextNote', 'A pause helped')
                ->where('focusHistory.0.chunks.1.sessions.0.status', 'completed')
                ->where('focusHistory.0.chunks.1.sessions.1.status', 'partial')
            );
    }

    public function test_users_can_save_or_clear_context_only_on_their_own_focus_sessions(): void
    {
        [$user, $session] = $this->makeSession();

        $this->actingAs($user)
            ->patch(route('focus.sessions.context', $session->id), ['context_note' => 'A short interruption'])
            ->assertRedirect();
        $this->assertSame('A short interruption', $session->fresh()->context_note);

        $this->actingAs($user)
            ->patch(route('focus.sessions.context', $session->id), ['context_note' => ''])
            ->assertRedirect();
        $this->assertNull($session->fresh()->context_note);

        $otherUser = User::factory()->create();
        $this->actingAs($otherUser)
            ->patch(route('focus.sessions.context', $session->id), ['context_note' => 'Not mine'])
            ->assertNotFound();

        $this->actingAs($user)
            ->patch(route('focus.sessions.context', $session->id), ['context_note' => str_repeat('a', 501)])
            ->assertSessionHasErrors('context_note');
    }

    /**
     * @return array{0: User, 1: \App\Models\FocusSession}
     */
    private function makeSession(): array
    {
        $user = User::factory()->create();
        $structure = $user->dayStructure()->create(['type' => 'day', 'name' => 'A gentle day']);
        $chunk = $structure->chunks()->create([
            'name' => 'Morning',
            'start_time' => null,
            'end_time' => null,
            'sort_order' => 0,
        ]);
        $plan = $user->focusPlans()->create([
            'uuid' => (string) Str::uuid(),
            'planned_date' => now()->toDateString(),
            'current_chunk_id' => $chunk->id,
            'current_chunk_name_snapshot' => $chunk->name,
            'focus_minutes' => 25,
            'break_minutes' => 5,
            'planned_sessions' => 1,
            'transition_mode' => 'manual',
            'phase' => 'focus',
            'status' => 'ready',
            'phase_remaining_seconds' => 1500,
        ]);
        $session = $plan->sessions()->create([
            'session_key' => (string) Str::uuid(),
            'user_id' => $user->id,
            'chunk_id' => $chunk->id,
            'chunk_name_snapshot' => $chunk->name,
            'planned_date' => now()->toDateString(),
            'session_number' => 1,
            'status' => 'partial',
            'planned_seconds' => 1500,
            'focused_seconds' => 300,
            'remaining_seconds' => 1200,
            'started_at' => now()->subMinutes(10),
        ]);

        return [$user, $session];
    }
}
