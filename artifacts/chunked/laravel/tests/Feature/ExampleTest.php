<?php

namespace Tests\Feature;

// use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    /**
     * A basic test example.
     */
    public function test_the_home_route_redirects_to_the_day_plan(): void
    {
        $response = $this->get('/');

        $response->assertRedirect('/day');
    }
}
