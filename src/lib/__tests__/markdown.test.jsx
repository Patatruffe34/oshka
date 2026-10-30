// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import Markdown from "../markdown";
import { renderToStaticMarkup } from "react-dom/server";

/** Inspect actual rendered HTML, including the Markdown parser's output. */
const render = (text) => {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<Markdown text={text} />);
  const out = [];
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) out.push({ tag: "text", text: node.textContent });
    else if (node.nodeType === Node.ELEMENT_NODE) {
      out.push({ tag: node.tagName.toLowerCase(), props: Object.fromEntries([...node.attributes].map((attr) => [attr.name, attr.value])) });
      node.childNodes.forEach(walk);
    }
  };
  host.childNodes.forEach(walk);
  return out;
};
const textOf = (nodes) => nodes.filter((n) => n.tag === "text").map((n) => n.text).join("");
const tags = (nodes) => nodes.map((n) => n.tag);

describe("Markdown", () => {
  it("renders named links including Obsidian URLs with parentheses", () => {
    const url = "obsidian://open?path=Daily%20notes/Note_(1).md";
    const html = renderToStaticMarkup(<Markdown text={`Source : [daily note](${url})`} />);
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain(">daily note</a>");
    expect(html).not.toContain("[daily note]");
  });

  it("renders block Markdown and nested formatting", () => {
    const html = renderToStaticMarkup(<Markdown text={"## Notes\n\n- **Important**\n- [Site](https://example.com)\n\n> Context\n\n```js\nconst value = 1;\n```"} />);
    for (const tag of ["h2", "ul", "li", "strong", "a", "blockquote", "pre", "code"]) {
      expect(html).toContain(`<${tag}`);
    }
  });

  it("blocks executable URLs while retaining safe link labels", () => {
    const html = renderToStaticMarkup(<Markdown text={'[bad](javascript:alert%281%29) [data](data:text/html,test) [file](file:///tmp/private)'} />);
    expect(html).not.toContain("href=");
    expect(html).toContain("bad");
  });

  it("renders GFM tables and task lists", () => {
    const html = renderToStaticMarkup(<Markdown text={"| Name | Value |\n| --- | --- |\n| A | B |\n\n- [x] Done\n- [ ] Next"} />);
    expect(html).toContain("<table>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('disabled=""');
  });

  it("renders nothing for empty input", () => {
    expect(Markdown({ text: "" })).toBeNull();
    expect(Markdown({ text: null })).toBeNull();
  });

  it("passes plain text through untouched", () => {
    expect(textOf(render("juste du texte"))).toBe("juste du texte");
  });

  it("renders bold with either marker", () => {
    expect(tags(render("un **mot** gras"))).toContain("strong");
    expect(tags(render("un __mot__ gras"))).toContain("strong");
    expect(textOf(render("un **mot** gras"))).toBe("un mot gras");
  });

  it("renders italic with either marker", () => {
    expect(tags(render("un *mot* penche"))).toContain("em");
    expect(tags(render("un _mot_ penche"))).toContain("em");
  });

  it("renders inline code", () => {
    const nodes = render("appelle `useBoard()` ici");
    expect(tags(nodes)).toContain("code");
    expect(textOf(nodes)).toBe("appelle useBoard() ici");
  });

  it("turns bare URLs into links that open safely", () => {
    const link = render("voir https://example.com pour la suite").find((n) => n.tag === "a");
    expect(link.props.href).toBe("https://example.com");
    expect(link.props.target).toBe("_blank");
    // Without noopener the opened page can reach back into this one
    expect(link.props.rel).toContain("noopener");
  });

  it("splits blank lines into separate paragraphs", () => {
    const paragraphs = render("premier\n\nsecond").filter((n) => n.tag === "p");
    expect(paragraphs).toHaveLength(2);
  });

  it("keeps single newlines as line breaks inside a paragraph", () => {
    const nodes = render("ligne un\nligne deux");
    expect(nodes.filter((n) => n.tag === "p")).toHaveLength(1);
    expect(nodes.filter((n) => n.tag === "br")).toHaveLength(1);
  });

  it("leaves unmatched markers alone", () => {
    expect(textOf(render("2 * 3 = 6"))).toBe("2 * 3 = 6");
    expect(tags(render("2 * 3 = 6"))).not.toContain("em");
  });

  it("supports emphasis spanning a newline, with the line break preserved", () => {
    const nodes = render("debut *pas\nferme* fin");
    expect(tags(nodes)).toContain("em");
    expect(tags(nodes)).toContain("br");
  });

  it("never emits raw HTML from user text", () => {
    // The renderer builds elements, so angle brackets stay literal text
    const nodes = render('<img src=x onerror="alert(1)">');
    expect(tags(nodes)).not.toContain("img");
    expect(textOf(nodes)).toContain("<img");
  });
});
