import { describe, expect, it } from "vitest";

import {
  createComplaintStatusContent,
  escapeHtml,
  isEmailConfigured,
  sanitizeHeader,
  uniqueSubject,
} from "./email";

describe("Email verification", () => {
  it("should generate a verification token", async () => {
    const token = crypto.randomUUID();
    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThan(0);
  });

  it("should have 24-hour token expiry", () => {
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const now = new Date();
    expect(expiry.getTime() - now.getTime()).toBeCloseTo(24 * 60 * 60 * 1000, -2);
  });

  it("should report when SMTP email is not configured", () => {
    const previous = {
      EMAIL_HOST: process.env.EMAIL_HOST,
      EMAIL_USER: process.env.EMAIL_USER,
      EMAIL_PASS: process.env.EMAIL_PASS,
    };

    delete process.env.EMAIL_HOST;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;

    try {
      expect(isEmailConfigured()).toBe(false);
    } finally {
      Object.assign(process.env, previous);
    }
  });
});

describe("Email header and HTML injection protection", () => {
  it("sanitizeHeader removes CR/LF and control characters before a header is built", () => {
    expect(sanitizeHeader("Leak\r\nX-Injected: yes")).toBe("Leak  X-Injected: yes");
    expect(sanitizeHeader("a\u0000b\u001fc")).toBe("a b c");
    expect(sanitizeHeader("clean subject")).toBe("clean subject");
  });

  it("escapeHtml escapes <, >, &, \" and '", () => {
    expect(escapeHtml(`<script>alert("x" & 'y')</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39;)&lt;/script&gt;",
    );
    expect(escapeHtml("no html")).toBe("no html");
  });

  it("uniqueSubject stamps a timestamp onto a sanitized subject with no CR/LF", () => {
    const source = 'Complaint "Leak\r\nX-Injected: yes" resolved - Keja Yangu';
    const subject = uniqueSubject(source);
    expect(subject).toMatch(/^Complaint "Leak {2}X-Injected: yes" resolved - Keja Yangu \[/);
    expect(subject).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\]$/);
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it("createComplaintStatusContent escapes a script-laden subject in the HTML body", () => {
    const html = createComplaintStatusContent({
      subject: '<script>alert("hi")</script>',
      status: "resolved",
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("resolved");
  });
});
