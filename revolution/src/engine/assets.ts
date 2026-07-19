import type { SceneManifest } from "./types";

/** Vite's SPA fallback answers 200 + text/html for missing files, so a bare
 *  ok-check lies; require a non-HTML content-type to count as present. */
export async function assetExists(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, { method: "HEAD" });
    return head.ok && !(head.headers.get("content-type") ?? "").includes("text/html");
  } catch {
    return false;
  }
}

/** Warm the HTTP cache with everything the next scene will ask for: splat
 *  bytes, collider, ambience, per-cue VO, fallback video, conditioning frame.
 *  Fire-and-forget — missing assets (not yet generated) are expected. */
export function preloadSceneAssets(manifest: SceneManifest): void {
  const urls = new Set<string>();
  const { splat, collider, referenceImage, fallbackVideo } = manifest.assets;
  for (const url of [splat, collider, referenceImage, fallbackVideo]) {
    if (url) urls.add(url);
  }
  for (const ambience of manifest.audio.ambience ?? []) urls.add(ambience);
  for (const bark of manifest.audio.barks ?? []) {
    urls.add(typeof bark === "string" ? bark : bark.url);
  }
  for (const cue of manifest.cues) {
    if (cue.subtitle || cue.vo) urls.add(cue.vo ?? `/assets/audio/vo/${cue.id}.mp3`);
  }
  for (const url of urls) {
    void fetch(url).then(
      (res) => { if (res.ok) void res.arrayBuffer(); },
      () => { /* offline / missing — the scene handles absence itself */ }
    );
  }
  console.info(`[preload] warming ${urls.size} assets for "${manifest.id}"`);
}
