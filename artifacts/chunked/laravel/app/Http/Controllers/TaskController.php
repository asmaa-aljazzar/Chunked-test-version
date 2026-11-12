<?php

namespace App\Http\Controllers;

use App\Models\Chunk;
use App\Models\Task;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class TaskController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $request->merge([
            'planned_date' => $request->input('planned_date', $request->input('plannedDate')),
            'chunk_id' => $request->input('chunk_id', $request->input('chunkId')),
        ]);
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:200'],
            'description' => ['nullable', 'string', 'max:2000'],
            'planned_date' => ['required', 'date_format:Y-m-d'],
            'chunk_id' => ['nullable', 'integer'],
            'priority' => ['required', 'in:low,medium,high'],
        ]);

        $chunk = $this->ownedChunk($request, $validated['chunk_id'] ?? null);
        $request->user()->tasks()->create([
            ...$validated,
            'title' => trim($validated['title']),
            'description' => isset($validated['description']) ? trim($validated['description']) : null,
            'chunk_id' => $chunk?->id,
            'chunk_name_snapshot' => $chunk?->name,
            'sort_order' => $request->user()->tasks()
                ->whereDate('planned_date', $validated['planned_date'])
                ->where('chunk_id', $chunk?->id)
                ->max('sort_order') + 1,
        ]);

        return back()->with('success', 'Task added.');
    }

    public function update(Request $request, int $taskId): RedirectResponse
    {
        $task = $request->user()->tasks()->whereKey($taskId)->firstOrFail();
        $payload = $request->all();
        $normalized = [];
        if (! array_key_exists('planned_date', $payload) && array_key_exists('plannedDate', $payload)) {
            $normalized['planned_date'] = $payload['plannedDate'];
        }
        if (! array_key_exists('chunk_id', $payload) && array_key_exists('chunkId', $payload)) {
            $normalized['chunk_id'] = $payload['chunkId'];
        }
        if ($normalized !== []) {
            $request->merge($normalized);
        }
        $validated = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:200'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'planned_date' => ['sometimes', 'required', 'date_format:Y-m-d'],
            'chunk_id' => ['sometimes', 'nullable', 'integer'],
            'priority' => ['sometimes', 'required', 'in:low,medium,high'],
        ]);

        if (array_key_exists('chunk_id', $validated)) {
            $chunk = $this->ownedChunk($request, $validated['chunk_id']);
            $validated['chunk_name_snapshot'] = $chunk?->name;
        }
        if (array_key_exists('title', $validated)) {
            $validated['title'] = trim($validated['title']);
        }
        if (array_key_exists('description', $validated) && $validated['description'] !== null) {
            $validated['description'] = trim($validated['description']);
        }

        $task->update($validated);

        return back()->with('success', 'Task updated.');
    }

    public function complete(Request $request, int $taskId): RedirectResponse
    {
        $request->merge([
            'completed' => $request->input('completed', $request->input('completedAt') !== null),
        ]);
        $validated = $request->validate(['completed' => ['required', 'boolean']]);
        $task = $request->user()->tasks()->whereKey($taskId)->firstOrFail();
        $task->update(['completed_at' => $validated['completed'] ? now() : null]);

        return back()->with('success', $validated['completed'] ? 'Task completed.' : 'Task reopened.');
    }

    public function destroy(Request $request, int $taskId): RedirectResponse
    {
        $task = $request->user()->tasks()->whereKey($taskId)->firstOrFail();
        $task->delete();

        return back()->with('deleted_task_id', $task->id);
    }

    public function restore(Request $request, int $taskId): RedirectResponse
    {
        $task = $request->user()->tasks()->withTrashed()->whereKey($taskId)->firstOrFail();
        $task->restore();

        return back()->with('success', 'Task restored.');
    }

    private function ownedChunk(Request $request, ?int $chunkId): ?Chunk
    {
        if ($chunkId === null) {
            return null;
        }

        return Chunk::query()
            ->whereKey($chunkId)
            ->whereNull('deleted_at')
            ->whereHas('dayStructure', fn ($query) => $query->where('user_id', $request->user()->id))
            ->firstOrFail();
    }
}
