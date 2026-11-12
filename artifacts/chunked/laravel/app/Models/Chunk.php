<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Chunk extends Model
{
    use SoftDeletes;

    protected $fillable = ['name', 'start_time', 'end_time', 'sort_order'];

    public function dayStructure(): BelongsTo
    {
        return $this->belongsTo(DayStructure::class);
    }
}
