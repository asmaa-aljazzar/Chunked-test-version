<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FocusPlan extends Model
{
    protected $fillable = [
        'uuid',
        'planned_date',
        'current_chunk_id',
        'current_chunk_name_snapshot',
        'focus_minutes',
        'break_minutes',
        'planned_sessions',
        'transition_mode',
        'completed_sessions',
        'phase',
        'status',
        'phase_remaining_seconds',
        'phase_started_at',
        'phase_ends_at',
        'chunk_ends_at',
        'current_session_id',
    ];

    protected function casts(): array
    {
        return [
            'planned_date' => 'date:Y-m-d',
            'phase_started_at' => 'datetime',
            'phase_ends_at' => 'datetime',
            'chunk_ends_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function chunk(): BelongsTo
    {
        return $this->belongsTo(Chunk::class, 'current_chunk_id')->withTrashed();
    }

    public function sessions(): HasMany
    {
        return $this->hasMany(FocusSession::class);
    }
}
