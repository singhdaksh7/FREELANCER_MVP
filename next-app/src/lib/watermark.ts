/**
 * Pure watermark text/SVG helpers — no image decoding here (see
 * src/lib/image-preview.ts for the Sharp-dependent part), so this module
 * is cheap to unit test and safe to import from the worker, route
 * handlers, or tests without pulling in libvips.
 */
import { BRAND } from "./branding";

export interface WatermarkTextInput {
  clientName: string;
  clientEmail: string;
  workspaceTitle: string;
}

export interface WatermarkConfig {
  fontSizePx: number;
  lineHeightPx: number;
  /** 0–1. Deliberately translucent, not opaque — a legible-but-unobtrusive protected preview, not a defaced one. */
  opacity: number;
  angleDegrees: number;
  tileSpacingPx: number;
  color: string;
}

/** Centralized watermark styling — the single place every visual property of the overlay is defined. */
export function getWatermarkConfig(): WatermarkConfig {
  return {
    fontSizePx: 20,
    lineHeightPx: 24,
    opacity: 0.28,
    angleDegrees: -30,
    tileSpacingPx: 260,
    color: "#0F172A",
  };
}

/**
 * Escapes the five XML-sensitive characters. Every piece of
 * creator/client-controlled text (client name, client email, workspace
 * title) MUST pass through this before being interpolated into the
 * generated SVG watermark — the SVG is otherwise built entirely from
 * this app's own template strings, never a client-supplied SVG/HTML
 * document.
 */
export function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** The exact lines rendered in every tile of the watermark, escaped for safe SVG interpolation by buildWatermarkSvg. */
export function buildWatermarkLines(input: WatermarkTextInput): string[] {
  return [
    BRAND.watermarkText,
    `${input.clientName} (${input.clientEmail})`,
    `Workspace: ${input.workspaceTitle}`,
  ];
}

/**
 * Builds a tiled, diagonally-repeated SVG watermark overlay sized to
 * (width, height). This overlay is visible and legible by design (see
 * the Phase 5 brief: "not presented as impossible to remove") — it deters
 * casual reuse of a preview image, it is not a cryptographic protection.
 */
export function buildWatermarkSvg(width: number, height: number, lines: string[]): string {
  const config = getWatermarkConfig();
  const safeLines = lines.map(escapeXmlText);
  const tileWidth = config.tileSpacingPx;
  const tileHeight = config.tileSpacingPx;

  const textElements = safeLines
    .map(
      (line, index) =>
        `<text x="0" y="${index * config.lineHeightPx}" font-family="sans-serif" font-size="${config.fontSizePx}" fill="${config.color}" fill-opacity="${config.opacity}">${line}</text>`,
    )
    .join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<defs><pattern id="vault-watermark-tile" width="${tileWidth}" height="${tileHeight}" ` +
    `patternUnits="userSpaceOnUse" patternTransform="rotate(${config.angleDegrees})">` +
    `<g transform="translate(12, ${Math.round(tileHeight / 2)})">${textElements}</g>` +
    `</pattern></defs>` +
    `<rect width="100%" height="100%" fill="url(#vault-watermark-tile)" /></svg>`
  );
}
