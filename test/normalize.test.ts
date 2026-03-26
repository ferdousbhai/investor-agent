import { describe, it, expect } from "vitest";

// Import normalizeCode from the internal normalize chunk directly.
// The main @cloudflare/codemode entrypoint imports cloudflare:workers
// which isn't available in Node, but normalizeCode is pure JS + acorn.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — internal chunk path
const { t: normalizeCode } = await import(
  /* @vite-ignore */
  new URL("../node_modules/@cloudflare/codemode/dist/normalize-xNh5CsfI.js", import.meta.url).href
);

describe("normalizeCode", () => {
  it("passes through valid async arrow function", () => {
    const code = 'async () => { return await investor_tools_sandbox.quoteSummary({ symbol: "AAPL", modules: ["price"] }); }';
    const result = normalizeCode(code);
    expect(result).toContain("async");
    expect(result).toContain("investor_tools_sandbox.quoteSummary");
  });

  it("wraps bare statements in async arrow function", () => {
    const code = 'const data = await investor_tools_sandbox.quoteSummary({ symbol: "AAPL", modules: ["price"] });\ndata';
    const result = normalizeCode(code);
    expect(result).toContain("async () =>");
    expect(result).toContain("return");
  });

  it("strips markdown code fences", () => {
    const code = '```js\nasync () => { return 42; }\n```';
    const result = normalizeCode(code);
    expect(result).not.toContain("```");
    expect(result).toContain("42");
  });

  it("handles empty code", () => {
    const result = normalizeCode("");
    expect(result).toBe("async () => {}");
  });

  it("wraps function declaration", () => {
    const code = 'async function getData() { return await investor_tools_sandbox.getCnnFearGreed({}); }';
    const result = normalizeCode(code);
    expect(result).toContain("async () =>");
    expect(result).toContain("getData");
  });

  it("handles IIFE by wrapping in arrow function", () => {
    const code = '(async () => { return 42; })()';
    const result = normalizeCode(code);
    expect(result).toContain("42");
  });

  it("gracefully handles invalid JavaScript syntax", () => {
    const result = normalizeCode("}{{{");
    // Should wrap in async arrow without throwing
    expect(result).toContain("async () =>");
  });

  it("handles whitespace-only code", () => {
    const result = normalizeCode("   \n\n  ");
    expect(result).toBe("async () => {}");
  });

  it("strips typescript code fences", () => {
    const code = '```typescript\nasync () => { return 1; }\n```';
    const result = normalizeCode(code);
    expect(result).not.toContain("```");
    expect(result).toContain("1");
  });
});
