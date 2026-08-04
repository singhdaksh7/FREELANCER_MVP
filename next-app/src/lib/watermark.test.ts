import { describe, expect, it } from "vitest";
import { escapeXmlText, buildWatermarkLines, buildWatermarkSvg, getWatermarkConfig } from "./watermark";

describe("escapeXmlText", () => {
  it("escapes all five XML-sensitive characters", () => {
    expect(escapeXmlText(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &apos;");
  });

  it("neutralizes an attempted SVG/script injection via client-controlled text", () => {
    const hostile = `</text><script>alert(document.cookie)</script><text x="0" y="0">`;
    const escaped = escapeXmlText(hostile);
    expect(escaped).not.toContain("<script>");
    expect(escaped).not.toContain("</text>");
    expect(escaped).toContain("&lt;script&gt;");
  });

  it("leaves plain alphanumeric text unchanged", () => {
    expect(escapeXmlText("Rohit Sharma")).toBe("Rohit Sharma");
  });
});

describe("buildWatermarkLines", () => {
  it("includes the required brand / client / workspace content", () => {
    const lines = buildWatermarkLines({
      clientName: "Rohit Sharma",
      workspaceTitle: "Brand Identity Design",
    });
    expect(lines.join(" ")).toContain("INLAY PROTECTED PREVIEW");
    expect(lines.join(" ")).toContain("CLIENT: Rohit Sharma");
    expect(lines.join(" ")).toContain("Brand Identity Design");
  });

  it("falls back to a safe generic client label when clientName is empty or whitespace-only", () => {
    const empty = buildWatermarkLines({ clientName: "", workspaceTitle: "Brand Identity Design" });
    const whitespace = buildWatermarkLines({ clientName: "   ", workspaceTitle: "Brand Identity Design" });
    expect(empty.join(" ")).toContain("CLIENT: Client Preview");
    expect(whitespace.join(" ")).toContain("CLIENT: Client Preview");
  });

  it("prepends sourceLabel as the first line when supplied (PDF previews), and omits it otherwise (ordinary image previews)", () => {
    const withLabel = buildWatermarkLines({
      clientName: "Rohit Sharma",
      workspaceTitle: "Brand Identity Design",
      sourceLabel: "PDF Preview — Page 1 of 3",
    });
    expect(withLabel[0]).toBe("PDF Preview — Page 1 of 3");
    expect(withLabel).toContain("INLAY PROTECTED PREVIEW");

    const withoutLabel = buildWatermarkLines({ clientName: "Rohit Sharma", workspaceTitle: "Brand Identity Design" });
    expect(withoutLabel[0]).toBe("INLAY PROTECTED PREVIEW");
    expect(withoutLabel.some((line) => line.includes("PDF Preview"))).toBe(false);
  });
});

describe("buildWatermarkSvg", () => {
  it("produces well-formed, escaped SVG even with a hostile client name", () => {
    const lines = buildWatermarkLines({
      clientName: `<script>alert(1)</script>`,
      workspaceTitle: `"><image href=x onerror=alert(1)>`,
    });
    const svg = buildWatermarkSvg(400, 300, lines);

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<image href=x onerror=alert(1)>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("sizes the root SVG to the requested output dimensions", () => {
    const svg = buildWatermarkSvg(800, 600, ["PREVIEW ONLY"]);
    expect(svg).toContain('width="800"');
    expect(svg).toContain('height="600"');
  });

  it("tiles the watermark (repeated pattern), not a single static overlay", () => {
    const svg = buildWatermarkSvg(800, 600, ["PREVIEW ONLY"]);
    expect(svg).toContain("<pattern");
    expect(svg).toContain("patternUnits=\"userSpaceOnUse\"");
  });
});

describe("getWatermarkConfig", () => {
  it("returns a translucent (not opaque), rotated, centrally-defined configuration", () => {
    const config = getWatermarkConfig();
    expect(config.opacity).toBeGreaterThan(0);
    expect(config.opacity).toBeLessThan(1);
    expect(config.angleDegrees).not.toBe(0);
    expect(config.tileSpacingPx).toBeGreaterThan(0);
    expect(config.fontSizePx).toBeGreaterThan(0);
  });
});
