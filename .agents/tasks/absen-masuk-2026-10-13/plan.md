# Implementation Plan — Absen Masuk (Staff/Guru Check-in with Location Validation)

Monorepo: `d:/project-amsp` (Laravel backend in `backend/`, Next.js frontend in `src/`).
Build/test commands discovered during exploration:
- Backend syntax: `php -l <file>` (run from `backend/`).
- Backend migrations + tests: `php artisan migrate` and `php artisan test` (or `composer test`) from `backend/`. PHPUnit 11, tests use `RefreshDatabase` + `Sanctum::actingAs`.
- Frontend: `npm run build` (Next.js build = type-check + compile), `npm run lint` (eslint src) from repo root.

Key codebase findings that shape this plan:
- ENUM ALTER pattern: migrations use a `private function supportsAlterModify(): bool { return in_array(DB::connection()->getDriverName(), ['mysql','mariadb'], true); }` helper and guard every `DB::statement("ALTER TABLE ... MODIFY COLUMN ... ENUM(...)")` with `if ($this->supportsAlterModify() && Schema::hasColumn(...))`. Column adds are guarded with `if (!Schema::hasColumn('users','jabatan'))`. See `2026_02_27_000001_alter_bank_questions_grade_level_add_semua.php`, `2025_01_20_000003_fix_exam_monitoring_schema.php`.
- `users` table: `role` is `ENUM('admin','guru','siswa') DEFAULT 'siswa'`; `nip` column exists (`after('nip')` is valid; `nomor_tes` was already added `after('nip')`).
- `SystemSetting` getter/setter pattern: `Cache::rememberForever(self::cacheKey(KEY), fn() => ...)` with `try/catch` fail-safe; setter does `self::updateOrCreate(['setting_key'=>KEY],['setting_value'=>...])` then `Cache::forever(...)`. Constants are `public const X_KEY = '...'`.
- `SchoolNetworkSetting::isSchoolNetwork(string $ip): bool` exists and works.
- `RoleMiddleware::handle(... string ...$roles)` uses `in_array($userRole, $roles)` — `role:guru,staff,admin` works once 'staff' is in the ENUM. No change needed.
- `BlockedStudentMiddleware` only blocks roles `['siswa','guru']`, so the new `staff` role passes unaffected.
- `DashboardLayout.tsx`: `ClipboardCheck` is ALREADY imported from `lucide-react`; navigation is a `NavItem[]` with `roles: string[]`. 'Sesi Absensi' sits at `roles:['guru']`; admin block has 'Kelola Ujian' (`/admin/ujian`).
- `src/services/api.ts`: named exports `xxxAPI = { ... }` using the shared `api` axios instance; last export is `graduationAPI`.
- `scan-qr/page.tsx`: device_id via `localStorage.getItem('device_id')`, generate with `btoa([navigator.userAgent, navigator.language, screen.width+'x'+screen.height, tzOffset].join('|')).slice(0,32)` and `setItem`.
- `AttendanceController` style: `$request->validate([...])`, `$request->user()`, `response()->json(['success'=>true,...])`, private `getRealClientIp(Request)` for forwarded-IP handling (reuse this for the staff controller).

Implementation order follows dependencies: migrations → models + model modifications → controller → routes → frontend api client → nav → three pages.

---

- [ ] 1. Migration: add `staff` role + `jabatan` column to `users`.
      Create `backend/database/migrations/2026_10_01_000001_add_staff_role_and_jabatan_to_users.php`. Anonymous class extending `Migration` with the `supportsAlterModify()` helper. `up()`: `DB::statement("ALTER TABLE users MODIFY COLUMN role ENUM('admin','guru','siswa','staff') DEFAULT 'siswa'")` guarded by `supportsAlterModify() && Schema::hasColumn('users','role')`; then `Schema::table('users', fn(Blueprint $t) => if(!Schema::hasColumn('users','jabatan')) $t->string('jabatan',100)->nullable()->after('nip'))`. `down()`: revert ENUM to `ENUM('admin','guru','siswa') DEFAULT 'siswa'` (same guard) and drop `jabatan` if present. All changes nullable/default — non-destructive.
      Files: `backend/database/migrations/2026_10_01_000001_add_staff_role_and_jabatan_to_users.php`
      Verify: from `backend/` run `php -l database/migrations/2026_10_01_000001_add_staff_role_and_jabatan_to_users.php` (no syntax error) and `php artisan migrate` (applies cleanly; re-running is idempotent — guards prevent duplicate column).

