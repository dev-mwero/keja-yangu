import { describe, expect, it } from "vitest";
import { mergeImageUrls } from "@/lib/images";

describe("mergeImageUrls", () => {
  it("appends new urls to an empty textarea", () => {
    expect(mergeImageUrls("", ["https://a.com/1.jpg", "https://b.com/2.jpg"])).toBe(
      "https://a.com/1.jpg\nhttps://b.com/2.jpg",
    );
  });

  it("appends after existing urls without clobbering them", () => {
    expect(mergeImageUrls("https://a.com/1.jpg", ["https://b.com/2.jpg"])).toBe(
      "https://a.com/1.jpg\nhttps://b.com/2.jpg",
    );
  });

  it("handles existing multiline content with blank lines and whitespace", () => {
    expect(
      mergeImageUrls("  https://a.com/1.jpg\n\n https://b.com/2.jpg \n", ["https://c.com/3.jpg"]),
    ).toBe("https://a.com/1.jpg\nhttps://b.com/2.jpg\nhttps://c.com/3.jpg");
  });

  it("skips duplicates already present", () => {
    expect(
      mergeImageUrls("https://a.com/1.jpg", ["https://a.com/1.jpg", "https://b.com/2.jpg"]),
    ).toBe("https://a.com/1.jpg\nhttps://b.com/2.jpg");
  });

  it("trims and ignores empty urls", () => {
    expect(mergeImageUrls("", ["  ", "", " https://a.com/1.jpg "])).toBe("https://a.com/1.jpg");
  });
});
