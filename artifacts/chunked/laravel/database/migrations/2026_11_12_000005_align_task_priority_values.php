<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('tasks')
            ->where('priority', 'normal')
            ->update(['priority' => 'medium']);

        Schema::table('tasks', function (Blueprint $table) {
            $table->string('priority', 12)->default('medium')->change();
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->string('priority', 12)->default('normal')->change();
        });
    }
};
