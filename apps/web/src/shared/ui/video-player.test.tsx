import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { VideoPlayer } from "./video-player";

describe("VideoPlayer", () => {
  it("exposes the native media element for host playback controls", () => {
    const ref = createRef<HTMLVideoElement>();
    render(<VideoPlayer ref={ref} src="https://example.com/video/demo.mp4" title="宣传视频" />);

    expect(ref.current).toBe(screen.getByLabelText("宣传视频"));
    expect(ref.current?.tagName).toBe("VIDEO");
  });

  it("renders an MP4 source with native controls", () => {
    render(
      <VideoPlayer
        src="https://example.com/video/trusted-chain-demo.mp4"
        title="快速开始教程视频"
        caption="快速开始演示"
      />,
    );

    const video = screen.getByLabelText("快速开始教程视频");
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("preload", "metadata");
    expect(video).toHaveAttribute("playsinline");
    const source = video.querySelector("source");
    expect(source).toHaveAttribute(
      "src",
      "https://example.com/video/trusted-chain-demo.mp4",
    );
    expect(source).toHaveAttribute("type", "video/mp4");
  });

  it("shows a useful fallback when no URL is configured", () => {
    render(<VideoPlayer src="" title="产品宣传视频" />);

    expect(screen.getByRole("status")).toHaveTextContent("视频地址未配置");
    expect(screen.queryByLabelText("产品宣传视频")).not.toBeInTheDocument();
  });
});
