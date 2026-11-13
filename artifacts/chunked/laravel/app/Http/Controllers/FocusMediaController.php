<?php

namespace App\Http\Controllers;

use App\Models\FocusMediaAsset;
use App\Support\FocusMediaToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class FocusMediaController extends Controller
{
    private const MIME_TYPES = [
        'audio/mpeg' => ['audio', 'mp3'],
        'audio/mp4' => ['audio', 'm4a'],
        'audio/aac' => ['audio', 'aac'],
        'audio/wav' => ['audio', 'wav'],
        'audio/x-wav' => ['audio', 'wav'],
        'audio/ogg' => ['audio', 'ogg'],
        'audio/webm' => ['audio', 'webm'],
        'video/mp4' => ['video', 'mp4'],
        'video/webm' => ['video', 'webm'],
        'video/quicktime' => ['video', 'mov'],
    ];

    public function uploadToken(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:160'],
            'mime_type' => ['required', 'string', 'max:120'],
            'size' => ['required', 'integer', 'min:1', 'max:104857600'],
        ]);

        $mimeType = strtolower($data['mime_type']);
        if (! isset(self::MIME_TYPES[$mimeType])) {
            return response()->json(['message' => 'Choose a supported audio or video file.'], 422);
        }

        [$kind, $extension] = self::MIME_TYPES[$mimeType];
        $userId = (string) $request->user()->id;
        $path = sprintf('focus-media/%s/%s.%s', $userId, Str::uuid(), $extension);
        $token = FocusMediaToken::issue([
            'action' => 'upload',
            'userId' => $userId,
            'path' => $path,
            'mimeType' => $mimeType,
            'size' => (int) $data['size'],
            'kind' => $kind,
            'title' => trim($data['title']),
            'exp' => time() + 600,
        ]);

        return response()->json(['token' => $token], 201);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string', 'max:4096'],
            'confirmation' => ['required', 'string', 'max:4096'],
        ]);
        $claims = FocusMediaToken::verify($data['token']);
        $confirmation = FocusMediaToken::verify($data['confirmation']);
        $userId = (string) $request->user()->id;

        if (
            ! $this->validClaims($claims, 'upload', $userId)
            || ! $this->validClaims($confirmation, 'confirmed', $userId)
            || ($confirmation['path'] ?? null) !== ($claims['path'] ?? null)
            || ($confirmation['mimeType'] ?? null) !== ($claims['mimeType'] ?? null)
            || ($confirmation['size'] ?? null) !== ($claims['size'] ?? null)
        ) {
            return response()->json(['message' => 'This upload is invalid or has expired.'], 403);
        }

        if (FocusMediaAsset::query()->where('file_path', $claims['path'])->exists()) {
            return response()->json(['message' => 'This upload has already been saved.'], 409);
        }

        $asset = FocusMediaAsset::query()->create([
            'user_id' => $request->user()->id,
            'title' => $claims['title'],
            'category' => 'Personal',
            'kind' => $claims['kind'],
            'source_type' => 'user_upload',
            'storage_disk' => 'object_storage',
            'file_path' => $claims['path'],
            'mime_type' => $claims['mimeType'],
            'file_size' => $claims['size'],
            'is_active' => true,
        ]);

        return response()->json(['id' => (string) $asset->id], 201);
    }

    public function update(Request $request, int $asset): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:160'],
        ]);
        $media = $this->ownedUpload($request, $asset);
        $media->update(['title' => trim($data['title'])]);

        return response()->json(['id' => (string) $media->id, 'title' => $media->title]);
    }

    public function deleteToken(Request $request, int $asset): JsonResponse
    {
        $media = $this->ownedUpload($request, $asset);
        $token = FocusMediaToken::issue([
            'action' => 'delete',
            'userId' => (string) $request->user()->id,
            'path' => $media->file_path,
            'exp' => time() + 600,
        ]);

        return response()->json(['token' => $token]);
    }

    public function destroy(Request $request, int $asset): JsonResponse
    {
        $data = $request->validate(['token' => ['required', 'string', 'max:4096']]);
        $media = $this->ownedUpload($request, $asset);
        $claims = FocusMediaToken::verify($data['token']);
        $userId = (string) $request->user()->id;

        if (
            ! $this->validClaims($claims, 'delete', $userId)
            || $claims['path'] !== $media->file_path
        ) {
            return response()->json(['message' => 'This delete request is invalid or has expired.'], 403);
        }

        $media->delete();

        return response()->json(['deleted' => true]);
    }

    private function ownedUpload(Request $request, int $asset): FocusMediaAsset
    {
        return FocusMediaAsset::query()
            ->whereKey($asset)
            ->where('user_id', $request->user()->id)
            ->where('source_type', 'user_upload')
            ->firstOrFail();
    }

    private function validClaims(?array $claims, string $action, string $userId): bool
    {
        return is_array($claims)
            && ($claims['action'] ?? null) === $action
            && ($claims['userId'] ?? null) === $userId
            && is_string($claims['path'] ?? null)
            && str_starts_with($claims['path'], "focus-media/{$userId}/");
    }
}
