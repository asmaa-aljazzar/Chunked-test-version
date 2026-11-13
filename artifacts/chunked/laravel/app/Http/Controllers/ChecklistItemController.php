<?php

namespace App\Http\Controllers;

use App\Models\Task;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class ChecklistItemController extends Controller
{
    public function store(Request $request, int $taskId): RedirectResponse
    {
        $task = $this->ownedTask($request, $taskId);
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:120'],
        ]);

        $task->checklistItems()->create([
            'user_id' => $request->user()->id,
            'title' => trim($validated['title']),
            'sort_order' => ((int) $task->checklistItems()->max('sort_order')) + 1,
        ]);

        return back()->with('success', 'Checklist step added.');
    }

    public function update(Request $request, int $taskId, int $itemId): RedirectResponse
    {
        $task = $this->ownedTask($request, $taskId);
        $item = $task->checklistItems()->whereKey($itemId)->firstOrFail();
        $validated = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:120'],
            'completed' => ['sometimes', 'required', 'boolean'],
        ]);

        if (array_key_exists('title', $validated)) {
            $validated['title'] = trim($validated['title']);
        }

        if (array_key_exists('completed', $validated)) {
            $validated['completed_at'] = $validated['completed'] ? now() : null;
            unset($validated['completed']);
        }

        $item->update($validated);

        return back()->with('success', 'Checklist step updated.');
    }

    public function destroy(Request $request, int $taskId, int $itemId): RedirectResponse
    {
        $task = $this->ownedTask($request, $taskId);
        $task->checklistItems()->whereKey($itemId)->firstOrFail()->delete();

        return back()->with('success', 'Checklist step removed.');
    }

    private function ownedTask(Request $request, int $taskId): Task
    {
        return $request->user()->tasks()->whereKey($taskId)->firstOrFail();
    }
}
