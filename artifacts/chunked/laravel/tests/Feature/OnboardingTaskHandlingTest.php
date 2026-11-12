<?php

namespace Tests\Feature;

use App\Models\Chunk;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OnboardingTaskHandlingTest extends TestCase
{
    use RefreshDatabase;

    public function test_rhythm_changes_require_a_choice_when_tasks_are_attached_to_old_chunks(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $oldChunks = $this->saveRhythm([
            ['name' => 'Morning', 'startTime' => '08:00', 'endTime' => '12:00'],
        ]);
        $task = $this->createTask($user, $oldChunks->first(), 'Read');

        $this->post(route('onboarding.store'), $this->rhythmPayload([
            ['name' => 'Early', 'startTime' => '08:00', 'endTime' => '10:00'],
            ['name' => 'Late', 'startTime' => '10:00', 'endTime' => '12:00'],
        ]))->assertSessionHasErrors('taskDecisions');

        $this->assertDatabaseHas('chunks', [
            'id' => $oldChunks->first()->id,
            'deleted_at' => null,
        ]);
        $this->assertDatabaseHas('tasks', [
            'id' => $task->id,
            'chunk_id' => $oldChunks->first()->id,
            'deleted_at' => null,
        ]);
    }

    public function test_each_task_can_be_moved_to_a_confirmed_destination_or_left_unassigned(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $oldChunks = $this->saveRhythm([
            ['name' => 'Morning', 'startTime' => '08:00', 'endTime' => '12:00'],
            ['name' => 'Afternoon', 'startTime' => '12:00', 'endTime' => '16:00'],
            ['name' => 'Prayer period', 'startTime' => '', 'endTime' => ''],
        ]);
        $morningTask = $this->createTask($user, $oldChunks[0], 'Read');
        $afternoonTask = $this->createTask($user, $oldChunks[1], 'Study');
        $unmatchedTask = $this->createTask($user, $oldChunks[2], 'Reflect');

        $this->post(route('onboarding.store'), [
            ...$this->rhythmPayload([
                ['name' => 'First part', 'startTime' => '08:00', 'endTime' => '11:00'],
                ['name' => 'Second part', 'startTime' => '11:00', 'endTime' => '17:00'],
            ]),
            'taskDecisions' => [
                ['taskId' => $morningTask->id, 'action' => 'move', 'chunkIndex' => 0],
                ['taskId' => $afternoonTask->id, 'action' => 'move', 'chunkIndex' => 1],
                ['taskId' => $unmatchedTask->id, 'action' => 'unassigned'],
            ],
        ])->assertRedirect(route('day.index'));

        $newChunks = $user->fresh()->dayStructure->chunks()->get()->keyBy('name');
        $this->assertDatabaseHas('tasks', [
            'id' => $morningTask->id,
            'chunk_id' => $newChunks['First part']->id,
            'chunk_name_snapshot' => 'First part',
        ]);
        $this->assertDatabaseHas('tasks', [
            'id' => $afternoonTask->id,
            'chunk_id' => $newChunks['Second part']->id,
            'chunk_name_snapshot' => 'Second part',
        ]);
        $this->assertDatabaseHas('tasks', [
            'id' => $unmatchedTask->id,
            'chunk_id' => null,
            'chunk_name_snapshot' => 'Prayer period',
        ]);
    }

    public function test_explicit_delete_removes_affected_tasks_from_the_active_list(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $oldChunks = $this->saveRhythm([
            ['name' => 'Morning', 'startTime' => '08:00', 'endTime' => '12:00'],
        ]);
        $task = $this->createTask($user, $oldChunks->first(), 'Read');

        $this->post(route('onboarding.store'), [
            ...$this->rhythmPayload([
                ['name' => 'First part', 'startTime' => '08:00', 'endTime' => '11:00'],
                ['name' => 'Second part', 'startTime' => '11:00', 'endTime' => '17:00'],
            ]),
            'taskDecisions' => [
                ['taskId' => $task->id, 'action' => 'delete'],
            ],
        ])->assertRedirect(route('day.index'));

        $this->assertSoftDeleted('tasks', ['id' => $task->id]);
    }

    public function test_a_move_cannot_target_a_chunk_that_is_not_in_the_new_rhythm(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $oldChunks = $this->saveRhythm([
            ['name' => 'Morning', 'startTime' => '08:00', 'endTime' => '12:00'],
        ]);
        $task = $this->createTask($user, $oldChunks->first(), 'Read');

        $this->post(route('onboarding.store'), [
            ...$this->rhythmPayload([
                ['name' => 'First part', 'startTime' => '08:00', 'endTime' => '10:00'],
                ['name' => 'Second part', 'startTime' => '10:00', 'endTime' => '12:00'],
            ]),
            'taskDecisions' => [
                ['taskId' => $task->id, 'action' => 'move', 'chunkIndex' => 8],
            ],
        ])->assertSessionHasErrors('taskDecisions');

        $this->assertDatabaseHas('tasks', [
            'id' => $task->id,
            'chunk_id' => $oldChunks->first()->id,
            'chunk_name_snapshot' => 'Morning',
        ]);
    }

    private function saveRhythm(array $chunks)
    {
        $this->post(route('onboarding.store'), $this->rhythmPayload($chunks))
            ->assertRedirect(route('day.index'));

        return auth()->user()->dayStructure->chunks()->orderBy('sort_order')->get();
    }

    private function rhythmPayload(array $chunks): array
    {
        return [
            'type' => 'custom',
            'name' => 'My rhythm',
            'chunks' => array_column($chunks, 'name'),
            'chunkTimes' => array_map(fn ($chunk) => [
                'startTime' => $chunk['startTime'],
                'endTime' => $chunk['endTime'],
            ], $chunks),
            'settings' => [
                'theme' => 'light',
                'navigationPosition' => 'sidebar',
                'language' => 'en',
            ],
        ];
    }

    private function createTask(User $user, Chunk $chunk, string $title)
    {
        return $user->tasks()->create([
            'chunk_id' => $chunk->id,
            'chunk_name_snapshot' => $chunk->name,
            'title' => $title,
            'planned_date' => '2026-11-12',
            'priority' => 'medium',
        ]);
    }
}
