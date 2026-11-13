<?php

namespace Tests\Feature;

use App\Models\Chunk;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class CoreDayFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_can_register_plan_a_day_and_keep_tasks_after_signing_in_again(): void
    {
        $credentials = [
            'name' => 'A student',
            'email' => 'student@example.test',
            'password' => 'strong-password',
            'password_confirmation' => 'strong-password',
        ];

        $this->post(route('register.store'), $credentials)
            ->assertRedirect(route('onboarding.index'));
        $this->assertAuthenticated();

        $user = User::query()->where('email', $credentials['email'])->firstOrFail();

        $this->post(route('onboarding.store'), [
            'type' => 'custom',
            'name' => 'A flexible day',
            'chunks' => ['Morning', 'Evening'],
            'chunkTimes' => [
                ['startTime' => '08:00', 'endTime' => '12:00'],
                ['startTime' => '17:00', 'endTime' => '21:00'],
            ],
            'settings' => [
                'theme' => 'light',
                'language' => 'en',
                'navigationPosition' => 'sidebar',
            ],
        ])->assertRedirect(route('day.index'));

        $chunk = $user->fresh()->dayStructure->chunks()->orderBy('sort_order')->firstOrFail();
        $this->post(route('tasks.store'), [
            'title' => 'Read one chapter',
            'plannedDate' => '2026-11-13',
            'chunkId' => $chunk->id,
            'priority' => 'medium',
        ])->assertRedirect();

        $taskId = $user->tasks()->firstOrFail()->id;
        $this->post(route('logout'))->assertRedirect(route('login'));
        $this->assertGuest();

        $this->post(route('login.store'), [
            'email' => $credentials['email'],
            'password' => $credentials['password'],
        ])->assertRedirect(route('day.index'));
        $this->assertAuthenticatedAs($user);

        $this->get(route('day.index', ['date' => '2026-11-13']))
            ->assertInertia(fn (Assert $page) => $page
                ->component('App', false)
                ->where('tasks.0.id', $taskId)
                ->where('tasks.0.title', 'Read one chapter')
                ->where('tasks.0.plannedDate', '2026-11-13')
                ->where('tasks.0.chunkId', $chunk->id));

        $this->patch(route('tasks.update', $taskId), ['title' => 'Read two chapters'])
            ->assertRedirect();
        $this->assertDatabaseHas('tasks', [
            'id' => $taskId,
            'title' => 'Read two chapters',
        ]);

        $this->patch(route('tasks.complete', $taskId), ['completed' => true])
            ->assertRedirect();
        $this->assertDatabaseMissing('tasks', [
            'id' => $taskId,
            'completed_at' => null,
        ]);

        $this->delete(route('tasks.destroy', $taskId))->assertRedirect();
        $this->assertSoftDeleted('tasks', ['id' => $taskId]);
    }

    public function test_users_cannot_view_or_change_another_users_tasks(): void
    {
        [$owner, $ownerChunk] = $this->onboardedUser('owner@example.test');
        [$otherUser] = $this->onboardedUser('other@example.test');
        $task = $owner->tasks()->create([
            'chunk_id' => $ownerChunk->id,
            'chunk_name_snapshot' => $ownerChunk->name,
            'title' => 'Private study task',
            'planned_date' => '2026-11-13',
            'priority' => 'medium',
            'sort_order' => 0,
        ]);

        $this->actingAs($otherUser)
            ->get(route('day.index', ['date' => '2026-11-13']))
            ->assertInertia(fn (Assert $page) => $page
                ->component('App', false)
                ->has('tasks', 0));

        $this->patch(route('tasks.update', $task->id), ['title' => 'Changed by another user'])
            ->assertNotFound();
        $this->delete(route('tasks.destroy', $task->id))
            ->assertNotFound();

        $this->assertDatabaseHas('tasks', [
            'id' => $task->id,
            'title' => 'Private study task',
            'user_id' => $owner->id,
            'deleted_at' => null,
        ]);
    }

    /**
     * @return array{User, Chunk}
     */
    private function onboardedUser(string $email): array
    {
        $user = User::factory()->create(['email' => $email]);
        $user->settings()->create([
            'timezone' => 'UTC',
            'onboarded_at' => now(),
        ]);
        $structure = $user->dayStructure()->create([
            'type' => 'custom',
            'name' => 'A flexible day',
        ]);
        $chunk = $structure->chunks()->create([
            'name' => 'Morning',
            'start_time' => '08:00',
            'end_time' => '12:00',
            'sort_order' => 0,
        ]);

        return [$user, $chunk];
    }
}
