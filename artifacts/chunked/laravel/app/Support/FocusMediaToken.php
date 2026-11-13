<?php

namespace App\Support;

use JsonException;

class FocusMediaToken
{
    public static function issue(array $claims): string
    {
        $secret = config('focus-media.token_secret');
        if (! is_string($secret) || $secret === '') {
            throw new \RuntimeException('Focus media signing is not configured.');
        }

        try {
            $payload = rtrim(strtr(base64_encode(json_encode($claims, JSON_THROW_ON_ERROR)), '+/', '-_'), '=');
        } catch (JsonException $exception) {
            throw new \RuntimeException('Focus media authorization could not be created.', previous: $exception);
        }

        $signature = hash_hmac('sha256', $payload, $secret, true);

        return $payload.'.'.rtrim(strtr(base64_encode($signature), '+/', '-_'), '=');
    }

    public static function verify(string $token): ?array
    {
        $secret = config('focus-media.token_secret');
        if (! is_string($secret) || $secret === '' || substr_count($token, '.') !== 1) {
            return null;
        }

        [$payload, $signature] = explode('.', $token, 2);
        $decodedSignature = self::decode($signature);
        $expectedSignature = hash_hmac('sha256', $payload, $secret, true);
        if ($decodedSignature === null || ! hash_equals($expectedSignature, $decodedSignature)) {
            return null;
        }

        $decodedPayload = self::decode($payload);
        if ($decodedPayload === null) {
            return null;
        }

        try {
            $claims = json_decode($decodedPayload, true, flags: JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return null;
        }

        if (! is_array($claims) || ! is_int($claims['exp'] ?? null) || $claims['exp'] <= time()) {
            return null;
        }

        return $claims;
    }

    private static function decode(string $value): ?string
    {
        $decoded = base64_decode(strtr($value, '-_', '+/'), true);

        return $decoded === false ? null : $decoded;
    }
}