- [ ] 2. Migration: create `staff_attendance_schedules` table.
      Create `backend/database/migrations/2026_10_01_000002_create_staff_attendance_schedules_table.php`. Columns: `id`, `name` (string), `work_days` (json), `check_in_start` (time), `check_in_end` (time), `is_default` (boolean default false), `timestamps`. `down()`: `Schema::dropIfExists('staff_attendance_schedules')`.
      Files: `backend/database/migrations/2026_10_01_000002_create_staff_attendance_schedules_table.php`
      Verify: `php -l <file>` then `php artisan migrate` (table created).

- [ ] 3. Migration: create `staff_attendances` table.
      Create `backend/database/migrations/2026_10_01_000003_create_staff_attendances_table.php`. Columns: `id`; `user_id` `foreignId('user_id')->constrained('users')->cascadeOnDelete()`; `date` (date); `checked_in_at` (timestamp nullable); `latitude` `decimal(10,7)->nullable()`; `longitude` `decimal(10,7)->nullable()`; `ip_address` (string nullable); `location_method` `enum('gps','network','manual')->default('manual')`; `is_location_valid` (boolean default false); `distance_meters` (integer unsigned nullable); `device_id` (string nullable); `notes` (text nullable); `timestamps`. Add `unique(['user_id','date'])`. `down()`: drop table.
      Files: `backend/database/migrations/2026_10_01_000003_create_staff_attendances_table.php`
      Verify: `php -l <file>` then `php artisan migrate` (table + unique index created).

- [ ] 4. Model `StaffAttendance`.
      Create `backend/app/Models/StaffAttendance.php` extending `Model` (use `HasFactory`). `$fillable` = all columns listed in item 3. `casts()` returns `['date'=>'date','checked_in_at'=>'datetime','is_location_valid'=>'boolean']`. Relation `user(): belongsTo User::class`.
      Files: `backend/app/Models/StaffAttendance.php`
      Verify: `php -l app/Models/StaffAttendance.php` (no syntax error).

- [ ] 5. Model `StaffAttendanceSchedule`.
      Create `backend/app/Models/StaffAttendanceSchedule.php`. `$fillable = ['name','work_days','check_in_start','check_in_end','is_default']`. `casts()` returns `['work_days'=>'array','is_default'=>'boolean']`.
      Files: `backend/app/Models/StaffAttendanceSchedule.php`
      Verify: `php -l app/Models/StaffAttendanceSchedule.php` (no syntax error).

- [ ] 6. Modify `User` model.
      In `backend/app/Models/User.php`: add `'jabatan'` to the `$fillable` array; add `public function isStaff(): bool { return $this->role === 'staff'; }` near the other role helpers; add `public function staffAttendances() { return $this->hasMany(StaffAttendance::class); }` near the other relations. Do NOT touch existing methods or the student `attendances()` relation.
      Files: `backend/app/Models/User.php`
      Verify: `php -l app/Models/User.php` then `php artisan test` (existing tests still pass — no regressions).

- [ ] 7. Extend `SystemSetting` model.
      In `backend/app/Models/SystemSetting.php`, add five constants (`SCHOOL_LATITUDE_KEY='school_latitude'`, `SCHOOL_LONGITUDE_KEY='school_longitude'`, `STAFF_ATTENDANCE_RADIUS_KEY='staff_attendance_radius_meters'`, `STAFF_CHECKIN_START_KEY='staff_attendance_check_in_start'`, `STAFF_CHECKIN_END_KEY='staff_attendance_check_in_end'`) and static methods following the existing `Cache::rememberForever` (fail-safe `try/catch`) + `updateOrCreate`+`Cache::forever` pattern: `getSchoolCoordinates(): array` (returns `['latitude'=>float|null,'longitude'=>float|null]`), `setSchoolCoordinates(?float $lat, ?float $lng): void` (stores each as string, null stays null), `getStaffAttendanceRadius(): int` (default 100 when unset), `setStaffAttendanceRadius(int $meters): void`, `getStaffCheckInWindow(): array` (returns `['start'=>string|null,'end'=>string|null]`), `setStaffAttendanceSettings(array $data): void` (combined convenience setter calling the individual setters, accepting the same keys the `updateSettings` endpoint validates, then flushes the relevant cache keys). Do not remove existing constants/methods.
      Files: `backend/app/Models/SystemSetting.php`
      Verify: `php -l app/Models/SystemSetting.php` then `php artisan test` (existing setting tests, e.g. `SnapshotMonitorSettingTest`, still pass).

