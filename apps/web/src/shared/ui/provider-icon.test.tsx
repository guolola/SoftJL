// Verifies model provider marks resolve locally and unknown providers retain a generic icon.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProviderIcon } from "./provider-icon";

const knownProviderIds = [
  "openai",
  "claude",
  "google",
  "deepseek",
  "kimi",
  "qwen",
  "zhipu",
  "minimax",
  "doubao",
  "ernie",
  "hunyuan",
  "step",
  "xunfei",
];

describe("ProviderIcon", () => {
  it("renders a bundled mark for every known provider and a generic fallback otherwise", () => {
    render(
      <>
        {knownProviderIds.map((providerId) => (
          <ProviderIcon key={providerId} providerId={providerId} />
        ))}
        <ProviderIcon providerId="custom-provider" />
      </>,
    );

    knownProviderIds.forEach((providerId) => {
      expect(screen.getByTestId(`provider-icon-${providerId}`)).toBeInTheDocument();
    });
    expect(screen.getByTestId("provider-icon-fallback")).toBeInTheDocument();
  });
});
