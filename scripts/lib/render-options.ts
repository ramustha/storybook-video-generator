import os from "os";

export interface OptimalRenderMediaConfig {
  concurrency: number;
  imageFormat: "jpeg";
  jpegQuality: number;
  x264Preset: "veryfast";
  crf: number;
  pixelFormat: "yuv420p";
  chromiumOptions: {
    gl: "angle" | "swangle";
    enableMultiProcessOnLinux: boolean;
  };
}

/**
 * Computes high-throughput Remotion renderMedia settings tailored to the host CPU/GPU
 * without reducing final H.264 1080p yuv420p visual quality.
 */
export function getOptimalRenderOptions(overrideConcurrency?: number): OptimalRenderMediaConfig {
  const cpuCount = Math.max(1, os.cpus()?.length || 4);
  const autoConcurrency =
    cpuCount >= 8 ? Math.min(8, cpuCount - 2) : Math.max(2, cpuCount);

  return {
    concurrency: overrideConcurrency && overrideConcurrency > 0 ? overrideConcurrency : autoConcurrency,
    // JPEG q=95 skips slow per-frame PNG zlib compression while exceeding H.264 CRF-20 yuv420p fidelity.
    imageFormat: "jpeg",
    jpegQuality: 95,
    x264Preset: "veryfast",
    crf: 20,
    pixelFormat: "yuv420p",
    chromiumOptions: {
      gl: process.platform === "darwin" ? "angle" : "swangle",
      enableMultiProcessOnLinux: true,
    },
  };
}