- [ ] 8. Controller `StaffAttendanceController`.
      Create `backend/app/Http/Controllers/Api/StaffAttendanceController.php` extending `App\Http\Controllers\Controller`. Import `StaffAttendance`, `StaffAttendanceSchedule`, `User`, `SystemSetting`, `SchoolNetworkSetting`, `Illuminate\Http\Request`, `Carbon\Carbon`, `Symfony\Component\HttpFoundation\StreamedResponse` (for CSV). Methods:
      - `checkIn(Request)`: validate `latitude nullable|numeric`, `longitude nullable|numeric`, `device_id nullable|string`, `notes nullable|string`. Get `$user = $request->user()`. If `StaffAttendance::where('user_id',$user->id)->whereDate('date', today())->exists()` → 422 "Anda sudah absen hari ini". Read window from `SystemSetting::getStaffCheckInWindow()`; if BOTH start and end are non-empty, parse current time `Carbon::now()` and reject with 422 when outside `[start, end]` (inclusive); if either is null/empty → SKIP window check. Get client IP via the same `getRealClientIp(Request)` private helper pattern as `AttendanceController`. Location validation: if latitude AND longitude provided → `location_method='gps'`; if school coords null (`getSchoolCoordinates()` latitude or longitude null) → skip validation, `is_location_valid=true`, `distance_meters=null`; else compute `haversineDistance()` and set `is_location_valid = $distance <= SystemSetting::getStaffAttendanceRadius()`. If latitude OR longitude missing → `location_method='network'`; `is_location_valid = SchoolNetworkSetting::isSchoolNetwork($ip)`; `distance_meters=null`. Create `StaffAttendance::create(['user_id','date'=>today()->toDateString(),'checked_in_at'=>now(),'latitude','longitude','ip_address','location_method','is_location_valid','distance_meters','device_id','notes'])`. Return `['success'=>true,'data'=>['checked_in_at','location_method','is_location_valid','distance_meters']]`.
      - private `haversineDistance(float $lat1,float $lon1,float $lat2,float $lon2): float`: standard formula, return meters.
      - private `getRealClientIp(Request): string`: copy the forwarded-IP logic from `AttendanceController`.
      - `todayStatus(Request)`: find today's record; return `['success'=>true,'data'=>['has_checked_in'=>bool,'checked_in_at'=>string|null,'location_method'=>string|null,'is_location_valid'=>bool]]`.
      - `myHistory(Request)`: `StaffAttendance::where('user_id',$user->id)->orderBy('date','desc')->paginate(30)` (30 per page); return `['success'=>true,'data'=>$history]`.
      - `adminIndex(Request)`: guard `$user->role==='admin'` (403 otherwise). Filters: `date` (default today), `role` (guru|staff|all, default all). Query `User::whereIn('role',['guru','staff'])` (or single role when filter set) `->select('id','name','nip','jabatan','role')`, leftJoin with `staff_attendances` on `users.id=staff_attendances.user_id AND date = $date`. Map rows to `{nama,nip,jabatan,role,checked_in_at|null,location_method|null,is_location_valid}`. Build summary `total`, `sudah_absen`, `belum_absen`. Return `['success'=>true,'data'=>['records'=>...,'summary'=>...]]`.
      - `adminExportCsv(Request)`: admin-only, same filters. Return a `StreamedResponse` with `Content-Type: text/csv` and `Content-Disposition: attachment`, prepend UTF-8 BOM (`\xEF\xBB\xBF`). Columns: No, Nama, NIP, Jabatan, Role, Tanggal, Jam Masuk, Metode Lokasi, Status. "Status" = "Hadir"/"Belum Absen".
      - `getSettings(Request)`: return `['success'=>true,'data'=>[...getSchoolCoordinates(),'radius_meters'=>getStaffAttendanceRadius(),...getStaffCheckInWindow()]]`.
      - `updateSettings(Request)`: validate `school_latitude nullable|numeric`, `school_longitude nullable|numeric`, `radius_meters integer|min:50|max:5000`, `check_in_start date_format:H:i`, `check_in_end date_format:H:i`. Call `SystemSetting::setStaffAttendanceSettings([...])`. Flush the affected cache keys. Return `['success'=>true,'message'=>'Pengaturan disimpan']`.
      Files: `backend/app/Http/Controllers/Api/StaffAttendanceController.php`
      Verify: `php -l app/Http/Controllers/Api/StaffAttendanceController.php` (no syntax error, no undefined variable); optionally `php artisan test` (no regressions).

