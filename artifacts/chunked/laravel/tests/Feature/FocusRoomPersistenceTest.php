<?php

namespace Tests\Feature;

use App\Models\TaskChecklistItem;
use App\Models\User;
use App\Services\FocusPlanService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class FocusRoomPersistenceTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_checklist_items_are_scoped_to_the_parent_task_and_user(): void
    {
        $user = User::factory()->create();
        $task = $user->tasks()->create([
            'title' => 'Read a chapter',
            'planned_date' => '2026-11-13',
            'priority' => 'medium',
            'sort_order' => 0,
        ]);

        $this->actingAs($user)
            ->post(route('tasks.checklist-items.store', $task->id), ['title' => 'Read five pages'])
            ->assertRedirect();

        $item = TaskChecklistItem::query()->where('task_id', $task->id)->firstOrFail();
        $this->assertSame($user->id, $item->user_id);

        $otherUser = User::factory()->create();
        $this->actingAs($otherUser)
            ->patch(route('tasks.checklist-items.update', [$task->id, $item->id]), ['completed' => true])
            ->assertNotFound();

        $this->actingAs($user)
            ->patch(route('tasks.checklist-items.update', [$task->id, $item->id]), ['completed' => true])
            ->assertRedirect();

        $this->assertNotNull($item->fresh()->completed_at);
        $this->assertNull($task->fresh()->completed_at);
    }

    public function test_reset_abandons_a_focus_session_without_counting_it(): void
    {
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-13 10:00:00', 'UTC'));
        [$user, $chunk] = $this->makeChunk('12:00');
        $service = app(FocusPlanService::class);
        $plan = $service->findOrCreate($user, '2026-11-13', $chunk, $service->chunkEndAt($chunk, '2026-11-13', 'UTC'));
        $plan = $service->updateSettings($plan, [
            'focus_minutes' => 25,
            'break_minutes' => 5,
            'planned_sessions' => 2,
            'transition_mode' => 'manual',
        ]);
        $plan = $service->start($plan, 'focus');

        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-13 10:02:00', 'UTC'));
        $plan = $service->reset($plan);

        $this->assertSame('ready', $plan->status);
        $this->assertSame(0, $plan->completed_sessions);
        $this->assertSame('abandoned', $plan->sessions()->firstOrFail()->status);
        $this->assertNull($plan->sessions()->firstOrFail()->counted_at);
    }

    public function test_resume_excludes_paused_time_from_the_focused_total(): void
    {
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-13 10:00:00', 'UTC'));
        [$user, $chunk] = $this->makeChunk('12:00');
        $service = app(FocusPlanService::class);
        $plan = $service->findOrCreate($user, '2026-11-13', $chunk, $service->chunkEndAt($chunk, '2026-11-13', 'UTC'));
        $plan = $service->updateSettings($plan, [
            'focus_minutes' => 25,
            'break_minutes' => 5,
            'planned_sessions' => 1,
            'transition_mode' => 'manual',
        ]);
        $plan = $service->start($plan, 'focus');

        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-13 10:02:00', 'UTC'));
        $plan = $service->pause($plan);
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-13 10:12:00', 'UTC'));
        $plan = $service->resume($plan);
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-13 10:15:00', 'UTC'));
        $plan = $service->finish($plan);

        $session = $plan->sessions()->firstOrFail();
        $this->assertSame('completed', $session->status);
        $this->assertSame(300, $session->focused_seconds);
        $this->assertSame(1, $plan->completed_sessions);
    }

    public function test_a_paused_focus_session_becomes_partial_at_the_chunk_boundary(): void
    {
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-13 10:00:00', 'UTC'));
        [$user, $chunk] = $this->makeChunk('10:30');
        $service = app(FocusPlanService::class);
        $plan = $service->findOrCreate($user, '2026-11-13', $chunk, $service->chunkEndAt($chunk, '2026-11-13', 'UTC'));
        $plan = $service->updateSettings($plan, [
            'focus_minutes' => 25,
            'break_minutes' => 5,
            'planned_sessions' => 2,
            'transition_mode' => 'automatic',
        ]);
        $plan = $service->start($plan, 'focus');

        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-13 10:05:00', 'UTC'));
        $plan = $service->pause($plan);

        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-13 10:30:00', 'UTC'));
        $plan = $service->sync($plan);
        $session = $plan->sessions()->firstOrFail();

        $this->assertSame('boundary', $plan->status);
        $this->assertSame('partial', $session->status);
        $this->assertSame(300, $session->focused_seconds);
        $this->assertNull($session->counted_at);
        $this->assertSame(0, $plan->completed_sessions);
        $this->assertTrue($service->state($plan)['partialSession']);
    }

    public function test_finishing_a_session_is_counted_once(): void
    {
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-13 10:00:00', 'UTC'));
        [$user, $chunk] = $this->makeChunk('12:00');
        $service = app(FocusPlanService::class);
        $plan = $service->findOrCreate($user, '2026-11-13', $chunk, $service->chunkEndAt($chunk, '2026-11-13', 'UTC'));
        $plan = $service->updateSettings($plan, [
            'focus_minutes' => 25,
            'break_minutes' => 5,
            'planned_sessions' => 1,
            'transition_mode' => 'manual',
        ]);
        $plan = $service->start($plan, 'focus');

        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-13 10:03:00', 'UTC'));
        $plan = $service->finish($plan);
        $plan = $service->finish($plan);

        $this->assertSame(1, $plan->completed_sessions);
        $this->assertSame(1, $plan->sessions()->where('status', 'completed')->whereNotNull('counted_at')->count());
        $this->assertSame(180, $plan->sessions()->firstOrFail()->focused_seconds);
    }

    public function test_a_focus_session_cannot_start_if_it_will_not_fit_before_chunk_end(): void
    {
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-13 10:00:00', 'UTC'));
        [$user, $chunk] = $this->makeChunk('10:20');
        $service = app(FocusPlanService::class);
        $plan = $service->findOrCreate($user, '2026-11-13', $chunk, $service->chunkEndAt($chunk, '2026-11-13', 'UTC'));
        $plan = $service->updateSettings($plan, [
            'focus_minutes' => 25,
            'break_minutes' => 5,
            'planned_sessions' => 1,
            'transition_mode' => 'manual',
        ]);

        $this->actingAs($user)
            ->from(route('focus.index', ['date' => '2026-11-13', 'chunk' => $chunk->id]))
            ->post(route('focus.plans.action', $plan->id), ['action' => 'start', 'phase' => 'focus'])
            ->assertRedirect()
            ->assertSessionHasErrors('timer');

        $this->assertDatabaseCount('focus_sessions', 0);
    }

    public function test_an_unscheduled_chunk_allows_focus_sessions_up_to_three_hours(): void
    {
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-13 10:00:00', 'UTC'));
        [$user, $chunk] = $this->makeChunk(null);
        $service = app(FocusPlanService::class);
        $plan = $service->findOrCreate($user, '2026-11-13', $chunk, null);
        $plan = $service->updateSettings($plan, [
            'focus_minutes' => 180,
            'break_minutes' => 0,
            'planned_sessions' => 1,
            'transition_mode' => 'manual',
        ]);
        $state = $service->state($plan);

        $this->assertNull($state['chunkEndsAt']);
        $this->assertSame(180, $state['maxFocusMinutes']);
        $this->assertFalse($state['planExceedsChunk']);

        $plan = $service->start($plan, 'focus');
        $this->assertSame('running', $plan->status);
        $this->assertSame(180, $plan->focus_minutes);
    }

    public function test_active_focus_timer_is_available_to_the_day_shell(): void
    {
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-13 10:00:00', 'UTC'));
        [$user, $chunk] = $this->makeChunk('12:00');
        $user->settings()->create([
            'timezone' => 'UTC',
            'onboarded_at' => now(),
        ]);
        $service = app(FocusPlanService::class);
        $plan = $service->findOrCreate($user, '2026-11-13', $chunk, $service->chunkEndAt($chunk, '2026-11-13', 'UTC'));
        $plan = $service->start($plan, 'focus');

        $this->actingAs($user)
            ->get(route('day.index', ['date' => '2026-11-13']))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('activeFocusTimer.status', 'running')
                ->where('activeFocusTimer.chunkName', 'Morning')
                ->where('activeFocusTimer.planId', $plan->id)
                ->where('activeFocusTimer.url', '/focus?date=2026-11-13&chunk='.$chunk->id)
            );
    }

    public function test_chunk_transition_waits_until_open_tasks_are_moved_or_removed(): void
    {
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-13 10:00:00', 'UTC'));
        [$user, $morning] = $this->makeChunk('10:02');
        $afternoon = $morning->dayStructure->chunks()->create([
            'name' => 'Afternoon',
            'start_time' => '10:02',
            'end_time' => '12:00',
            'sort_order' => 1,
        ]);
        $task = $user->tasks()->create([
            'chunk_id' => $morning->id,
            'chunk_name_snapshot' => $morning->name,
            'title' => 'Finish the notes',
            'planned_date' => '2026-11-13',
            'priority' => 'medium',
            'sort_order' => 0,
        ]);

        $service = app(FocusPlanService::class);
        $plan = $service->findOrCreate($user, '2026-11-13', $morning, $service->chunkEndAt($morning, '2026-11-13', 'UTC'));
        $plan = $service->updateSettings($plan, [
            'focus_minutes' => 1,
            'break_minutes' => 0,
            'planned_sessions' => 2,
            'transition_mode' => 'automatic',
        ]);
        $plan = $service->start($plan, 'focus');

        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-13 10:02:00', 'UTC'));
        $plan = $service->sync($plan);
        $this->assertSame('boundary', $plan->status);
        $this->assertSame(2, $plan->completed_sessions);
        $this->assertSame(2, $plan->sessions()->count());
        $this->assertSame([$morning->id, $morning->id], $plan->sessions()->orderBy('session_number')->pluck('chunk_id')->all());

        $this->actingAs($user)
            ->from(route('focus.index', ['date' => '2026-11-13', 'chunk' => $morning->id]))
            ->post(route('focus.plans.switch-chunk', $plan->id), [
                'chunk_id' => $afternoon->id,
                'date' => '2026-11-13',
            ])
            ->assertRedirect()
            ->assertSessionHasErrors('tasks');

        $this->actingAs($user)
            ->patch(route('tasks.update', $task->id), [
                'plannedDate' => '2026-11-13',
                'chunkId' => $afternoon->id,
            ])
            ->assertRedirect();

        $this->actingAs($user)
            ->post(route('focus.plans.switch-chunk', $plan->id), [
                'chunk_id' => $afternoon->id,
                'date' => '2026-11-13',
            ])
            ->assertRedirect(route('focus.index', ['date' => '2026-11-13', 'chunk' => $afternoon->id]));

        $plan->refresh();
        $this->assertSame($afternoon->id, $plan->current_chunk_id);
        $this->assertSame('ready', $plan->status);
    }

    /**
     * @return array{0: User, 1: \App\Models\Chunk}
     */
    private function makeChunk(?string $endTime): array
    {
        $user = User::factory()->create();
        $structure = $user->dayStructure()->create([
            'type' => 'day',
            'name' => 'A gentle day',
        ]);
        $chunk = $structure->chunks()->create([
            'name' => 'Morning',
            'start_time' => '08:00',
            'end_time' => $endTime,
            'sort_order' => 0,
        ]);

        return [$user, $chunk];
    }
}
