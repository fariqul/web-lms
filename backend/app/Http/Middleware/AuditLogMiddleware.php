<?php

namespace App\Http\Middleware;

use App\Models\AuditLog;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuditLogMiddleware
{
    /**
     * Automatically log state-changing requests (POST, PUT, PATCH, DELETE) by admin users.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        // Only log state-changing methods
        if (!in_array($request->method(), ['POST', 'PUT', 'PATCH', 'DELETE'])) {
            return $response;
        }

        // Only log successful requests
        if ($response->getStatusCode() >= 400) {
            return $response;
        }

        // Only log for authenticated users
        $user = $request->user();
        if (!$user) {
            return $response;
        }

        try {
            $action = $this->resolveAction($request);
            $description = $this->resolveDescription($request, $action);

            AuditLog::create([
                'user_id' => $user->id,
                'action' => $action,
                'description' => $description,
                'target_type' => $this->resolveTargetType($request),
                'target_id' => $this->resolveTargetId($request),
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'new_values' => $this->sanitizeInput($request),
            ]);
        } catch (\Exception $e) {
            // Don't let audit logging break the request
            \Log::warning('Audit log failed: ' . $e->getMessage());
        }

        return $response;
    }

    private function resolveAction(Request $request): string
    {
        $path = $request->path();
        $method = $request->method();

        // Remove 'api/' prefix
        $path = preg_replace('/^api\//', '', $path);

        // Extract resource from path
        $segments = explode('/', $path);
        $resource = $segments[0] ?? 'unknown';

        $methodMap = [
            'POST' => 'create',
            'PUT' => 'update',
            'PATCH' => 'update',
            'DELETE' => 'delete',
        ];

        $verb = $methodMap[$method] ?? strtolower($method);

        // Special cases
        if (str_contains($path, 'reset-password')) return 'auth.reset_password';
        if (str_contains($path, 'login')) return 'auth.login';
        if (str_contains($path, 'logout')) return 'auth.logout';
        if (str_contains($path, 'publish')) return $resource . '.publish';
        if (str_contains($path, '/read')) return 'notification.read';

        return $resource . '.' . $verb;
    }

    private function resolveDescription(Request $request, string $action): string
    {
        $userName = $request->user()->name ?? 'Unknown';
        return $userName . ' melakukan ' . $action;
    }

    private function resolveTargetType(Request $request): ?string
    {
        $path = preg_replace('/^api\//', '', $request->path());
        $segments = explode('/', $path);
        $resource = $segments[0] ?? null;

        $typeMap = [
            'users' => 'User',
            'classes' => 'ClassRoom',
            'exams' => 'Exam',
            'materials' => 'Material',
            'assignments' => 'Assignment',
            'attendance-sessions' => 'AttendanceSession',
            'announcements' => 'Announcement',
            'schedules' => 'Schedule',
            'bank-questions' => 'BankQuestion',
        ];

        return $typeMap[$resource] ?? null;
    }

    private function resolveTargetId(Request $request): ?int
    {
        $path = preg_replace('/^api\//', '', $request->path());
        $segments = explode('/', $path);

        // Look for numeric segment (the ID)
        foreach ($segments as $segment) {
            if (is_numeric($segment)) {
                return (int) $segment;
            }
        }

        return null;
    }

    private function sanitizeInput(Request $request): ?array
    {
        $input = $request->except([
            'password', 'password_confirmation', 'token',
            '_token', '_method', 'photo', 'image', 'file',
            'pdf_file', 'attachment',
        ]);

        if (empty($input)) {
            return null;
        }

        // Truncate long values
        foreach ($input as $key => $value) {
            if (is_string($value) && strlen($value) > 500) {
                $input[$key] = substr($value, 0, 500) . '...';
            }
        }

        return $input;
    }
}
