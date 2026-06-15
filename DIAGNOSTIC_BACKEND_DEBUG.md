# Proctoring Diagnostic Backend - Debug Checklist

## ✅ Files Confirmed Present:
- ✅ `backend/routes/api.php` - Routes defined
- ✅ `backend/app/Http/Controllers/Api/ProctoringDiagnosticController.php` - Controller exists
- ✅ Import statement present in api.php

## 🔍 Troubleshooting Steps:

### Step 1: Clear All Laravel Cache (CRITICAL!)
```bash
# SSH to server
ssh user@server
cd /path/to/backend

# Clear ALL caches
php artisan route:clear
php artisan config:clear
php artisan cache:clear
php artisan view:clear
php artisan optimize:clear

# Rebuild route cache
php artisan route:cache
php artisan config:cache
```

### Step 2: Verify Routes are Registered
```bash
# List all routes and grep for diagnostic
php artisan route:list | grep diagnostic

# Expected output:
# POST   api/proctoring-diagnostic/analyze
# GET    api/proctoring-diagnostic/tests
# GET    api/proctoring-diagnostic/tests/{id}
# GET    api/proctoring-diagnostic/tests/compare
# GET    api/proctoring-diagnostic/tests/{id}/report
# GET    api/proctoring-diagnostic/health
# POST   api/proctoring-diagnostic/scenarios/{scenario}/run
```

### Step 3: Check Laravel Logs
```bash
# Check for errors
tail -f storage/logs/laravel.log

# Look for:
# - Class not found errors
# - Namespace errors
# - Middleware errors
```

### Step 4: Verify Controller Namespace
**File:** `backend/app/Http/Controllers/Api/ProctoringDiagnosticController.php`

Should have:
```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
// ... other imports
```

### Step 5: Test Endpoint Directly (Without Auth)
```bash
# Test if endpoint exists (should return 401 or middleware error, NOT 404)
curl -X GET https://www.libelslms.my.id/api/proctoring-diagnostic/health

# 404 = Route not found
# 401 = Route found but not authenticated (GOOD!)
# 500 = Server error
```

### Step 6: Check Docker Container
```bash
# Restart backend container
docker-compose restart backend

# Or rebuild if needed
docker-compose up -d --build backend

# Check container logs
docker-compose logs -f backend
```

### Step 7: Verify Middleware (Check if route is protected correctly)
In `api.php`, routes should be inside this group:
```php
Route::middleware(['auth:sanctum', 'role:admin'])->group(function () {
    Route::prefix('proctoring-diagnostic')->group(function () {
        // Routes here
    });
});
```

## 🐛 Common Issues & Solutions:

### Issue 1: Route Cache Not Cleared
**Symptom:** 404 even though routes exist
**Solution:** 
```bash
php artisan route:clear
php artisan optimize:clear
php artisan route:cache
```

### Issue 2: Namespace Mismatch
**Symptom:** Class not found
**Solution:** Check namespace in controller matches folder structure
```php
// Controller file location: backend/app/Http/Controllers/Api/ProctoringDiagnosticController.php
// Namespace should be:
namespace App\Http\Controllers\Api;
```

### Issue 3: Import Missing in api.php
**Symptom:** Class not found error
**Solution:** Add at top of api.php:
```php
use App\Http\Controllers\Api\ProctoringDiagnosticController;
```

### Issue 4: Docker Volume Not Updated
**Symptom:** Old code still running
**Solution:**
```bash
# Stop containers
docker-compose down

# Remove volumes (CAUTION: this will reset DB if not using external volume)
docker-compose down -v

# Rebuild and start
docker-compose up -d --build
```

### Issue 5: .env CACHE Issue
**Symptom:** Configuration not updated
**Solution:**
```bash
php artisan config:clear
php artisan cache:clear
# Restart PHP-FPM or container
```

## 📋 Quick Fix Command Sequence:

```bash
# Execute these in order:
cd /path/to/backend
php artisan route:clear
php artisan config:clear
php artisan cache:clear
php artisan optimize:clear
php artisan route:cache
docker-compose restart backend
php artisan route:list | grep diagnostic
```

## 🔬 Diagnostic Commands:

```bash
# 1. Check if file exists on server
ls -la backend/app/Http/Controllers/Api/ProctoringDiagnosticController.php

# 2. Check routes are loaded
php artisan route:list --path=proctoring-diagnostic

# 3. Check Laravel is using correct files
php artisan about

# 4. Test with verbose curl
curl -v https://www.libelslms.my.id/api/proctoring-diagnostic/health

# 5. Check PHP errors
tail -n 100 storage/logs/laravel.log
```

## 💡 Expected Behavior After Fix:

**Before:**
```
GET /api/proctoring-diagnostic/health
Response: 404 Not Found
```

**After:**
```
GET /api/proctoring-diagnostic/health
Response: 401 Unauthorized (because no token)
OR
Response: 200 OK (if token provided)
```

## ⚠️ MOST LIKELY CAUSE:

**Laravel route cache not cleared after adding new routes!**

Run this NOW:
```bash
php artisan route:clear && php artisan route:cache
```