- [ ] 9. Register routes in `api.php`.
      In `backend/routes/api.php`: add `use App\Http\Controllers\Api\StaffAttendanceController;` with the other `use` statements at top. Insert two route groups immediately AFTER the `// TEACHER (GURU) ROUTES` block (which closes before the STUDENT block). Group 1 (self check-in) `Route::middleware('role:guru,staff,admin')->group(...)`: POST `/staff-attendance/check-in` → `checkIn`, GET `/staff-attendance/today` → `todayStatus`, GET `/staff-attendance/history` → `myHistory`. Group 2 (admin) `Route::middleware('role:admin')->group(...)`, literal routes FIRST then the index last: GET `/staff-attendance/export` → `adminExportCsv`, GET `/staff-attendance/settings` → `getSettings`, POST `/staff-attendance/settings` → `updateSettings`, GET `/staff-attendance` → `adminIndex`. There is no `{id}` wildcard, but keep literal-before-index ordering to match the repo's documented convention.
      Files: `backend/routes/api.php`
      Verify: `php -l routes/api.php` then `php artisan route:list --path=staff-attendance` (all 7 routes listed with correct middleware); `php artisan test` (no regressions).

- [ ] 10. Frontend API client: `staffAttendanceAPI`.
      Append to `src/services/api.ts` (after the final `graduationAPI` export). Object with: `checkIn(data)`, `todayStatus()`, `myHistory(params?)`, `adminIndex(params?)`, `adminExportCsv(params?)` (`responseType:'blob'`), `getSettings()`, `updateSettings(data)`. Match the exact signatures and return-type generics from the task brief. Reuse the shared `api` instance.
      Files: `src/services/api.ts`
      Verify: from repo root `npm run build` (TypeScript compiles; no missing imports) and `npm run lint`.

- [ ] 11. Sidebar navigation in `DashboardLayout.tsx`.
      In `src/components/layouts/DashboardLayout.tsx` navigation array: add `{ name: 'Absen Masuk', href: '/absen-masuk', icon: ClipboardCheck, roles: ['guru','staff'] }` right after the 'Sesi Absensi' item. In the admin block, add `{ name: 'Absen Masuk Pegawai', href: '/admin/absen-masuk', icon: ClipboardCheck, roles: ['admin'] }` right after 'Kelola Ujian'. `ClipboardCheck` is already imported — no import change needed.
      Files: `src/components/layouts/DashboardLayout.tsx`
      Verify: `npm run build` (compiles) and `npm run lint`.

- [ ] 12. Staff/guru check-in page.
      Create `src/app/absen-masuk/page.tsx` (`'use client'`, default export wrapped in `<DashboardLayout>`). Flow: on mount call `staffAttendanceAPI.todayStatus()`; if `has_checked_in` show status card (jam masuk, metode, green badge) else show large teal/cyan "Absen Masuk Sekarang" button. On tap: call the GPS helper (`getLocation()` returning `Promise<{lat,lng}|null>` with 8s timeout resolving null on failure/denial), read/generate `device_id` from localStorage (same `btoa([...]).slice(0,32)` pattern as `scan-qr/page.tsx`), POST via `staffAttendanceAPI.checkIn({latitude,longitude,device_id})`, update state from response. Show 7-day mini history table below (tanggal, jam masuk, metode, status) from `staffAttendanceAPI.myHistory()`. Loading state during processing. Reuse `Card`/`CardHeader`/`Button` from `@/components/ui`.
      Files: `src/app/absen-masuk/page.tsx`
      Verify: `npm run build` (page compiles) and `npm run lint`.

