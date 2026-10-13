import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PropertyImageManager } from "@/components/property/PropertyImageManager";

describe("PropertyImageManager", () => {
  it("shows an empty state when there are no images", () => {
    render(<PropertyImageManager value="" onChange={vi.fn()} />);
    expect(screen.getByText(/no images yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("renders a thumbnail per image and marks the first as Cover", () => {
    render(<PropertyImageManager value={"/a.jpg\n/b.jpg\n/c.jpg"} onChange={vi.fn()} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Cover")).toBeInTheDocument();
  });

  it("removes an image and emits the new list", () => {
    const onChange = vi.fn();
    render(<PropertyImageManager value={"/a.jpg\n/b.jpg\n/c.jpg"} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove image 2" }));
    expect(onChange).toHaveBeenCalledWith("/a.jpg\n/c.jpg");
  });

  it("sets a chosen image as the cover", () => {
    const onChange = vi.fn();
    render(<PropertyImageManager value={"/a.jpg\n/b.jpg\n/c.jpg"} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Set image 3 as cover" }));
    expect(onChange).toHaveBeenCalledWith("/c.jpg\n/a.jpg\n/b.jpg");
  });

  it("reorders with the move buttons", () => {
    const onChange = vi.fn();
    render(<PropertyImageManager value={"/a.jpg\n/b.jpg\n/c.jpg"} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Move image 2 left" }));
    expect(onChange).toHaveBeenCalledWith("/b.jpg\n/a.jpg\n/c.jpg");
  });

  it("reorders via drag and drop", () => {
    const onChange = vi.fn();
    render(<PropertyImageManager value={"/a.jpg\n/b.jpg\n/c.jpg"} onChange={onChange} />);
    const items = screen.getAllByRole("listitem");
    fireEvent.dragStart(items[0]);
    fireEvent.dragOver(items[2]);
    fireEvent.drop(items[2]);
    expect(onChange).toHaveBeenCalledWith("/b.jpg\n/c.jpg\n/a.jpg");
  });
});
