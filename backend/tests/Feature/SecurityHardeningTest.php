<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SecurityHardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_is_limited_per_account_even_from_shared_ip(): void
    {
        $payload = ['login' => 'guru@example.test', 'password' => 'salah'];

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/login', $payload)->assertStatus(422);
        }

        $this->postJson('/api/login', $payload)->assertStatus(429);

        $this->postJson('/api/login', ['login' => 'siswa@example.test', 'password' => 'salah'])
            ->assertStatus(422);
    }

    public function test_arbitrary_trycloudflare_origin_is_not_allowed(): void
    {
        $response = $this->call('OPTIONS', '/api/me', [], [], [], [
            'HTTP_ORIGIN' => 'https://attacker-probe.trycloudflare.com',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET',
            'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'authorization',
        ]);

        $response->assertStatus(204);
        $this->assertNull($response->headers->get('Access-Control-Allow-Origin'));
    }

    public function test_configured_origin_is_still_allowed(): void
    {
        $response = $this->call('OPTIONS', '/api/me', [], [], [], [
            'HTTP_ORIGIN' => 'http://localhost:3000',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET',
            'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'authorization',
        ]);

        $response->assertStatus(204);
        $this->assertSame('http://localhost:3000', $response->headers->get('Access-Control-Allow-Origin'));
    }
}
