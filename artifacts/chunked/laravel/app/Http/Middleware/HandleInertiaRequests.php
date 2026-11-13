<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    protected $rootView = 'app';

    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    public function share(Request $request): array
    {
        return [
            ...parent::share($request),
            'auth' => [
                'user' => $request->user()
                    ? [
                        'id' => $request->user()->id,
                        'name' => $request->user()->name,
                        'email' => $request->user()->email,
                    ]
                    : null,
            ],
            'user' => $request->user()
                ? [
                    'name' => $request->user()->name,
                    'email' => $request->user()->email,
                ]
                : null,
            'routes' => [
                'day' => '/day',
                'focus' => '/focus',
                'taskStore' => '/tasks',
                'taskUpdate' => '/tasks',
                'taskComplete' => '/tasks',
                'taskDestroy' => '/tasks',
                'settingsUpdate' => '/settings',
                'structureUpdate' => '/onboarding',
                'structureSkip' => '/onboarding/skip',
                'login' => '/login',
                'register' => '/register',
                'logout' => '/logout',
            ],
            'flash' => [
                'success' => fn () => $request->session()->get('success'),
                'deletedTaskId' => fn () => $request->session()->get('deleted_task_id'),
            ],
        ];
    }
}
