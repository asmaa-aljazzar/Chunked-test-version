<?php

namespace App\Http\Controllers;

use App\Models\FocusMediaAsset;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class FocusMediaController extends Controller
{
    public function storeYoutube(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'url' => ['required', 'string', 'max:2000', 'url:https'],
        ]);
        $videoId = $this->youtubeId($validated['url']);

        if (! $videoId) {
            return back()->withErrors(['url' => 'Use a supported YouTube video link.']);
        }

        $canonicalUrl = 'https://www.youtube.com/watch?v='.$videoId;

        FocusMediaAsset::firstOrCreate(
            [
                'user_id' => $request->user()->id,
                'external_url' => $canonicalUrl,
            ],
            [
                'title' => 'YouTube video '.$videoId,
                'category' => 'YouTube',
                'kind' => 'youtube',
                'source_type' => 'youtube',
                'is_active' => true,
            ],
        );

        return back()->with('success', 'YouTube video added to your room library.');
    }

    private function youtubeId(string $rawUrl): ?string
    {
        $parts = parse_url($rawUrl);
        $host = Str::lower($parts['host'] ?? '');
        $allowedHosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'];

        if (! in_array($host, $allowedHosts, true)) {
            return null;
        }

        $path = trim($parts['path'] ?? '', '/');
        $query = [];
        parse_str($parts['query'] ?? '', $query);

        if (in_array($host, ['youtu.be', 'www.youtu.be'], true)) {
            $videoId = explode('/', $path)[0] ?? '';
        } elseif (in_array($pathSegments = explode('/', $path)[0] ?? '', ['shorts', 'embed', 'live', 'v'], true)) {
            $videoId = explode('/', $path)[1] ?? '';
        } else {
            $videoId = $query['v'] ?? '';
        }

        return preg_match('/^[A-Za-z0-9_-]{11}$/', $videoId) ? $videoId : null;
    }
}
