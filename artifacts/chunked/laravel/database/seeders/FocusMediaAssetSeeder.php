<?php

namespace Database\Seeders;

use App\Models\FocusMediaAsset;
use Illuminate\Database\Seeder;

class FocusMediaAssetSeeder extends Seeder
{
    public function run(): void
    {
        FocusMediaAsset::updateOrCreate(
            ['file_path' => 'focus-media/magical-moments.mp3'],
            [
                'title' => 'Magical Moments · Purrple Cat',
                'category' => 'Lo-fi',
                'kind' => 'audio',
                'source_type' => 'file',
                'storage_disk' => 'object_storage',
                'mime_type' => 'audio/mpeg',
                'duration_seconds' => 152,
                'is_active' => true,
                'sort_order' => 1,
            ],
        );

        FocusMediaAsset::updateOrCreate(
            ['file_path' => 'focus-media/teto-miku-halloween.mp4'],
            [
                'title' => 'Teto Miku · Halloween animation',
                'category' => 'Animation',
                'kind' => 'video',
                'source_type' => 'file',
                'storage_disk' => 'object_storage',
                'mime_type' => 'video/mp4',
                'duration_seconds' => 20,
                'is_active' => true,
                'sort_order' => 2,
            ],
        );
    }
}
