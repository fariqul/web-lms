# Admin Users Toolbar + Import Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merapikan toolbar tombol di halaman Admin Kelola Pengguna agar responsif, serta menambahkan fitur download template import users (XLSX/CSV) dari UI dan backend.

**Architecture:** Implementasi dibagi menjadi tiga unit: (1) backend endpoint template + route admin-only, (2) frontend API client untuk download template, (3) UI users page untuk layout toolbar responsif dan tombol download template di modal import. Jalur implementasi memakai TDD untuk endpoint template backend agar perilaku format/validasi terdokumentasi lewat test.

**Tech Stack:** Laravel 12, PhpSpreadsheet, Next.js 16, React 19, TypeScript, Tailwind CSS.

---

## File Structure & Responsibilities

- **Modify** `backend/tests/Feature/UserImportExportTest.php`
  - Tambah test baru untuk endpoint `GET /api/users/import-template`.
  - Validasi skenario CSV, XLSX, dan format invalid.

- **Modify** `backend/app/Http/Controllers/Api/UserController.php`
  - Tambah method `importTemplate(Request $request)` untuk generate template users.
  - Reuse pola streaming CSV/XLSX yang sudah dipakai endpoint export.

- **Modify** `backend/routes/api.php`
  - Daftarkan route admin-only: `GET /users/import-template`.

- **Modify** `src/services/api.ts`
  - Tambah method `userAPI.downloadImportTemplate(format)` dengan `responseType: 'blob'`.

- **Modify** `src/app/admin/users/page.tsx`
  - Rapikan toolbar action dengan wrapper responsif `flex-wrap`.
  - Tambah tombol Download Template XLSX/CSV di modal import.
  - Tambah handler download template.

---

### Task 1: Tambah failing test endpoint template users

**Files:**
- Modify: `backend/tests/Feature/UserImportExportTest.php`

- [ ] **Step 1: Tulis test gagal untuk CSV, XLSX, dan format invalid**

```php
public function test_admin_can_download_user_import_template_as_csv(): void
{
    $classId = $this->createClassRoom('X Template CSV');
    $admin = $this->createAdmin($classId, 'template-csv-admin');
    Sanctum::actingAs($admin);

    $this->get('/api/users/import-template?format=csv', [
        'Accept' => 'application/json',
    ])
        ->assertOk()
        ->assertHeader('content-type', 'text/csv; charset=UTF-8');
}

public function test_admin_can_download_user_import_template_as_xlsx(): void
{
    $classId = $this->createClassRoom('X Template XLSX');
    $admin = $this->createAdmin($classId, 'template-xlsx-admin');
    Sanctum::actingAs($admin);

    $this->get('/api/users/import-template?format=xlsx', [
        'Accept' => 'application/json',
    ])
        ->assertOk()
        ->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

public function test_user_import_template_rejects_invalid_format(): void
{
    $classId = $this->createClassRoom('X Template Invalid');
    $admin = $this->createAdmin($classId, 'template-invalid-admin');
    Sanctum::actingAs($admin);

    $this->getJson('/api/users/import-template?format=pdf')
        ->assertStatus(422);
}
```

- [ ] **Step 2: Jalankan test target dan pastikan gagal**

Run:
```bash
cd backend
php artisan test --filter=UserImportExportTest
```

Expected: FAIL karena route/method `users/import-template` belum ada.

- [ ] **Step 3: Commit perubahan test (failing test)**

```bash
git add backend/tests/Feature/UserImportExportTest.php
git commit -m "test: add failing tests for user import template endpoint"
```

---

### Task 2: Implement endpoint backend template users

**Files:**
- Modify: `backend/app/Http/Controllers/Api/UserController.php`
- Modify: `backend/routes/api.php`

- [ ] **Step 1: Tambah route admin-only untuk template import**

```php
// backend/routes/api.php (dalam group admin)
Route::get('/users/import-template', [UserController::class, 'importTemplate']);
```

- [ ] **Step 2: Tambah method `importTemplate` di UserController**

