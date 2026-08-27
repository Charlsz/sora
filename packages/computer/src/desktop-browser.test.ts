import { describe, expect, test } from "bun:test";
import { DesktopBrowser } from "./desktop-browser.ts";
import {
  chromeDebugClickCommand,
  chromeDebugOpenCommand,
  chromeDebugTypeCommand,
} from "./desktop-cdp.ts";

describe("desktop-cdp commands", () => {
  test("open/click/type commands embed selector safely", () => {
    const open = chromeDebugOpenCommand("https://example.com/a?b=1");
    expect(open).toContain("remote-debugging-port=9222");
    expect(open).toContain("base64");

    const click = chromeDebugClickCommand("button.submit");
    expect(click).toContain("base64");
    expect(click).toContain("button.submit");

    const type = chromeDebugTypeCommand("#email", "hi@x.com", true);
    expect(type).toContain("#email");
    expect(type).toContain("hi@x.com");
  });
});

describe("DesktopBrowser", () => {
  test("click accepts x,y coordinates via leftClick", async () => {
    const clicks: Array<[number?, number?]> = [];
    const browser = new DesktopBrowser({
      open: async () => {},
      write: async () => {},
      press: async () => {},
      leftClick: async (x, y) => {
        clicks.push([x, y]);
      },
      screenshot: async () => new Uint8Array([1]),
    });
    const result = await browser.click("120, 40");
    expect(result.ok).toBe(true);
    expect(clicks).toEqual([[120, 40]]);
  });

  test("click CSS selector uses exec CDP path", async () => {
    const commands: string[] = [];
    const browser = new DesktopBrowser({
      open: async () => {},
      write: async () => {},
      press: async () => {},
      leftClick: async () => {
        throw new Error("should not leftClick for CSS");
      },
      screenshot: async () => new Uint8Array([1]),
      exec: async (command) => {
        commands.push(command);
        return { stdout: '{"ok":true}', stderr: "", exitCode: 0 };
      },
    });
    const result = await browser.click("button.primary");
    expect(result.ok).toBe(true);
    expect(result.message).toContain("button.primary");
    expect(commands.length).toBe(1);
    expect(commands[0]).toContain("remote-debugging-port=9222");
    expect(commands[0]).toContain("button.primary");
  });

  test("click CSS without exec fails clearly", async () => {
    const browser = new DesktopBrowser({
      open: async () => {},
      write: async () => {},
      press: async () => {},
      leftClick: async () => {},
      screenshot: async () => new Uint8Array([1]),
    });
    const result = await browser.click("#go");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/CDP|exec/i);
  });

  test("type CSS selector uses exec CDP path", async () => {
    const commands: string[] = [];
    const browser = new DesktopBrowser({
      open: async () => {},
      write: async () => {
        throw new Error("should not write raw for CSS");
      },
      press: async () => {},
      leftClick: async () => {},
      screenshot: async () => new Uint8Array([1]),
      exec: async (command) => {
        commands.push(command);
        return { stdout: "ok", stderr: "", exitCode: 0 };
      },
    });
    const result = await browser.type("input[name=q]", "hello", { clear: true });
    expect(result.ok).toBe(true);
    expect(commands[0]).toContain("input[name=q]");
  });

  test("navigate prefers CDP open when exec is available", async () => {
    const commands: string[] = [];
    let opened = false;
    const browser = new DesktopBrowser({
      open: async () => {
        opened = true;
      },
      write: async () => {},
      press: async () => {},
      leftClick: async () => {},
      screenshot: async () => new Uint8Array([1]),
      exec: async (command) => {
        commands.push(command);
        return { stdout: "ok", stderr: "", exitCode: 0 };
      },
    });
    const result = await browser.navigate("https://example.com");
    expect(result.ok).toBe(true);
    expect(opened).toBe(false);
    expect(commands[0]).toContain("https://example.com");
  });
});
