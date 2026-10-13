import { describe, expect, it } from "vitest";
import {
  mergeImageUrls,
  moveImage,
  parseImageUrls,
  removeImageAt,
  serializeImageUrls,
  setCoverImage,
} from "@/lib/images";

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

describe("parseImageUrls / serializeImageUrls", () => {
  it("round-trips a URL list", () => {
    const urls = ["https://a.com/1.jpg", "https://b.com/2.jpg"];
    expect(parseImageUrls(serializeImageUrls(urls))).toEqual(urls);
  });

  it("drops blank lines and whitespace", () => {
    expect(parseImageUrls("  a.jpg\n\n b.jpg \n")).toEqual(["a.jpg", "b.jpg"]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseImageUrls("")).toEqual([]);
  });
});

describe("removeImageAt", () => {
  it("removes the image at the given index", () => {
    expect(removeImageAt(["a", "b", "c"], 1)).toEqual(["a", "c"]);
  });

  it("is a no-op for an out-of-range index", () => {
    expect(removeImageAt(["a", "b"], 5)).toEqual(["a", "b"]);
  });
});

describe("moveImage", () => {
  it("moves an item to a later position", () => {
    expect(moveImage(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("moves an item to an earlier position", () => {
    expect(moveImage(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("returns the same array for a no-op move", () => {
    const urls = ["a", "b"];
    expect(moveImage(urls, 1, 1)).toBe(urls);
  });

  it("ignores out-of-range indices", () => {
    const urls = ["a", "b"];
    expect(moveImage(urls, 0, 9)).toBe(urls);
    expect(moveImage(urls, -1, 0)).toBe(urls);
  });
});

describe("setCoverImage", () => {
  it("moves the chosen image to the front", () => {
    expect(setCoverImage(["a", "b", "c"], 2)).toEqual(["c", "a", "b"]);
  });

  it("is a no-op when the image is already the cover", () => {
    const urls = ["a", "b"];
    expect(setCoverImage(urls, 0)).toBe(urls);
  });

  it("is a no-op for an out-of-range index", () => {
    const urls = ["a", "b"];
    expect(setCoverImage(urls, 9)).toBe(urls);
  });
});
