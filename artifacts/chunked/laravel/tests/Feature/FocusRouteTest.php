<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;
use Database\Seeders\FocusMediaAssetSeeder;

class FocusRouteTest extends TestCase
{
    use RefreshDatabase;

    public function test_focus_route_opens_the_selected_chunk_and_only_its_tasks(): void
    {
        $this->seed(FocusMediaAssetSeeder::class);

        $user = User::factory()->create();
        $user->settings()->create([
            'timezone' => 'UTC',
            'onboarded_at' => now(),
        ]);
        $structure = $user->dayStructure()->create([
            'type' => 'day',
            'name' => 'A gentle day',
        ]);
        $morning = $structure->chunks()->create([
            'name' => 'Morning',
            'start_time' => '08:00',
            'end_time' => '12:00',
            'sort_order' => 0,
        ]);
        $evening = $structure->chunks()->create([
            'name' => 'Evening',
            'start_time' => '17:00',
            'end_time' => '21:00',
            'sort_order' => 1,
        ]);

        $user->tasks()->create([
            'chunk_id' => $morning->id,
            'chunk_name_snapshot' => 'Morning',
            'title' => 'Read one chapter',
            'planned_date' => '2026-11-13',
            'priority' => 'medium',
            'sort_order' => 0,
        ]);
        $user->tasks()->create([
            'chunk_id' => $evening->id,
            'chunk_name_snapshot' => 'Evening',
            'title' => 'Water the plants',
            'planned_date' => '2026-11-13',
            'priority' => 'low',
            'sort_order' => 0,
        ]);

        $this->actingAs($user)
            ->get(route('focus.index', ['date' => '2026-11-13', 'chunk' => $morning->id]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('App', false)
                ->where('date', '2026-11-13')
                ->where('chunk.id', $morning->id)
                ->where('chunk.name', 'Morning')
                ->where('chunk.startTime', '08:00')
                ->has('tasks', 1)
                ->where('tasks.0.title', 'Read one chapter')
                 ->has('mediaCatalog', 2)
                 ->where('mediaCatalog.0.kind', 'audio')
                 ->where('mediaCatalog.0.url', url('/api/storage/public-objects/focus-media/magical-moments.mp3'))
                 ->where('mediaCatalog.1.kind', 'video')
                 ->where('mediaCatalog.1.url', url('/api/storage/public-objects/focus-media/teto-miku-halloween.mp4'))
                ->where('routes.focus', '/focus')
            );
    }

    public function test_focus_route_requires_authentication(): void
    {
        $this->get(route('focus.index'))->assertRedirect(route('login'));
    }

    public function test_task_completion_from_the_focus_flow_persists(): void
    {
        $user = User::factory()->create();
        $task = $user->tasks()->create([
            'title' => 'Take a short break',
            'planned_date' => '2026-11-13',
            'priority' => 'medium',
            'sort_order' => 0,
        ]);

        $this->actingAs($user)
            ->patch(route('tasks.complete', $task->id), ['completed' => true])
            ->assertRedirect();

        $this->assertDatabaseHas('tasks', [
            'id' => $task->id,
            'user_id' => $user->id,
        ]);
        $this->assertNotNull($task->fresh()->completed_at);
    }
}
