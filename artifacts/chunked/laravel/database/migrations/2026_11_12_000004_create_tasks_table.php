<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('chunk_id')->nullable()->constrained()->nullOnDelete();
            $table->string('chunk_name_snapshot', 120)->nullable();
            $table->string('title', 200);
            $table->text('description')->nullable();
            $table->date('planned_date');
            $table->string('priority', 12)->default('medium');
            $table->timestamp('completed_at')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            $table->softDeletes();
            $table->index(['user_id', 'planned_date', 'completed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tasks');
    }
};
