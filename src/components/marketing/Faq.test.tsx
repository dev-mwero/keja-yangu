import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Faq } from "@/components/marketing/Faq";

describe("Faq", () => {
  it("renders the section heading and all questions", () => {
    render(<Faq />);
    expect(screen.getByRole("heading", { name: /questions, answered/i })).toBeInTheDocument();
    expect(screen.getAllByRole("group").length + screen.getAllByText(/\?$/).length).toBeGreaterThan(0);
  });

  it("renders questions as details/summary for native accordion", () => {
    const { container } = render(<Faq />);
    const details = container.querySelectorAll("details");
    expect(details.length).toBe(6);
    details.forEach((d) => {
      expect(d.querySelector("summary")).not.toBeNull();
    });
  });
});
