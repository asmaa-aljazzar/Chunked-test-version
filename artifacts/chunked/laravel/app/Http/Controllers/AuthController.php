<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class AuthController extends Controller
{
    public function loginPage(): Response
    {
        return Inertia::render('App');
    }

    public function registerPage(): Response
    {
        return Inertia::render('App');
    }

    public function register(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email:rfc', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user = User::create([
            'name' => trim($validated['name']),
            'email' => Str::lower(trim($validated['email'])),
            'password' => $validated['password'],
        ]);

        $user->settings()->create();
        Auth::login($user);
        $request->session()->regenerate();

        return redirect()->route('onboarding.index');
    }

    public function login(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email:rfc', 'max:255'],
            'password' => ['required', 'string'],
        ]);

        $key = Str::transliterate(Str::lower($validated['email']).'|'.$request->ip());
        if (RateLimiter::tooManyAttempts($key, 5)) {
            throw ValidationException::withMessages([
                'email' => 'Too many sign-in attempts. Please wait a minute and try again.',
            ]);
        }

        if (! Auth::attempt([
            'email' => Str::lower(trim($validated['email'])),
            'password' => $validated['password'],
        ], $request->boolean('remember'))) {
            RateLimiter::hit($key, 60);

            throw ValidationException::withMessages([
                'email' => 'Those sign-in details did not match an account.',
            ]);
        }

        RateLimiter::clear($key);
        $request->session()->regenerate();

        $settings = $request->user()->settings;
        return $settings?->onboarded_at
            ? redirect()->route('day.index')
            : redirect()->route('onboarding.index');
    }

    public function logout(Request $request): RedirectResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('login');
    }
}