- [ ] 13. Admin rekap page.
      Create `src/app/admin/absen-masuk/page.tsx` (`'use client'`, `<DashboardLayout>`). Heading "Absen Masuk Pegawai" + "Pengaturan" link to `/admin/absen-masuk/settings` + "Export CSV" button. Filters: date picker (default today), role select (Semua/Guru/Staff). Load via `staffAttendanceAPI.adminIndex({date,role})`. Summary cards: Total Pegawai, Sudah Absen, Belum Absen. Table: No, Nama, NIP, Jabatan, Role, Jam Masuk, Metode Lokasi, Status badge; rows not yet checked in highlighted light gray. Export CSV triggers download from `staffAttendanceAPI.adminExportCsv({date,role})` → create blob URL and click. Handle loading + error states.
      Files: `src/app/admin/absen-masuk/page.tsx`
      Verify: `npm run build` (page compiles) and `npm run lint`.

- [ ] 14. Admin settings page.
      Create `src/app/admin/absen-masuk/settings/page.tsx` (`'use client'`, `<DashboardLayout>`). Form fields: Latitude Sekolah, Longitude Sekolah, Radius (meter), Jam Mulai (`<input type="time">`), Jam Akhir (`<input type="time">`). Load via `staffAttendanceAPI.getSettings()` on mount. Save via `staffAttendanceAPI.updateSettings({...})`. Include an info block with guidance on finding coordinates via Google Maps (right-click → coordinates). Show save success/error feedback.
      Files: `src/app/admin/absen-masuk/settings/page.tsx`
      Verify: `npm run build` (page compiles) and `npm run lint`.

---

## Location-validation rules (encode exactly in `checkIn`)
1. If `latitude` AND `longitude` are present → `location_method='gps'`.
   - If school coordinates (`SystemSetting::getSchoolCoordinates()`) latitude OR longitude is null → SKIP validation, `is_location_valid=true`, `distance_meters=null` (never block when school not configured).
   - Else compute Haversine distance; `is_location_valid = distance <= SystemSetting::getStaffAttendanceRadius()`; `distance_meters = (int) round(distance)`.
2. If `latitude` OR `longitude` is missing → `location_method='network'`; `is_location_valid = SchoolNetworkSetting::isSchoolNetwork($clientIp)`; `distance_meters=null`.
3. Check-in time window: read `SystemSetting::getStaffCheckInWindow()`. If BOTH `start` and `end` are non-empty, compare `Carbon::now()` against the window (inclusive); reject outside with 422. If EITHER is null/empty → SKIP the window check (never block when window unconfigured).

## Idempotency / safety rules
- Every `ALTER ... MODIFY COLUMN` ENUM statement is guarded by `supportsAlterModify() && Schema::hasColumn(...)`.
- Every `Schema::table` column addition is guarded by `if (!Schema::hasColumn(...))`.
- `down()` only reverts what `up()` did; no destructive `DROP COLUMN` beyond the new `jabatan`. Do not drop existing student attendance tables/methods.

## Route ordering rule
- Inside the admin group, register literal routes (`/staff-attendance/export`, `/staff-attendance/settings`) before the index route `/staff-attendance`, matching the repo's repeated "literal routes MUST be before wildcard" convention. The self-check-in group has no wildcards; order within it is free.

## Verification summary
- After items 1–9 (backend): from `backend/` run `php -l` on each new/modified PHP file, then `php artisan migrate`, then `php artisan test` (existing suite passes — no regressions; existing `AttendanceController` untouched).
- After items 10–14 (frontend): from repo root run `npm run build` and `npm run lint` (clean compile, no missing imports).

## Risks
- ENUM ALTER is MySQL/MariaDB-only; the `supportsAlterModify()` guard means SQLite (used by the test suite) silently skips the ALTER — tests that rely on the literal DB ENUM value for 'staff' won't see it on SQLite, but Laravel stores the string regardless of the column ENUM on SQLite, so role assignment still works in tests. Note this if adding a 'staff'-role test.
- The global middleware stack includes `blocked.student`, which only blocks `['siswa','guru']` — `staff` is unaffected, so staff check-in will not be blocked even if `is_blocked` is set (acceptable; blocking is student/teacher-scoped).
- GPS in browser requires HTTPS (or localhost) for `navigator.geolocation`; production over HTTPS is fine, but note for local `npm run dev` over plain HTTP on a LAN IP.
- No destructive migration changes; re-running all migrations must be safe (guards).
