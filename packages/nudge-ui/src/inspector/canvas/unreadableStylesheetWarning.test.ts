// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { unreadableStylesheetMessage, warnAboutUnreadableStylesheets } from "./unreadableStylesheetWarning.ts";

/** A document whose stylesheets all come from `hrefs` and hide their rules, as cross-origin `<link>` sheets do. */
function documentWithHiddenSheets(...hrefs: string[]): Document {
  const doc = document.implementation.createHTMLDocument("");
  const sheets = hrefs.map((href) => {
    const sheet: CSSStyleSheet = Object.create(CSSStyleSheet.prototype);
    return Object.defineProperties(sheet, {
      href: { value: href },
      cssRules: {
        get(): never {
          throw new DOMException("Cannot access rules", "SecurityError");
        },
      },
    });
  });
  const list: StyleSheetList = Object.create(StyleSheetList.prototype);
  Object.defineProperty(doc, "styleSheets", {
    value: Object.defineProperties(list, {
      length: { value: sheets.length },
      [Symbol.iterator]: { value: () => sheets[Symbol.iterator]() },
    }),
  });
  return doc;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("unreadable stylesheet warning", () => {
  it("names one host, or the first host and how many others", () => {
    expect([
      unreadableStylesheetMessage(["b.stripecdn.com"]),
      unreadableStylesheetMessage(["b.stripecdn.com", "fonts.example"]),
      unreadableStylesheetMessage(["b.stripecdn.com", "fonts.example", "cdn.example"]),
    ]).toEqual([
      "Can't read styles from b.stripecdn.com",
      "Can't read styles from b.stripecdn.com +1",
      "Can't read styles from b.stripecdn.com +2",
    ]);
  });

  it("warns once per document", async () => {
    const notify = vi.fn();
    // A document with no window cannot fetch, so its hidden sheets stay unreadable.
    const doc = documentWithHiddenSheets("https://b.stripecdn.com/a.css", "https://b.stripecdn.com/b.css");

    warnAboutUnreadableStylesheets(doc, notify);
    await flush();
    warnAboutUnreadableStylesheets(doc, notify);
    await flush();

    expect(notify.mock.calls).toEqual([[{
      tone: "warning",
      title: "Can't read styles from b.stripecdn.com",
    }]]);
  });

  it("stays quiet when every sheet is readable or the tool closes before the check settles", async () => {
    const notify = vi.fn();

    warnAboutUnreadableStylesheets(documentWithHiddenSheets(), notify);
    const cancel = warnAboutUnreadableStylesheets(documentWithHiddenSheets("https://b.stripecdn.com/a.css"), notify);
    cancel();
    await flush();

    expect(notify).not.toHaveBeenCalled();
  });
});
