<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaskPriorityTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_task_can_be_created_with_the_default_medium_priority(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->post(route('tasks.store'), [
                'title' => 'Study',
                'plannedDate' => '2026-11-12',
                'priority' => 'medium',
            ])
            ->assertRedirect();

        $this->assertDatabaseHas('tasks', [
            'user_id' => $user->id,
            'title' => 'Study',
            'priority' => 'medium',
        ]);
    }
}
