# Complete Guide - Fix API Routing Issue

## Status: Cloudflare + Vercel Sudah Dikonfigurasi Tapi Masih 404

Berdasarkan screenshot yang Anda kirim, ada beberapa masalah konfigurasi.

---

## Masalah yang Teridentifikasi:

### 1. ❌ Cloudflare Tunnel - Catch-all Rule HTTP 404
**Screenshot menunjukkan:**
```
Catch-all rule: http_status:404
```

**Ini SALAH!** Semua request yang tidak match dengan `api.libelslms.my.id` akan return 404.

### 2. ❌ Vercel Environment Variable Salah
**Screenshot menunjukkan:**
```
NEXT_PUBLIC_API_URL = https://api.libelslms.my.id/api  ← SALAH! Ada duplikasi /api
```

### 3. ⚠️ Socket URL Salah
```
NEXT_PUBLIC_SOCKET_URL = https://api.libelslms.my.id  ← SALAH! Socket bukan di api subdomain
```

---

## Solusi Lengkap (Step-by-Step):

### STEP 1: Perbaiki Cloudflare Tunnel

#### A. Hapus atau Ubah Catch-all Rule 404

**Opsi 1: Hapus Catch-all Rule (Recommended)**
1. Go to Cloudflare Zero Trust Dashboard
2. Access → Tunnels → [Your Tunnel] → Public Hostnames
3. **Delete** the catch-all rule yang return `http_status:404`
4. Save

**Opsi 2: Ubah Catch-all Route ke Frontend**
1. Edit catch-all rule
2. Change to: Service = `HTTPS` → `web-lms-rowr.vercel.app`
3. Save

**Catatan**: Opsi 1 lebih baik karena DNS langsung handle routing ke Vercel.

#### B. Verifikasi Public Hostnames

Pastikan Anda punya **HANYA** satu hostname:

```
Hostname: api.libelslms.my.id
Path: * (atau kosong)
Service: http://nginx:80
```

**JANGAN** tambahkan hostname untuk `www.libelslms.my.id` di tunnel - biarkan DNS mengarah langsung ke Vercel.

---

### STEP 2: Perbaiki Vercel Environment Variables

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables

2. **Edit/Update** these variables:

```env
NEXT_PUBLIC_API_URL=https://api.libelslms.my.id
# ↑ TANPA /api di akhir!

BACKEND_URL=https://api.libelslms.my.id
# ↑ Sudah benar

NEXT_PUBLIC_SOCKET_URL=https://www.libelslms.my.id
# ↑ Socket tetap di www karena nginx di home server yang handle websocket

NEXT_PUBLIC_APP_URL=https://www.libelslms.my.id
# ↑ Frontend URL
```

3. **Apply to all environments**: Production, Preview, Development

4. **Redeploy** (penting!)
   - Go to Deployments tab
   - Click "..." on latest deployment
   - Click "Redeploy"

---

### STEP 3: Update Backend CORS (di Server)

Connect ke server Anda dan edit `.env`:

```bash
# Di server
cd /path/to/lms-server
nano backend/.env
```

Update CORS settings:

```env
SANCTUM_STATEFUL_DOMAINS=www.libelslms.my.id,libelslms.my.id,api.libelslms.my.id,web-lms-rowr.vercel.app
CORS_ALLOWED_ORIGINS=https://www.libelslms.my.id,https://libelslms.my.id,https://api.libelslms.my.id,https://web-lms-rowr.vercel.app
FRONTEND_URL=https://www.libelslms.my.id
```

Restart backend:

```bash
docker compose restart backend
docker compose exec backend php artisan config:clear
docker compose exec backend php artisan cache:clear
```

---

### STEP 4: Verifikasi DNS Records di Cloudflare

Go to Cloudflare Dashboard → Your Domain → DNS → Records

**Pastikan ada 3 records:**

1. **api.libelslms.my.id**
   - Type: `CNAME`
   - Target: `[your-tunnel-id].cfargotunnel.com`
   - Proxy status: Proxied (orange cloud)

2. **www.libelslms.my.id**
   - Type: `CNAME`
   - Target: `cname.vercel-dns.com`
   - Proxy status: Proxied (orange cloud)

3. **libelslms.my.id** (apex/root)
   - Type: `CNAME`
   - Target: `cname.vercel-dns.com`
   - Proxy status: Proxied (orange cloud)

**JANGAN** ada DNS record untuk `www` yang pointing ke tunnel!

---

### STEP 5: Test Endpoint

**A. Test API Subdomain (Backend)**

```bash
# Test health endpoint (public)
curl https://api.libelslms.my.id/api/health

# Expected response:
{"status":"ok","timestamp":"...","service":"SMA 15 Makassar LMS API"}
```

**B. Test Diagnostic Endpoint (Requires Auth)**

```bash
# Di browser, login sebagai admin dulu
# Lalu di console:
const token = localStorage.getItem('token');
console.log(token); // Copy token

# Kemudian di terminal:
curl https://api.libelslms.my.id/api/proctoring-diagnostic/health \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Expected response (jika auth valid):
{"success":true,"data":{...}}

# OR (jika tidak auth/token invalid):
{"message":"Unauthenticated."}
```

**C. Test dari Frontend**

1. Login sebagai admin
2. Go to: `https://www.libelslms.my.id/admin/proctoring-diagnostic`
3. Open Browser DevTools (F12) → Network tab
4. Lihat requests ke diagnostic endpoints
5. **Harusnya:**
   - Request URL: `https://api.libelslms.my.id/api/proctoring-diagnostic/health`
   - Status: `200 OK` (bukan 404)

