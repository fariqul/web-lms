<?php

namespace App\Console\Commands;

use App\Models\MonitoringSnapshot;
use App\Models\Violation;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class PrivatizeProctoringSnapshotsCommand extends Command
{
    protected $signature = 'proctoring:privatize-snapshots
                            {--dry-run : Show what would be moved without moving files}';

    protected $description = 'Move legacy snapshot files from the public disk to the private disk.';

    public function handle(): int
    {
        $isDryRun = (bool) $this->option('dry-run');
        $private = Storage::disk('local');
        $public = Storage::disk('public');

        $moved = 0;
        $alreadyPrivate = 0;
        $missing = 0;
        $errors = 0;

        $paths = collect();

        MonitoringSnapshot::query()
            ->whereNotNull('image_path')
            ->select(['id', 'image_path'])
            ->chunkById(500, function ($rows) use ($paths) {
                foreach ($rows as $row) {
                    $paths->push($row->image_path);
                }
            });

        Violation::query()
            ->whereNotNull('screenshot')
            ->select(['id', 'screenshot'])
            ->chunkById(500, function ($rows) use ($paths) {
                foreach ($rows as $row) {
                    $paths->push($row->screenshot);
                }
            });

        $paths = $paths->filter()->unique()->values();

        $this->info("Memeriksa {$paths->count()} path unik...");

        foreach ($paths as $path) {
            $path = (string) $path;

            if ($private->exists($path)) {
                $alreadyPrivate++;
                continue;
            }

            if (! $public->exists($path)) {
                $missing++;
                continue;
            }

            if ($isDryRun) {
                $this->line("  [DRY RUN] Akan dipindahkan: {$path}");
                $moved++;
                continue;
            }

            try {
                $stream = $public->readStream($path);
                if ($stream === null) {
                    $missing++;
                    continue;
                }

                $private->writeStream($path, $stream);
                if (is_resource($stream)) {
                    fclose($stream);
                }

                if (! $private->exists($path)) {
                    $errors++;
                    $this->warn("  Gagal menulis ke disk privat: {$path}");
                    continue;
                }

                $public->delete($path);
                $moved++;
            } catch (\Throwable $e) {
                $errors++;
                Log::warning("[proctoring:privatize-snapshots] Gagal memindahkan {$path}: {$e->getMessage()}");
                $this->warn("  Gagal: {$path} — {$e->getMessage()}");
            }
        }

        $this->info($isDryRun ? '[DRY RUN] Ringkasan:' : 'Selesai:');
        $this->line("  Dipindahkan      : {$moved}");
        $this->line("  Sudah privat     : {$alreadyPrivate}");
        $this->line("  Berkas tidak ada : {$missing}");
        $this->line("  Galat            : {$errors}");

        return $errors > 0 ? Command::FAILURE : Command::SUCCESS;
    }
}
