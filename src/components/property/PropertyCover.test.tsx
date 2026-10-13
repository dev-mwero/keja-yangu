import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PropertyCover } from "@/components/property/PropertyCover";

describe("PropertyCover", () => {
  it("renders the cover image with no counter for a single image", () => {
    render(<PropertyCover images={["/a.jpg"]} title="Home" sizes="100vw" />);
    expect(screen.getByAltText("Home")).toBeInTheDocument();
    expect(screen.queryByText(/1\/1/)).not.toBeInTheDocument();
  });

  it("falls back to a placeholder when there are no images", () => {
    render(<PropertyCover images={[]} title="Home" sizes="100vw" />);
    expect(screen.getByAltText("Home")).toBeInTheDocument();
  });

  it("shows a photo counter for multi-image listings", () => {
    render(<PropertyCover images={["/a.jpg", "/b.jpg", "/c.jpg"]} title="Home" sizes="100vw" />);
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("cycles to the image under the pointer", () => {
    render(<PropertyCover images={["/a.jpg", "/b.jpg", "/c.jpg"]} title="Home" sizes="100vw" />);
    const cover = screen.getByAltText("Home").parentElement as HTMLElement;
    cover.getBoundingClientRect = () =>
      ({
        left: 0,
        width: 300,
        top: 0,
        height: 225,
        right: 300,
        bottom: 225,
        x: 0,
        y: 0,
      }) as unknown as DOMRect;

    fireEvent.mouseMove(cover, { clientX: 250 });
    expect(screen.getByText("3/3")).toBeInTheDocument();
  });

  it("hides the dots but keeps the count badge when showDots is false", () => {
    render(
      <PropertyCover images={["/a.jpg", "/b.jpg"]} title="Home" sizes="100vw" showDots={false} />,
    );
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.queryByTestId("gallery-dots")).not.toBeInTheDocument();
  });
});
