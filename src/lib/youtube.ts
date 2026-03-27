import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export interface YoutubeMetadata {
  videoId: string;
  title: string;
  url: string;
}

export interface DownloadYoutubeAudioOptions {
  url: string;
  tempDir: string;
  browser?: string;
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

export async function downloadYoutubeAudio(
  options: DownloadYoutubeAudioOptions,
): Promise<{ audioPath: string; metadata: YoutubeMetadata }> {
  const normalizedUrl = normalizeYoutubeUrl(options.url);
  const metadata = await fetchYoutubeMetadata(normalizedUrl.href, options.browser);
  await mkdir(options.tempDir, { recursive: true });

  const audioPath = path.join(options.tempDir, `${metadata.videoId}.mp3`);
  const args = [
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "0",
    "--no-playlist",
    "-o",
    audioPath,
  ];

  if (options.browser) {
    args.push("--cookies-from-browser", options.browser);
  }

  args.push(normalizedUrl.href);

  const result = spawnSync("yt-dlp", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || "Failed to download YouTube audio");
  }

  return { audioPath, metadata };
}
