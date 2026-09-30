<?php

namespace App\Console\Commands;

use App\Models\MonitoringSnapshot;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Artisan command: proctoring:cleanup
 *
 * Enforces the snapshot retention policy defined in config/proctoring.php:
 *
 *  1. Delete physical files for non-violation snapshots whose expires_at has passed
 *     and mark file_deleted_at on the DB row (metadata stays as audit trail).
 *
 *  2. Optionally delete physical files for very old violation snapshots
 *     (only when --include-violations flag is given — not done automatically).
 *
 *  3. Clean up orphan files: image files in storage/app/public/monitoring-snapshots/
 *     that have no corresponding DB row.
 *
 * Safe to run multiple times (idempotent).
 */
class ProctoringCleanupCommand extends Command
{
    protected $signature = 'proctoring:cleanup
                            {--include-violations : Also delete files for violation snapshots (use with caution)}
                            {--dry-run            : Show what would be deleted without actually deleting}';

    protected $description = 'Delete expired proctoring snapshot files (keep metadata). Clean up orphan files.';

    public function handle(): int
    {
        $isDryRun          = (bool) $this->option('dry-run');
        $includeViolations = (bool) $this->option('include-violations');
        $disk              = Storage::disk('public');

        if ($isDryRun) {
            $this->info('[DRY RUN] No files will be deleted.');
        }

        $deleted      = 0;
        $orphansDeleted = 0;
        $errors       = 0;

        // ── 1. Delete expired non-violation snapshot files ────────────────────

        $query = MonitoringSnapshot::whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->whereNull('file_deleted_at');

        if (!$includeViolations) {
            $query->where('is_violation', false);
        }

        $this->info("Checking expired snapshots...");

        $query->chunkById(200, function ($snapshots) use ($disk, $isDryRun, &$deleted, &$errors) {
            foreach ($snapshots as $snapshot) {
                $path = $snapshot->image_path;

                if (!$path) {
                    // No file path recorded — just mark as deleted
                    if (!$isDryRun) {
                        $snapshot->update(['file_deleted_at' => now()]);
                    }
                    $deleted++;
                    continue;
                }

                if ($isDryRun) {
                    $this->line("  [DRY RUN] Would delete: {$path} (snapshot #{$snapshot->id})");
                    $deleted++;
                    continue;
                }

                try {
                    if ($disk->exists($path)) {
                        $disk->delete($path);
                    }

                    $snapshot->update(['file_deleted_at' => now()]);
                    $deleted++;
                } catch (\Throwable $e) {
                    $errors++;
                    Log::warning("[Proctoring:cleanup] Failed to delete {$path}: {$e->getMessage()}");
                    $this->warn("  Failed: {$path} — {$e->getMessage()}");
                }
            }
        });

        $this->info("Expired snapshots processed: {$deleted} (errors: {$errors})");

        // ── 2. Clean up orphan files ──────────────────────────────────────────

        $this->info("Scanning for orphan files in monitoring-snapshots/...");

        try {
            $files = $disk->files('monitoring-snapshots');

            // Build set of known image_path values from DB (chunked for memory safety)
            $knownPaths = [];
            MonitoringSnapshot::select('image_path')
                ->whereNotNull('image_path')
                ->chunkById(500, function ($rows) use (&$knownPaths) {
                    foreach ($rows as $row) {
                        $knownPaths[$row->image_path] = true;
                    }
                });

            foreach ($files as $file) {
                if (isset($knownPaths[$file])) {
                    continue; // File has a DB record — keep it
                }

                if ($isDryRun) {
                    $this->line("  [DRY RUN] Would delete orphan: {$file}");
                    $orphansDeleted++;
                    continue;
                }

                try {
                    $disk->delete($file);
                    $orphansDeleted++;
                } catch (\Throwable $e) {
                    $errors++;
                    Log::warning("[Proctoring:cleanup] Failed to delete orphan {$file}: {$e->getMessage()}");
                }
            }
        } catch (\Throwable $e) {
            $this->warn("Orphan scan failed: {$e->getMessage()}");
            Log::warning("[Proctoring:cleanup] Orphan scan failed: {$e->getMessage()}");
        }

        $this->info("Orphan files deleted: {$orphansDeleted}");

        // ── 3. Summary ────────────────────────────────────────────────────────

        $action = $isDryRun ? 'Would delete' : 'Deleted';
        $this->info("Done. {$action} {$deleted} expired + {$orphansDeleted} orphan files. Errors: {$errors}");

        Log::info("[Proctoring:cleanup] expired={$deleted} orphans={$orphansDeleted} errors={$errors} dry_run={$isDryRun}");

        return $errors > 0 ? Command::FAILURE : Command::SUCCESS;
    }
}