```php
public function importTemplate(Request $request)
{
    $request->validate([
        'format' => 'nullable|in:xlsx,csv',
    ]);

    $format = (string) ($request->input('format') ?: 'xlsx');
    $headers = ['nama', 'email', 'role', 'jenis_kelamin', 'nisn', 'nis', 'nip', 'nomor_tes', 'class_name', 'class_id'];
    $example = ['Budi Santoso', 'budi.santoso@example.com', 'siswa', 'L', '1234567890', '22001', '', 'TES-001', 'X IPA 1', '1'];

    if ($format === 'csv') {
        return response()->streamDownload(function () use ($headers, $example) {
            $handle = fopen('php://output', 'wb');
            fprintf($handle, chr(0xEF) . chr(0xBB) . chr(0xBF));
            fputcsv($handle, $headers);
            fputcsv($handle, $example);
            fclose($handle);
        }, 'users_import_template.csv', [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    $spreadsheet = new Spreadsheet();
    $sheet = $spreadsheet->getActiveSheet();
    $sheet->setTitle('Template Users');
    foreach ($headers as $i => $header) {
        $sheet->setCellValue([$i + 1, 1], $header);
    }
    foreach ($example as $i => $value) {
        $sheet->setCellValue([$i + 1, 2], $value);
    }

    return response()->streamDownload(function () use ($spreadsheet) {
        $writer = new Xlsx($spreadsheet);
        $writer->save('php://output');
    }, 'users_import_template.xlsx', [
        'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]);
}
```

- [ ] **Step 3: Jalankan test target dan pastikan pass**

Run:
```bash
cd backend
php artisan test --filter=UserImportExportTest
```

Expected: PASS untuk test template baru + test import/export users yang sudah ada.

- [ ] **Step 4: Commit implementasi backend**

```bash
git add backend/app/Http/Controllers/Api/UserController.php backend/routes/api.php
git commit -m "feat: add admin user import template download endpoint"
```

---

### Task 3: Rapikan toolbar users + tombol download template di modal import

**Files:**
- Modify: `src/services/api.ts`
- Modify: `src/app/admin/users/page.tsx`

- [ ] **Step 1: Tambah method API client download template**

```ts
// src/services/api.ts
downloadImportTemplate: (format: 'xlsx' | 'csv') =>
  api.get('/users/import-template', {
    params: { format },
    responseType: 'blob',
    timeout: 120000,
  }),
```

- [ ] **Step 2: Buat handler download template di users page**

```ts
const handleDownloadImportTemplate = async (format: 'xlsx' | 'csv') => {
  try {
    const res = await userAPI.downloadImportTemplate(format);
    const blob = res.data as Blob;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `users_import_template.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Template ${format.toUpperCase()} berhasil didownload`);
  } catch (error: unknown) {
    toast.error(getApiErrorMessage(error, 'Gagal download template import'));
  }
};
```

- [ ] **Step 3: Rapikan wrapper toolbar agar responsif**

```tsx
// sebelum: <div className="flex gap-2">
<div className="flex flex-wrap items-center gap-2">
  {/* tombol existing tanpa perubahan urutan */}
</div>
```

- [ ] **Step 4: Tambah tombol Download Template di modal import users**

```tsx
<div className="flex flex-wrap gap-2">
  <Button type="button" variant="outline" onClick={() => handleDownloadImportTemplate('xlsx')}>
    Download Template XLSX
  </Button>
  <Button type="button" variant="outline" onClick={() => handleDownloadImportTemplate('csv')}>
    Download Template CSV
  </Button>
</div>
```

- [ ] **Step 5: Jalankan lint frontend**

Run:
```bash
npm run lint
```

Expected: PASS tanpa error lint baru pada `src/app/admin/users/page.tsx` dan `src/services/api.ts`.

- [ ] **Step 6: Commit implementasi frontend**

```bash
git add src/services/api.ts src/app/admin/users/page.tsx
git commit -m "feat: make users toolbar responsive and add import template download"
```

---

### Task 4: Verifikasi akhir regresi

**Files:**
- Test command only (no new files required)

- [ ] **Step 1: Jalankan seluruh test backend**

Run:
```bash
cd backend
php artisan test
```

Expected: PASS, termasuk `UserImportExportTest`.

- [ ] **Step 2: Jalankan lint + build frontend**

Run:
```bash
cd ..
npm run lint
npm run build
```

Expected: PASS (warning existing non-blocking diperbolehkan jika memang sudah baseline).

- [ ] **Step 3: Commit final verification marker**

```bash
git add -A
git commit -m "chore: finalize users toolbar and template import updates"
```

---

## Self-Review Plan vs Spec

- **Spec coverage:** semua requirement tercakup (toolbar responsif, template XLSX+CSV, endpoint admin-only, validasi invalid format, dan test).
- **Placeholder scan:** tidak ada TBD/TODO; semua task berisi langkah, code, command, dan output ekspektasi.
- **Type consistency:** signature method `importTemplate` dan `downloadImportTemplate` konsisten dipakai di task backend/frontend.
