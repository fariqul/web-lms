# 📋 Panduan Code Style & Patterns

## TypeScript Frontend

### File Organization
```typescript
// 1. Imports - kelompokkan by source
import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { userService } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/ui/Button';
import DashboardLayout from '@/components/layouts/DashboardLayout';

// 2. Types - definisikan interfaces
interface Props {
  className?: string;
  onSubmit: (data: FormData) => Promise<void>;
}

interface ComponentState {
  isLoading: boolean;
  error: string | null;
}

// 3. Component definition
export default function MyComponent({ className = '', onSubmit }: Props) {
  // State declarations
  const [state, setState] = useState<ComponentState>(...);
  const router = useRouter();
  const { user } = useAuth();

  // Callbacks - use useCallback untuk prevent re-renders
  const handleSubmit = useCallback(async (formData: FormData) => {
    try {
      await onSubmit(formData);
    } catch (error) {
      setState(prev => ({ ...prev, error: ... }));
    }
  }, [onSubmit]);

  // Effects - logic terakhir
  useEffect(() => {
    // Cleanup function jika diperlukan
    return () => { ... };
  }, [dependency]);

  // Render - return JSX
  return (
    <DashboardLayout>
      {/* JSX */}
    </DashboardLayout>
  );
}
```

### Naming Conventions
```typescript
// ✅ Good
- Component names: PascalCase (UserCard, StudentDashboard)
- Functions: camelCase (handleClick, calculateScore)
- Constants: UPPER_SNAKE_CASE (MAX_FILE_SIZE, API_TIMEOUT)
- Hooks: camelCase starting with 'use' (useAuth, useSocket, useExamMode)
- Variables: camelCase (isLoading, studentId, formErrors)
- Booleans: is/has/can prefix (isLoading, hasError, canSubmit)

// ❌ Avoid
- Component: myComponent, MYCOMPONENT
- Variables: MyVariable, my_variable
- Constants: maxFileSize
```

### Component Pattern - Controlled vs Uncontrolled
```typescript
// ✅ Controlled Component (recommended)
interface InputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function ControlledInput({ value, onChange, error }: InputProps) {
  return (
    <div>
      <input 
        value={value} 
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
      />
      {error && <span className="text-red-500">{error}</span>}
    </div>
  );
}

// Use with parent state
const [email, setEmail] = useState('');
<ControlledInput value={email} onChange={setEmail} error={errors.email} />
```

### Error Handling Pattern
```typescript
// ✅ Consistent error handling
const handleAction = async () => {
  try {
    setIsLoading(true);
    setError(null);
    
    const result = await apiCall();
    
    // Success
    toast.success('Berhasil disimpan');
    // Update state/refresh data
    
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
    setError(message);
    toast.error(message);
    console.error('Action error:', err); // Log for debugging
  } finally {
    setIsLoading(false);
  }
};
```

## PHP Laravel Backend

### Controller Structure
```php
<?php
namespace App\Http\Controllers\Api;

use App\Models\User;
use App\Services\UserService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class UserController extends Controller
{
    // 1. Constructor - dependency injection
    public function __construct(
        private UserService $userService
    ) {}

    // 2. Action methods - singular responsibility
    public function store(Request $request): JsonResponse
    {
        // Validate
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users',
        ]);

        try {
            // Business logic di service layer
            $user = $this->userService->createUser($validated);

            return response()->json([
                'success' => true,
                'message' => 'User berhasil dibuat',
                'data' => $user,
            ], 201);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Gagal membuat user',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    // 3. Query methods - use select() untuk optimize
    public function index(): JsonResponse
    {
        $users = User::select('id', 'name', 'email', 'role', 'is_blocked')
            ->where('role', 'siswa')
            ->paginate(15);

        return response()->json($users);
    }
}
```

### Service Layer Pattern
```php
<?php
namespace App\Services;

use App\Models\User;

class UserService
{
    // Bisnis logic terpisah dari controller
    public function createUser(array $data): User
    {
        // Validate data jika diperlukan
        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => bcrypt($data['password']),
            'role' => $data['role'] ?? 'siswa',
        ]);

        // Side effects (log, event, cache)
        event(new UserCreated($user));

        return $user;
    }

    public function blockUsers(array $userIds, string $reason = null): int
    {
        return User::whereIn('id', $userIds)->update([
            'is_blocked' => true,
            'block_reason' => $reason,
            'blocked_at' => now(),
        ]);
    }
}
```

