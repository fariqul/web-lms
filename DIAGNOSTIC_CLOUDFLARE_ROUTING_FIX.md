# Proctoring Diagnostic API - Cloudflare Routing Fix

## Problem Identified

**Issue**: Requests to `https://www.libelslms.my.id/api/proctoring-diagnostic/health` return Next.js 404 page instead of reaching Laravel backend.

**Root Cause**: Cloudflare is routing `/api/*` requests to **Vercel (Next.js)** instead of **Home Server (Nginx → Laravel)**.

### Evidence:
```powershell
PS> curl https://www.libelslms.my.id/api/proctoring-diagnostic/health
# Returns HTML with "Halaman Tidak Ditemukan" and "Dashboard" button (Next.js 404)
```

vs what should happen:
```bash
# Should return 401 (Unauthorized) or 200 OK from Laravel
{"status": "ok", ...}
```

### Why This Happens:
- **Vercel** hosts the Next.js frontend at `www.libelslms.my.id`
- **Cloudflare Tunnel** routes home server at same domain
- Cloudflare/DNS is sending ALL traffic to Vercel first
- Vercel tries to handle `/api/*` routes and returns 404 (no Next.js API route exists)
- Traffic never reaches your home server nginx

---

## Solution Options

### Option 1: Use Subdomain for Backend API (Recommended)

Route API requests to a separate subdomain that points to your home server.

**Setup:**

1. **Update Cloudflare Tunnel to use API subdomain**:
   - Go to Cloudflare Zero Trust Dashboard
   - Find your tunnel configuration
   - Change public hostname from `www.libelslms.my.id` to `api.libelslms.my.id`
   - Service: `http://nginx:80`

2. **Update frontend API calls**:
   - Change base URL from `/api/` to `https://api.libelslms.my.id/api/`
   - Or use environment variable:
     ```env
     NEXT_PUBLIC_API_BASE_URL=https://api.libelslms.my.id
     ```

3. **Update Laravel CORS settings** (`backend/config/cors.php`):
   ```php
   'allowed_origins' => [
       'https://www.libelslms.my.id',
       'https://libelslms.my.id',
       'https://web-lms-rowr.vercel.app',
   ],
   ```

**Pros:**
- Clean separation of concerns
- No routing conflicts
- Easy to debug (clear which service handles what)

**Cons:**
- Requires updating all API calls in frontend
- Need to configure CORS properly

---

### Option 2: Use Vercel Rewrites (Quick Fix)

Configure Vercel to proxy `/api/*` requests to your home server.

**Setup:**

1. **Create/update `vercel.json` in project root**:
   ```json
   {
     "rewrites": [
       {
         "source": "/api/:path*",
         "destination": "https://your-tunnel-domain.trycloudflare.com/api/:path*"
       }
     ]
   }
   ```

2. **Find your Cloudflare Tunnel URL**:
   ```bash
   docker compose logs cloudflared | grep "https://"
   ```
   Look for something like: `https://random-words-12345.trycloudflare.com`

3. **Update Cloudflare Tunnel CORS** (if needed):
   - Allow `https://www.libelslms.my.id` and `https://*.vercel.app` origins

**Pros:**
- No frontend code changes needed
- Maintains `/api/*` URL structure

**Cons:**
- Extra hop (Vercel → Cloudflare → Nginx → Laravel)
- Increased latency
- Vercel may have timeout limits for proxied requests

---

### Option 3: Configure Cloudflare Page Rules (Advanced)

Use Cloudflare Page Rules to route `/api/*` differently.

**Setup:**

1. **Create Page Rule in Cloudflare Dashboard**:
   - URL: `www.libelslms.my.id/api/*`
   - Setting: Resolve Override → Point to your Cloudflare Tunnel

2. **Ensure Tunnel is accessible**:
   - Tunnel must have public hostname configured
   - Example: `tunnel.libelslms.my.id` → Your nginx

3. **Update DNS (if needed)**:
   - Add CNAME: `tunnel.libelslms.my.id` → `[your-tunnel-id].cfargotunnel.com`

**Pros:**
- No code changes
- Handles routing at DNS/proxy level

**Cons:**
- Complex setup
- Requires Cloudflare paid plan for Page Rules
- Can be hard to debug

---

## Recommended Solution: Option 1 (Subdomain)

This is the cleanest and most maintainable solution.

### Step-by-Step Implementation:

#### 1. Configure Cloudflare Tunnel for API Subdomain

**A. Find your tunnel configuration:**
```bash
# On your server
docker compose logs cloudflared | grep -i "tunnel"
```

