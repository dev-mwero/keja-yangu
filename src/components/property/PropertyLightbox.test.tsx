import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PropertyLightbox } from "@/components/property/PropertyLightbox";

const renderLightbox = (overrides: Partial<Parameters<typeof PropertyLightbox>[0]> = {}) => {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    images: ["/a.jpg", "/b.jpg", "/c.jpg"],
    title: "Sunset Villa",
    index: 0,
    onIndexChange: vi.fn(),
    ...overrides,
  };
  render(<PropertyLightbox {...props} />);
  return props;
};

describe("PropertyLightbox", () => {
  it("renders nothing when closed", () => {
    renderLightbox({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the counter, title and a thumbnail per image", () => {
    renderLightbox();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByText("Sunset Villa")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show image 3" })).toBeInTheDocument();
  });

  it("advances to the next image", () => {
    const { onIndexChange } = renderLightbox();
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("wraps to the last image when going back from the first", () => {
    const { onIndexChange } = renderLightbox();
    fireEvent.click(screen.getByRole("button", { name: "Previous image" }));
    expect(onIndexChange).toHaveBeenCalledWith(2);
  });

  it("jumps to a thumbnail", () => {
    const { onIndexChange } = renderLightbox();
    fireEvent.click(screen.getByRole("button", { name: "Show image 3" }));
    expect(onIndexChange).toHaveBeenCalledWith(2);
  });

  it("navigates with the arrow keys", () => {
    const { onIndexChange } = renderLightbox({ index: 1 });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onIndexChange).toHaveBeenCalledWith(2);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onIndexChange).toHaveBeenCalledWith(0);
  });

  it("reports the current index when it changes", () => {
    renderLightbox({ index: 2 });
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  it("omits navigation and thumbnails for a single image", () => {
    renderLightbox({ images: ["/only.jpg"] });
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next image" })).not.toBeInTheDocument();
  });
});
