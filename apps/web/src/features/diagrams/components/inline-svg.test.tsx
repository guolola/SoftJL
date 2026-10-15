import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InlineSvg } from "./inline-svg";

describe("InlineSvg", () => {
  it("shows an empty state when svg is missing", () => {
    render(<InlineSvg svg="" />);

    expect(screen.getByText("尚未生成 SVG")).toBeInTheDocument();
  });

  it("shows an error when markup does not contain a root svg", async () => {
    render(<InlineSvg svg={"<div>invalid</div>"} />);

    await waitFor(() => {
      expect(screen.getByText("渲染失败：SVG 内容无效")).toBeInTheDocument();
    });
  });

  it("keeps a visible root svg layout when width and height are present", async () => {
    const { container } = render(
      <InlineSvg
        svg={
          '<svg width="209px" height="111px"><text x="10" y="20">usecase</text></svg>'
        }
      />,
    );

    await waitFor(() => {
      const svgEl = container.querySelector("svg");
      expect(svgEl).not.toBeNull();
      expect(svgEl?.getAttribute("viewBox")).toBe("0 0 209 111");
      expect((container.querySelector(".uml-inline-svg") as HTMLElement).style.getPropertyValue("--uml-svg-width")).toBe("100%");
      expect(container.querySelector("style")?.textContent).toContain("width: var(--uml-svg-width, 100%) !important");
      expect(container.querySelector("style")?.textContent).toContain("height: auto !important");
    });
  });

  it("preserves fitting and zoom when saved markup with pixel dimensions is reinserted", () => {
    const svg = '<svg viewBox="0 0 3185 968" style="width:3185px;height:968px;background:#fff"><text>总体业务流程</text></svg>';
    const { container, rerender } = render(<InlineSvg svg={svg} />);
    const viewportWidth = () => (container.querySelector(".uml-inline-svg") as HTMLElement).style.getPropertyValue("--uml-svg-width");
    expect(viewportWidth()).toBe("100%");
    rerender(<InlineSvg svg={svg} scale={1.25} />);
    expect(viewportWidth()).toBe("125%");
    rerender(<InlineSvg svg={svg.replace("#fff", "#fafafa")} scale={1} />);
    expect(viewportWidth()).toBe("100%");
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 3185 968");
    expect(container.querySelector("svg")?.style.background).toBe("rgb(250, 250, 250)");
  });

  it("marks the matching SVG text and shape with a high contrast highlight", async () => {
    const { container } = render(
      <InlineSvg
        svg={
          '<svg width="160" height="80"><g><rect width="120" height="40"></rect><text x="10" y="25">提交订单</text></g><text x="10" y="65">其它节点</text></svg>'
        }
        highlightLabel="提交订单"
      />,
    );

    await waitFor(() => {
      const matchedText = container.querySelector("text.pum-highlight");
      const matchedShape = container.querySelector("rect.pum-highlight");
      const matchedGroup = container.querySelector("g.pum-highlight");

      expect(matchedText?.textContent).toBe("提交订单");
      expect(matchedShape).not.toBeNull();
      expect(matchedGroup).not.toBeNull();
      expect(container.querySelector(".uml-inline-svg")).not.toBeNull();
    });
  });

  it("highlights database tables by rendered names and field rows by type declarations", async () => {
    const { container, rerender } = render(
      <InlineSvg
        svg={
          '<svg width="220" height="100"><g><rect width="160" height="40"></rect><text x="10" y="25">user</text></g><g><rect y="50" width="200" height="30"></rect><text x="10" y="70">user_id : varchar(64)</text></g></svg>'
        }
        highlightLabel="user"
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("text.pum-highlight")?.textContent).toBe("user");
    });

    rerender(
      <InlineSvg
        svg={
          '<svg width="220" height="100"><g><rect width="160" height="40"></rect><text x="10" y="25">user</text></g><g><rect y="50" width="200" height="30"></rect><text x="10" y="70">user_id : varchar(64)</text></g></svg>'
        }
        highlightLabel="user.user_id"
        highlightAliases={["user_id"]}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("text.pum-highlight")?.textContent).toBe(
        "user_id : varchar(64)",
      );
    });
  });

  it("does not highlight a coarse PlantUML group that contains the whole diagram", async () => {
    const { container } = render(
      <InlineSvg
        svg={
          '<svg width="260" height="120"><g id="diagram-root"><rect id="shape-a" width="80" height="36"></rect><text x="10" y="22">借书</text><rect id="shape-b" x="120" width="80" height="36"></rect><text x="130" y="22">还书</text></g></svg>'
        }
        highlightLabel="借书"
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("text.pum-highlight")?.textContent).toBe("借书");
    });

    expect(container.querySelector("g#diagram-root")?.classList.contains("pum-highlight")).toBe(
      false,
    );
    expect(container.querySelector("#shape-b")?.classList.contains("pum-highlight")).toBe(
      false,
    );
  });

  it("uses the info token for SVG highlights instead of the primary token", () => {
    render(<InlineSvg svg="<svg><text>ok</text></svg>" />);

    const styleText = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");

    expect(styleText).toContain("--uml-highlight: var(--info)");
    expect(styleText).toContain("--uml-highlight-strong: var(--info)");
    expect(styleText).toContain("stroke-width: 4px");
    expect(styleText).not.toContain("--primary");
  });

  it("removes unsafe SVG scripting surfaces before injection", async () => {
    const { container } = render(
      <InlineSvg
        svg={
          '<svg onload="alert(1)"><script>alert(1)</script><foreignObject><iframe src="https://example.com"></iframe></foreignObject><a href="javascript:alert(1)"><text onclick="alert(1)">ok</text></a><path style="fill:url(javascript:alert(1))" d="M0 0L1 1" /></svg>'
        }
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("svg")).not.toBeNull();
    });

    const injected = container.querySelector(".uml-inline-svg")?.innerHTML ?? "";
    expect(injected).not.toContain("onload");
    expect(injected).not.toContain("onclick");
    expect(injected).not.toContain("<script");
    expect(injected).not.toContain("foreignObject");
    expect(injected).not.toContain("javascript:");
    expect(injected).not.toContain("<a");
  });
});
