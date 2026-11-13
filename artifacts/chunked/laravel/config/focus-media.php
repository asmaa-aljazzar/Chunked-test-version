<?php

return [
    'token_secret' => env('SESSION_SECRET'),
    'storage_disk' => env('FOCUS_MEDIA_DISK') ?: (
        env('DEFAULT_OBJECT_STORAGE_BUCKET_ID') ? 'object_storage' : 'public'
    ),
];