### Model Best Practices
```php
<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class User extends Model
{
    // 1. Define fillable
    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'is_blocked',
    ];

    // 2. Hide sensitive attributes
    protected $hidden = ['password', 'remember_token'];

    // 3. Cast attributes
    protected $casts = [
        'is_blocked' => 'boolean',
        'email_verified_at' => 'datetime',
    ];

    // 4. Relationships
    public function exams(): HasMany
    {
        return $this->hasMany(ExamResult::class, 'student_id');
    }

    // 5. Scopes - untuk reusable queries
    public function scopeActive($query)
    {
        return $query->where('is_blocked', false);
    }

    public function scopeOfRole($query, string $role)
    {
        return $query->where('role', $role);
    }

    // Usage: User::active()->ofRole('siswa')->get()
}
```

### Query Optimization
```php
// ❌ N+1 Query Problem
$users = User::all();
foreach ($users as $user) {
    echo $user->exams()->count(); // This queries DB for each user!
}

// ✅ Use eager loading
$users = User::with('exams')->get();
foreach ($users as $user) {
    echo $user->exams->count(); // Already loaded
}

// ✅ Use select() untuk specific columns
$users = User::select('id', 'name', 'email')
    ->with('exams:id,student_id')
    ->paginate(15);
```

## Real-time WebSocket Patterns

### Frontend - useSocket Hook
```typescript
// ✅ Proper WebSocket usage
import { useSocket } from '@/hooks/useSocket';
import { useEffect } from 'react';

export function ExamMonitor() {
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;

    // Listen to events
    const handleExamUpdate = (data: ExamUpdate) => {
      console.log('Exam updated:', data);
      // Update local state
    };

    socket.on('exam:updated', handleExamUpdate);

    // Cleanup on unmount - PENTING!
    return () => {
      socket.off('exam:updated', handleExamUpdate);
    };
  }, [socket]);

  return <div>{/* UI */}</div>;
}
```

### Backend - Broadcasting Events
```php
<?php
// app/Events/ExamSubmitted.php
namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithBroadcasting;
use Illuminate\Queue\SerializesModels;

class ExamSubmitted implements ShouldBroadcast
{
    use InteractsWithBroadcasting, SerializesModels;

    public function __construct(
        public ExamResult $examResult
    ) {}

    public function broadcastOn(): Channel
    {
        return new Channel("exam.{$this->examResult->exam_id}");
    }

    public function broadcastAs(): string
    {
        return 'exam:submitted';
    }

    public function broadcastWith(): array
    {
        return [
            'exam_id' => $this->examResult->exam_id,
            'student_id' => $this->examResult->student_id,
            'status' => $this->examResult->status,
        ];
    }
}
```

## Security Patterns

### Authentication Flow
```typescript
// Frontend - JWT handling
const login = async (email: string, password: string) => {
  const response = await api.post('/auth/login', { email, password });
  
  // Token di httpOnly cookie (set by backend)
  // JANGAN store di localStorage atau sessionStorage!
  
  // Set user context
  setUser(response.data.user);
  
  return response.data;
};

const logout = async () => {
  await api.post('/auth/logout'); // Backend clear cookie
  setUser(null);
  router.push('/login');
};
```

### Protected API Calls
```typescript
// axios interceptor auto-add auth headers
api.interceptors.request.use((config) => {
  // Token dari httpOnly cookie - auto sent by browser
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired
      await logout();
      router.push('/login');
    }
    return Promise.reject(error);
  }
);
```

## Testing Patterns

### Component Testing
```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExamPage from '@/app/ujian/[id]/page';

describe('ExamPage', () => {
  it('should prevent submission without work photo for essay', async () => {
    render(<ExamPage examId="1" />);
    
    // Find essay question
    const essayQuestion = screen.getByText('Essay Question');
    expect(essayQuestion).toBeInTheDocument();
    
    // Try submit without photo
    const submitBtn = screen.getByRole('button', { name: /submit/i });
    await userEvent.click(submitBtn);
    
    // Expect error
    await waitFor(() => {
      expect(screen.getByText(/work photo required/i)).toBeInTheDocument();
    });
  });
});
```

## Comment Standards
```typescript
// ✅ Good comments

// Calculate total score from all answers
// Considers weighted scoring per question type
const calculateTotalScore = () => { ... };

/*
 * Migrate exam results from old system
 * WARNING: This should only run once on deployment
 * See docs/MIGRATION.md for details
 */
export async function migrateExamResults() { ... }

// TODO: Add rate limiting for API endpoint (TICKET-123)
// FIXME: Handle network timeout case
// NOTE: Must be called before exam submission
```

---

**Terapkan panduan ini untuk konsistensi kode di seluruh project!**
