<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DayController;
use App\Http\Controllers\FocusController;
use App\Http\Controllers\OnboardingController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\TaskController;

Route::redirect('/', '/day');

Route::middleware('guest')->group(function () {
    Route::get('/login', [AuthController::class, 'loginPage'])->name('login');
    Route::post('/login', [AuthController::class, 'login'])->name('login.store');
    Route::get('/register', [AuthController::class, 'registerPage'])->name('register');
    Route::post('/register', [AuthController::class, 'register'])->name('register.store');
});

Route::middleware('auth')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout'])->name('logout');
    Route::get('/day', [DayController::class, 'index'])->name('day.index');
    Route::get('/focus', [FocusController::class, 'index'])->name('focus.index');
    Route::get('/onboarding', [OnboardingController::class, 'index'])->name('onboarding.index');
    Route::post('/onboarding', [OnboardingController::class, 'store'])->name('onboarding.store');
    Route::post('/onboarding/skip', [OnboardingController::class, 'skip'])->name('onboarding.skip');
    Route::get('/settings', [SettingsController::class, 'show'])->name('settings.show');
    Route::patch('/settings', [SettingsController::class, 'update'])->name('settings.update');
    Route::post('/tasks', [TaskController::class, 'store'])->name('tasks.store');
    Route::patch('/tasks/{task}', [TaskController::class, 'update'])->name('tasks.update');
    Route::patch('/tasks/{task}/complete', [TaskController::class, 'complete'])->name('tasks.complete');
    Route::delete('/tasks/{task}', [TaskController::class, 'destroy'])->name('tasks.destroy');
    Route::post('/tasks/{task}/restore', [TaskController::class, 'restore'])->name('tasks.restore');
});
