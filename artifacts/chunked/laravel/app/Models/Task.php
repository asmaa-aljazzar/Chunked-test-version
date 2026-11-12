<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Task extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'chunk_id',
        'chunk_name_snapshot',
        'title',
        'description',
        'planned_date',
        'priority',
        'completed_at',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'planned_date' => 'date:Y-m-d',
            'completed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function chunk(): BelongsTo
    {
        return $this->belongsTo(Chunk::class)->withTrashed();
    }
}
