import { describe, expect, it } from "vitest";
import {
  containsUnsafeMermaidSource,
  isMermaidFence,
} from "../shared/mermaid-source.js";

describe("Mermaid fence recognition", () => {
  it.each([
    ["mermaid", true],
    [" Mermaid ", true],
    ["MERMAID theme=dark", true],
    ["mermaid title=example", true],
    ["mermaid-extra", false],
    ["typescript", false],
    ["", false],
  ])("normalizes the first info token %j", (info, expected) => {
    expect(isMermaidFence(info)).toBe(expected);
  });
});

describe("Mermaid source safety", () => {
  it("rejects resource-bearing constructs", () => {
    for (const source of [
      'flowchart TD\n  A@{ img: "https://x/y.png" }',
      "flowchart TD\n  A@{ icon: 'pack:name' }",
      '%%{init: {"themeCSS": "a { color: red }"}}%%\ngraph TD',
      "graph TD\n A[url(http://x)]",
      "graph TD\n A[@import 'x']",
      'graph TD\n A["<img src=x>"]',
      'graph TD\n A["<i class=x>styled</i>"]',
      'graph TD\n A["&#60;img src=x&#62;"]',
      'graph TD\n A["</b>"]',
    ]) {
      expect(containsUnsafeMermaidSource(source)).toBe(true);
    }
  });

  it("rejects all shape-data constructs including escaped keys", () => {
    for (const source of [
      'flowchart TD\n  A@{ "img": "https://x/y.png" }',
      "flowchart TD\n  A@{ 'img': 'https://x/y.png' }",
      'flowchart TD\n  A@{ "\\u0069mg": "https://x/y.png" }',
      'flowchart TD\n  A@{ "\\u{69}mg": "https://x/y.png" }',
      'flowchart TD\n  A@{ "\\x69mg": "https://x/y.png" }',
      'flowchart TD\n  A@{ "\\U00000069mg": "https://attacker/x" }',
      'flowchart TD\n  A@{ ? img # comment\n  : "https://attacker/x" }',
      'flowchart TD\n  A@{ dummy: &k img\n  ? *k\n  : "https://attacker/x" }',
      "flowchart TD\n  A@{ shape: rect }",
    ]) {
      expect(containsUnsafeMermaidSource(source)).toBe(true);
    }
  });

  it("fails closed for malformed Unicode escapes", () => {
    for (const source of [
      'graph TD\n A["\\u{110000} disguised"]',
      'graph TD\n A["\\u{FFFFFF} disguised"]',
    ]) {
      expect(() => containsUnsafeMermaidSource(source)).not.toThrow();
      expect(containsUnsafeMermaidSource(source)).toBe(true);
    }
  });

  it("allows ordinary diagrams and formatting-only labels", () => {
    for (const source of [
      "flowchart TD\n  A[Start] --> B{Choice}",
      'graph TD\n A["line one<br>line two"]',
      'graph TD\n A["line one<br/>line two"]',
      'graph TD\n A["<i>formatted</i>"]',
      "sequenceDiagram\n  Alice->>Bob: a < b and x > y",
    ]) {
      expect(containsUnsafeMermaidSource(source)).toBe(false);
    }
  });
});
