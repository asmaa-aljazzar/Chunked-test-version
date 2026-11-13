<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('focus_plans', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->date('planned_date');
            $table->foreignId('current_chunk_id')->nullable()->constrained('chunks')->nullOnDelete();
            $table->string('current_chunk_name_snapshot', 120)->nullable();
            $table->unsignedSmallInteger('focus_minutes')->default(25);
            $table->unsignedSmallInteger('break_minutes')->default(5);
            $table->unsignedSmallInteger('planned_sessions')->default(1);
            $table->string('transition_mode', 12)->default('manual');
            $table->unsignedSmallInteger('completed_sessions')->default(0);
            $table->string('phase', 12)->default('focus');
            $table->string('status', 16)->default('ready');
            $table->unsignedInteger('phase_remaining_seconds')->default(1500);
            $table->timestamp('phase_started_at')->nullable();
            $table->timestamp('phase_ends_at')->nullable();
            $table->timestamp('chunk_ends_at')->nullable();
            $table->unsignedBigInteger('current_session_id')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'planned_date', 'status']);
            $table->index(['user_id', 'status']);
        });

        Schema::create('focus_sessions', function (Blueprint $table) {
            $table->id();
            $table->uuid('session_key')->unique();
            $table->foreignId('focus_plan_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('chunk_id')->nullable()->constrained('chunks')->nullOnDelete();
            $table->string('chunk_name_snapshot', 120)->nullable();
            $table->date('planned_date');
            $table->unsignedSmallInteger('session_number');
            $table->string('status', 12)->default('running');
            $table->unsignedInteger('planned_seconds');
            $table->unsignedInteger('focused_seconds')->default(0);
            $table->unsignedInteger('remaining_seconds');
            $table->timestamp('started_at');
            $table->timestamp('last_resumed_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->timestamp('counted_at')->nullable();
            $table->timestamps();
            $table->index(['focus_plan_id', 'status']);
            $table->index(['user_id', 'planned_date', 'chunk_id']);
        });

        Schema::create('focus_media_assets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title', 160);
            $table->string('category', 60)->default('Ambient');
            $table->string('kind', 16);
            $table->string('source_type', 16);
            $table->string('storage_disk', 32)->default('public');
            $table->text('file_path')->nullable();
            $table->text('external_url')->nullable();
            $table->text('thumbnail_path')->nullable();
            $table->string('mime_type', 120)->nullable();
            $table->unsignedInteger('duration_seconds')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            $table->index(['is_active', 'kind', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('focus_media_assets');
        Schema::dropIfExists('focus_sessions');
        Schema::dropIfExists('focus_plans');
    }
};
