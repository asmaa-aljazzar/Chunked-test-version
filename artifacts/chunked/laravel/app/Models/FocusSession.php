<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FocusSession extends Model
{
    protected $fillable = [
        'session_key',
        'focus_plan_id',
        'user_id',
        'chunk_id',
        'chunk_name_snapshot',
        'planned_date',
        'session_number',
        'status',
        'planned_seconds',
        'focused_seconds',
        'remaining_seconds',
        'context_note',
        'started_at',
        'last_resumed_at',
        'ended_at',
        'counted_at',
    ];

    protected function casts(): array
    {
        return [
            'planned_date' => 'date:Y-m-d',
            'started_at' => 'datetime',
            'last_resumed_at' => 'datetime',
            'ended_at' => 'datetime',
            'counted_at' => 'datetime',
        ];
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(FocusPlan::class, 'focus_plan_id');
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