---

## Troubleshooting Common Issues

### Issue 1: Still Getting 404 After All Steps

**Check 1: Cache**
```bash
# Clear Cloudflare cache
# Go to Cloudflare Dashboard → Caching → Configuration → Purge Everything

# Clear browser cache
# Chrome: Ctrl+Shift+Delete → Clear all cached images and files
```

**Check 2: Vercel Deployment**
```bash
# Make sure latest deployment is using new env variables
# Go to Vercel → Deployments → Latest deployment
# Check: "Environment Variables" section shows correct values
```

**Check 3: DNS Propagation**
```bash
# Check DNS resolution
nslookup api.libelslms.my.id
# Should show Cloudflare IP (tunnel)

nslookup www.libelslms.my.id
# Should show Vercel IP
```

### Issue 2: CORS Error in Browser

**Symptoms:**
```
Access to fetch at 'https://api.libelslms.my.id/api/...' from origin 'https://www.libelslms.my.id' 
has been blocked by CORS policy
```

**Fix:**
1. Check backend `.env` CORS settings (STEP 3 above)
2. Restart backend container
3. Clear browser cache
4. Try again

### Issue 3: Vercel Still Making Requests to Wrong URL

**Check:**
```javascript
// In browser console
console.log(process.env.NEXT_PUBLIC_API_URL);
// Should show: https://api.libelslms.my.id
```

**If undefined or wrong:**
1. Make sure you **redeployed** after changing env variables
2. Environment variables only apply to **new deployments**, not existing ones
3. Go to Vercel → Deployments → Redeploy latest

### Issue 4: `vercel.json` Rewrite Conflict

Your `vercel.json` has a rewrite rule that might cause conflict:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://www.libelslms.my.id/api/:path*"
    }
  ]
}
```

**This creates infinite loop!** `/api/*` on Vercel redirects to `www.libelslms.my.id/api/*` (which is also Vercel).

**Fix: Remove this rewrite rule**

Since we're using `NEXT_PUBLIC_API_URL` environment variable, we don't need vercel.json rewrites.

**Update `vercel.json` to:**
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs"
}
```

Then commit and push.

---

## Final Verification Checklist

After completing all steps, verify:

- [ ] Cloudflare Tunnel: No catch-all 404 rule
- [ ] Cloudflare Tunnel: Only `api.libelslms.my.id` → `nginx:80`
- [ ] Cloudflare DNS: `api` CNAME → tunnel, `www` CNAME → Vercel
- [ ] Vercel Env: `NEXT_PUBLIC_API_URL=https://api.libelslms.my.id` (no `/api` suffix)
- [ ] Vercel: Redeployed after env change
- [ ] Backend: CORS includes `api.libelslms.my.id`
- [ ] Backend: Restarted containers
- [ ] Test: `curl https://api.libelslms.my.id/api/health` returns JSON
- [ ] Test: Frontend diagnostic page works without 404 errors
- [ ] Browser DevTools: Requests go to `api.libelslms.my.id`, not `www`

---

## Expected Final Architecture

```
User Browser
    ↓
Cloudflare
    ↓
    ├── www.libelslms.my.id/* → Vercel (Next.js Frontend)
    │                             ↓
    │                        Uses NEXT_PUBLIC_API_URL
    │                             ↓
    └── api.libelslms.my.id/* → Cloudflare Tunnel
                                    ↓
                                 Nginx (Home Server)
                                    ↓
                                 Laravel Backend
```

**Key Points:**
- Frontend requests to `/api/*` are rewritten by our code to `https://api.libelslms.my.id/api/*`
- No Vercel rewrites (that was causing problems)
- Clean separation: `www` = frontend, `api` = backend
- Socket still on `www` via nginx upstream (existing setup)

---

## Quick Commands Reference

```bash
# On server - check tunnel logs
docker compose logs cloudflared | tail -50

# On server - check nginx logs
docker compose logs nginx | tail -50

# On server - restart services
docker compose restart backend nginx

# On server - clear Laravel cache
docker compose exec backend php artisan config:clear
docker compose exec backend php artisan route:clear
docker compose exec backend php artisan cache:clear

# Test API from terminal
curl https://api.libelslms.my.id/api/health
curl https://www.libelslms.my.id/api/health  # Should also work if vercel.json removed

# Check DNS
nslookup api.libelslms.my.id
nslookup www.libelslms.my.id
```

---

## If Still Not Working

Share these outputs:

1. **Cloudflare Tunnel Public Hostnames** (screenshot or list)
2. **Cloudflare DNS Records** for `libelslms.my.id`
3. **Vercel Environment Variables** (screenshot - hide sensitive values)
4. **Current `vercel.json` content**
5. **Test results:**
   ```bash
   curl -I https://api.libelslms.my.id/api/health
   curl -I https://www.libelslms.my.id/api/health
   ```
6. **Browser Console errors** when accessing diagnostic page

---

**Estimated Total Time**: 15-20 minutes untuk semua steps

**Critical Steps** (paling penting):
1. Hapus catch-all 404 rule di Cloudflare
2. Fix `NEXT_PUBLIC_API_URL` di Vercel (tanpa `/api` suffix)
3. Redeploy Vercel setelah ubah env variable
4. Remove vercel.json rewrite rule (infinite loop)
