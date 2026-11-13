<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class FocusMediaAsset extends Model
{
    protected $fillable = [
        'user_id',
        'title',
        'category',
        'kind',
        'source_type',
        'storage_disk',
        'file_path',
        'external_url',
        'thumbnail_path',
        'mime_type',
        'duration_seconds',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'duration_seconds' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function getPublicUrlAttribute(): ?string
    {
        if ($this->external_url) {
            return $this->external_url;
        }

        if (! $this->file_path) {
            return null;
        }

        return $this->mediaUrlForPath($this->file_path);
    }

    public function getPublicThumbnailUrlAttribute(): ?string
    {
        if (! $this->thumbnail_path) {
            return null;
        }

        return $this->mediaUrlForPath($this->thumbnail_path);
    }

    private function mediaUrlForPath(string $path): ?string
    {
        $segments = explode('/', ltrim($path, '/'));
        foreach ($segments as $segment) {
            $decoded = rawurldecode($segment);
            if (
                $segment === ''
                || $decoded === '.'
                || $decoded === '..'
                || str_contains($decoded, '/')
                || str_contains($decoded, '\\')
            ) {
                return null;
            }
        }

        $encodedPath = implode('/', array_map('rawurlencode', $segments));
        $disk = $this->storage_disk ?: 'public';

        if ($disk === 'object_storage') {
            return '/api/storage/public-objects/'.$encodedPath;
        }

        if ($disk === 'public') {
            return '/storage/'.$encodedPath;
        }

        return Storage::disk($disk)->url($path);
    }
}
