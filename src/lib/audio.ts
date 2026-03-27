import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, unlink } from "node:fs/promises";
import path from "node:path";

export const SAFE_UPLOAD_BYTES = 24 * 1024 * 1024;

export async function getAudioDurationSeconds(audioPath: string): Promise<number> {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      audioPath,
    ],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || `Failed to inspect audio duration for ${audioPath}`);
  }

  const payload = JSON.parse(result.stdout) as {
    format?: { duration?: string };
  };
  const duration = payload.format?.duration;
  if (!duration) {
    throw new Error(`Unable to determine duration for ${audioPath}`);
  }

  return Number.parseFloat(duration);
}

export function planChunkDuration(input: {
  fileSizeBytes: number;
  durationSeconds: number;
}): number {
  const { fileSizeBytes, durationSeconds } = input;
  if (fileSizeBytes <= 0 || durationSeconds <= 0) {
    return 1;
  }

  const planned = Math.floor((SAFE_UPLOAD_BYTES / fileSizeBytes) * durationSeconds * 0.9);
  return Math.max(1, planned);
}

export async function splitAudioToMp3Chunks(
  audioPath: string,
  chunkDurationSeconds: number,
  tempDir: string,
): Promise<string[]> {
  await mkdir(tempDir, { recursive: true });
  const stem = path.basename(audioPath, path.extname(audioPath));
  const splitDir = await mkdtemp(path.join(tempDir, `${stem}-`));
  const outputPattern = path.join(splitDir, `${stem}_chunk_%03d.mp3`);

  const result = spawnSync(
    "ffmpeg",
    [
      "-i",
      audioPath,
      "-f",
      "segment",
      "-segment_time",
      String(chunkDurationSeconds),
      "-reset_timestamps",
      "1",
      "-c",
      "copy",
      outputPattern,
    ],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || `Failed to split audio at ${audioPath}`);
  }

  const entries = await readdir(splitDir);
  return entries
    .filter((entry) => entry.startsWith(`${stem}_chunk_`) && entry.endsWith(".mp3"))
    .sort()
    .map((entry) => path.join(splitDir, entry));
}

export async function cleanupFiles(paths: string[]): Promise<void> {
  await Promise.all(
    paths.map(async (filePath) => {
      try {
        await unlink(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }),
  );
}
