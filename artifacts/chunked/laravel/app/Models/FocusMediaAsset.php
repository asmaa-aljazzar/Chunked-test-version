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

        return Storage::disk($this->storage_disk ?: 'public')->url($this->file_path);
    }

    public function getPublicThumbnailUrlAttribute(): ?string
    {
        if (! $this->thumbnail_path) {
            return null;
        }

        return Storage::disk($this->storage_disk ?: 'public')->url($this->thumbnail_path);
    }
}
