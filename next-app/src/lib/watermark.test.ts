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
  it("includes the required PREVIEW ONLY / client / workspace content", () => {
    const lines = buildWatermarkLines({
      clientName: "Rohit Sharma",
      clientEmail: "rohit@example.com",
      workspaceTitle: "Brand Identity Design",
    });
    expect(lines.join(" ")).toContain("PREVIEW ONLY");
    expect(lines.join(" ")).toContain("Project Vault");
    expect(lines.join(" ")).toContain("Rohit Sharma");
    expect(lines.join(" ")).toContain("rohit@example.com");
    expect(lines.join(" ")).toContain("Brand Identity Design");
  });
});

describe("buildWatermarkSvg", () => {
  it("produces well-formed, escaped SVG even with a hostile client name", () => {
    const lines = buildWatermarkLines({
      clientName: `<script>alert(1)</script>`,
      clientEmail: "attacker@example.com",
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
