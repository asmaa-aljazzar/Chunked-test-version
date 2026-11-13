<?php

namespace Tests\Feature;

use App\Models\FocusMediaAsset;
use App\Models\User;
use App\Support\FocusMediaToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FocusMediaTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['focus-media.token_secret' => 'focus-media-test-secret']);
    }

    public function test_signed_in_user_can_save_personal_audio_and_video_metadata(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $tokenResponse = $this->postJson('/focus/media/upload-token', [
            'title' => 'Rain on the window',
            'mime_type' => 'audio/mpeg',
            'size' => 1024,
        ])->assertCreated();
        $token = $tokenResponse->json('token');
        $claims = FocusMediaToken::verify($token);
        $confirmation = FocusMediaToken::issue([
            ...$claims,
            'action' => 'confirmed',
        ]);

        $this->postJson('/focus/media', ['token' => $token, 'confirmation' => $confirmation])
            ->assertCreated()
            ->assertJsonStructure(['id']);

        $asset = FocusMediaAsset::query()->firstOrFail();
        $this->assertDatabaseHas('focus_media_assets', [
            'id' => $asset->id,
            'user_id' => $user->id,
            'title' => 'Rain on the window',
            'kind' => 'audio',
            'source_type' => 'user_upload',
            'storage_disk' => 'object_storage',
            'mime_type' => 'audio/mpeg',
            'file_size' => 1024,
        ]);
        $this->assertStringStartsWith('/api/storage/focus-media/', $asset->public_url);
        $this->assertStringNotContainsString('public-objects', $asset->public_url);

        $videoToken = $this->postJson('/focus/media/upload-token', [
            'title' => 'Clouds drifting',
            'mime_type' => 'video/mp4',
            'size' => 2048,
        ])->assertCreated()->json('token');
        $videoClaims = FocusMediaToken::verify($videoToken);
        $videoConfirmation = FocusMediaToken::issue([
            ...$videoClaims,
            'action' => 'confirmed',
        ]);

        $this->postJson('/focus/media', [
            'token' => $videoToken,
            'confirmation' => $videoConfirmation,
        ])->assertCreated();
        $this->assertDatabaseHas('focus_media_assets', [
            'user_id' => $user->id,
            'title' => 'Clouds drifting',
            'kind' => 'video',
            'mime_type' => 'video/mp4',
            'file_size' => 2048,
        ]);
    }

    public function test_users_cannot_save_another_users_media_or_replay_upload_metadata(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();
        $this->actingAs($owner);

        $token = $this->postJson('/focus/media/upload-token', [
            'title' => 'Quiet study music',
            'mime_type' => 'audio/mpeg',
            'size' => 128,
        ])->assertCreated()->json('token');
        $claims = FocusMediaToken::verify($token);
        $confirmation = FocusMediaToken::issue([
            ...$claims,
            'action' => 'confirmed',
        ]);

        $this->actingAs($otherUser)
            ->postJson('/focus/media', ['token' => $token, 'confirmation' => $confirmation])
            ->assertForbidden();

        $this->actingAs($owner)
            ->postJson('/focus/media', ['token' => $token, 'confirmation' => $confirmation])
            ->assertCreated();
        $this->postJson('/focus/media', ['token' => $token, 'confirmation' => $confirmation])->assertConflict();
    }

    public function test_only_the_owner_can_remove_an_uploaded_item(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();
        $asset = FocusMediaAsset::query()->create([
            'user_id' => $owner->id,
            'title' => 'Soft rain',
            'category' => 'Personal',
            'kind' => 'audio',
            'source_type' => 'user_upload',
            'storage_disk' => 'object_storage',
            'file_path' => "focus-media/{$owner->id}/85b6f5c2-75df-4a68-8ae7-a3d166199f44.mp3",
            'mime_type' => 'audio/mpeg',
            'is_active' => true,
        ]);

        $this->actingAs($otherUser)
            ->postJson("/focus/media/{$asset->id}/delete-token")
            ->assertNotFound();

        $this->actingAs($owner);
        $token = $this->postJson("/focus/media/{$asset->id}/delete-token")
            ->assertOk()->json('token');
        $claims = FocusMediaToken::verify($token);
        $this->assertSame((string) $owner->id, $claims['userId']);
        $this->assertSame('delete', $claims['action']);

        $this->deleteJson("/focus/media/{$asset->id}", ['token' => $token])
            ->assertOk()
            ->assertJson(['deleted' => true]);
        $this->assertDatabaseMissing('focus_media_assets', ['id' => $asset->id]);
    }

    public function test_only_the_owner_can_rename_an_uploaded_item(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();
        $asset = FocusMediaAsset::query()->create([
            'user_id' => $owner->id,
            'title' => 'Soft rain',
            'category' => 'Personal',
            'kind' => 'audio',
            'source_type' => 'user_upload',
            'storage_disk' => 'object_storage',
            'file_path' => "focus-media/{$owner->id}/85b6f5c2-75df-4a68-8ae7-a3d166199f44.mp3",
            'mime_type' => 'audio/mpeg',
            'file_size' => 128,
            'is_active' => true,
        ]);

        $this->actingAs($otherUser)
            ->patchJson("/focus/media/{$asset->id}", ['title' => 'Renamed'])
            ->assertNotFound();

        $this->actingAs($owner)
            ->patchJson("/focus/media/{$asset->id}", ['title' => 'Gentle rain'])
            ->assertOk()
            ->assertJson(['title' => 'Gentle rain']);
        $this->assertDatabaseHas('focus_media_assets', [
            'id' => $asset->id,
            'user_id' => $owner->id,
            'title' => 'Gentle rain',
        ]);
    }

    public function test_unsupported_media_types_and_unauthenticated_uploads_are_rejected(): void
    {
        $this->postJson('/focus/media/upload-token', [
            'title' => 'External player',
            'mime_type' => 'text/html',
            'size' => 10,
        ])->assertUnauthorized();

        $this->actingAs(User::factory()->create())
            ->postJson('/focus/media/upload-token', [
                'title' => 'External player',
                'mime_type' => 'text/html',
                'size' => 10,
            ])->assertUnprocessable();
    }

    public function test_upload_tokens_reject_tampering_and_expiration(): void
    {
        $claims = [
            'action' => 'upload',
            'userId' => '7',
            'path' => 'focus-media/7/85b6f5c2-75df-4a68-8ae7-a3d166199f44.mp3',
            'exp' => time() - 1,
        ];
        $token = FocusMediaToken::issue($claims);
        $this->assertNull(FocusMediaToken::verify($token));
        $this->assertNull(FocusMediaToken::verify($token.'tampered'));
    }
}
