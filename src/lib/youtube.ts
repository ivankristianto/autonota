import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { deriveYoutubeAudioPath } from "./fs.js";
import type { DownloadProgressEvent } from "./progress.js";

export interface YoutubeMetadata {
  videoId: string;
  title: string;
  url: string;
}

export interface DownloadYoutubeAudioOptions {
  url: string;
  outputBasePath: string;
  browser?: string;
  onProgress?: (e: DownloadProgressEvent) => void;
}

export function normalizeYoutubeUrl(input: string): URL {
  const url = new URL(input);
  const videoId = extractVideoId(url.href);
  return new URL(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`);
}

export function extractVideoId(input: string): string {
  const url = new URL(input);
  const hostname = url.hostname.replace(/^www\./, "");

  if (hostname === "youtu.be") {
    const videoId = url.pathname.split("/").filter(Boolean)[0];
    if (!videoId) {
      throw new Error(`Could not extract YouTube video id from ${input}`);
    }
    return videoId;
  }

  if (hostname === "youtube.com" || hostname.endsWith(".youtube.com")) {
    const videoId = url.searchParams.get("v");
    if (videoId) {
      return videoId;
    }

    const pathParts = url.pathname.split("/").filter(Boolean);
    const embedIndex = pathParts.findIndex((part) => part === "embed" || part === "shorts");
    if (embedIndex >= 0 && pathParts[embedIndex + 1]) {
      return pathParts[embedIndex + 1];
    }
  }

  throw new Error(`Unsupported YouTube URL: ${input}`);
}

export async function fetchYoutubeMetadata(
  url: string,
  browser?: string,
): Promise<YoutubeMetadata> {
  const normalizedUrl = normalizeYoutubeUrl(url);
  const args = ["--dump-single-json", "--no-playlist"];

  if (browser) {
    args.push("--cookies-from-browser", browser);
  }

  args.push(normalizedUrl.href);

  const result = spawnSync("yt-dlp", args, { encoding: "utf8" });

  if (result.status !== 0) {
    throw new Error(result.stderr || "Failed to fetch YouTube metadata");
  }

  const payload = JSON.parse(result.stdout) as { id?: string; title?: string; webpage_url?: string };
  const videoId = payload.id ?? extractVideoId(normalizedUrl.href);
  const title = payload.title?.trim() || videoId;
  return {
    videoId,
    title,
    url: payload.webpage_url || normalizedUrl.href,
  };
}

async function spawnYtDlpDownload(
  args: string[],
  onProgress?: (e: DownloadProgressEvent) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args);
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) {
          onProgress?.({ type: "downloading", line: trimmed });
        }
      }
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) {
          onProgress?.({ type: "downloading", line: trimmed });
        }
      }
    });

    proc.on("close", (code) => {
      if (code === 0) {
        onProgress?.({ type: "done" });
        resolve();
      } else {
        reject(new Error(stderr || `yt-dlp exited with code ${code}`));
      }
    });

    proc.on("error", (err) => reject(err));
  });
}

export async function downloadYoutubeAudio(
  options: DownloadYoutubeAudioOptions,
): Promise<{ audioPath: string; metadata: YoutubeMetadata }> {
  const normalizedUrl = normalizeYoutubeUrl(options.url);
  const metadata = await fetchYoutubeMetadata(normalizedUrl.href, options.browser);
  options.onProgress?.({ type: "metadata" });

  const audioPath = deriveYoutubeAudioPath(
    options.outputBasePath,
    metadata.title,
    metadata.videoId,
  );
  await mkdir(path.dirname(audioPath), { recursive: true });

  if (existsSync(audioPath)) {
    options.onProgress?.({ type: "done" });
    return { audioPath, metadata };
  }

  const args = [
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "0",
    "--no-playlist",
    "--newline",
    "--progress",
    "-o",
    audioPath,
  ];

  if (options.browser) {
    args.push("--cookies-from-browser", options.browser);
  }

  args.push(normalizedUrl.href);

  await spawnYtDlpDownload(args, options.onProgress);

  return { audioPath, metadata };
}