**B. Update tunnel via Cloudflare Dashboard:**
1. Go to [Cloudflare Zero Trust](https://one.dash.cloudflare.com/)
2. Access → Tunnels → [Your Tunnel Name]
3. Add/Edit Public Hostname:
   - **Subdomain**: `api`
   - **Domain**: `libelslms.my.id`
   - **Service**: `HTTP` → `nginx:80`

**C. Verify DNS Record:**
- Should auto-create: `api.libelslms.my.id` → `[tunnel-id].cfargotunnel.com`

#### 2. Update Frontend Environment Variables

**In Vercel:**
1. Project Settings → Environment Variables
2. Add:
   ```
   NEXT_PUBLIC_API_BASE_URL=https://api.libelslms.my.id
   ```
3. Redeploy

**For local development** (`.env.local`):
```env
NEXT_PUBLIC_API_BASE_URL=https://api.libelslms.my.id
```

#### 3. Update API Request Helper

**Create/Update `src/lib/api.ts`:**
```typescript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

export function getApiUrl(endpoint: string): string {
  // Remove leading slash if present
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `${API_BASE_URL}/${cleanEndpoint}`;
}

// Usage in components:
// fetch(getApiUrl('api/proctoring-diagnostic/health'))
```

**Or update existing request wrapper:**
```typescript
// src/lib/requests.ts or similar
const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

export const api = {
  get: (url: string) => fetch(`${baseURL}${url}`, { ... }),
  post: (url: string, data: any) => fetch(`${baseURL}${url}`, { method: 'POST', ... }),
  // ...
};
```

#### 4. Update Backend CORS Configuration

**Edit `backend/.env`:**
```env
SANCTUM_STATEFUL_DOMAINS=www.libelslms.my.id,libelslms.my.id,api.libelslms.my.id,web-lms-rowr.vercel.app
CORS_ALLOWED_ORIGINS=https://www.libelslms.my.id,https://libelslms.my.id,https://api.libelslms.my.id,https://web-lms-rowr.vercel.app
FRONTEND_URL=https://www.libelslms.my.id
```

**Restart backend:**
```bash
docker compose restart backend
docker compose exec backend php artisan config:clear
```

#### 5. Test the Setup

**A. Test API endpoint directly:**
```bash
curl https://api.libelslms.my.id/api/health
# Should return: {"status":"ok",...}
```

**B. Test diagnostic endpoint (requires auth token):**
```bash
curl https://api.libelslms.my.id/api/proctoring-diagnostic/health \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**C. Test from frontend:**
- Open diagnostic tool: `https://www.libelslms.my.id/admin/proctoring-diagnostic`
- Check browser console - should see requests to `api.libelslms.my.id`
- Health monitor should show green status

---

## Quick Verification Steps

### 1. Check where `/api/*` requests are going:

```bash
# From your local PC
curl -I https://www.libelslms.my.id/api/health

# If you see Next.js response or 404 HTML, it's going to Vercel
# If you see Laravel JSON, it's reaching your server
```

### 2. Check Cloudflare Tunnel status:

```bash
# On server
docker compose ps cloudflared
docker compose logs cloudflared | tail -20
```

### 3. Check nginx is receiving requests:

```bash
# On server - monitor nginx logs
docker compose logs -f nginx

# Make request from another terminal
curl https://www.libelslms.my.id/api/health

# You should see log entry if nginx received it
# If no log entry, traffic isn't reaching nginx
```

### 4. Verify Laravel routes exist:

```bash
# On server
docker compose exec backend php artisan route:list | grep diagnostic
# Should show 7 routes
```

---

## Current State Diagnosis

Based on your outputs:

✅ **Laravel routes registered**: `php artisan route:list` shows all 7 diagnostic routes  
✅ **Controller exists**: `ProctoringDiagnosticController.php` is in correct location  
✅ **Nginx config correct**: `/api/` proxies to backend_pool  
✅ **Docker containers running**: All services up  
❌ **Requests not reaching server**: curl returns Next.js 404 HTML  

**Conclusion**: Traffic routing issue at Cloudflare/DNS level, not Laravel or Nginx.

---

## Immediate Action Item

**Implement Option 1 (Subdomain)** as it's the most reliable solution:

1. ✅ Add `api.libelslms.my.id` public hostname to Cloudflare Tunnel
2. ✅ Update frontend environment variable: `NEXT_PUBLIC_API_BASE_URL=https://api.libelslms.my.id`
3. ✅ Update backend CORS to allow `api.libelslms.my.id`
4. ✅ Test and verify

**Estimated time**: 15-20 minutes to implement and test

---

## Alternative: Keep Using `www.libelslms.my.id/api/*` (Complex)

If you want to keep the current URL structure, you need to:

1. **Remove Vercel from `www.libelslms.my.id`** entirely
2. **Point `www.libelslms.my.id` DNS to Cloudflare Tunnel only**
3. **Configure Nginx to proxy frontend requests to Vercel**:
   ```nginx
   # In nginx/default.conf
   upstream vercel_pool {
       server web-lms-rowr.vercel.app:443;
   }
   
   location / {
       # Check if it's an API request
       if ($request_uri ~ ^/api/) {
           proxy_pass http://backend_pool;
           break;
       }
       # Otherwise proxy to Vercel
       proxy_pass https://vercel_pool;
       proxy_ssl_server_name on;
       proxy_set_header Host web-lms-rowr.vercel.app;
   }
   ```

**However, this is NOT recommended** because:
- Nginx can't easily proxy HTTPS to external services (Vercel)
- Adds complexity and debugging difficulty
- Vercel already handles frontend efficiently

**Use Option 1 (subdomain) instead.**

---

## Need Help?

If you encounter issues:

1. Share Cloudflare Tunnel logs: `docker compose logs cloudflared`
2. Share DNS records for `libelslms.my.id` domain
3. Test both:
   - `curl https://www.libelslms.my.id/api/health`
   - `curl https://api.libelslms.my.id/api/health` (after setup)
4. Check Cloudflare Zero Trust dashboard → Tunnels → Public Hostnames

---

**Summary**: Your Laravel backend is working perfectly. The issue is traffic routing - requests to `/api/*` are being sent to Vercel instead of your home server. Use subdomain `api.libelslms.my.id` for backend API to cleanly separate routing.
