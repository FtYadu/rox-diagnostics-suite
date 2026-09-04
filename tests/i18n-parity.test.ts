import { describe, expect, it } from "vitest";
import { resources } from "@/i18n/resources";

type Tree = { [key: string]: string | Tree };

const flatten = (tree: Tree, prefix = ""): string[] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [`${prefix}${key}`]
      : flatten(value as Tree, `${prefix}${key}.`),
  );

const enKeys = flatten(resources.en.translation as Tree);
const zhKeys = flatten(resources.zh.translation as Tree);

describe("i18n resources", () => {
  it("translates every English key into Simplified Chinese", () => {
    const missing = enKeys.filter((key) => !zhKeys.includes(key));
    expect(missing).toEqual([]);
  });

  it("has no Chinese keys that no longer exist in English", () => {
    const orphans = zhKeys.filter((key) => !enKeys.includes(key));
    expect(orphans).toEqual([]);
  });

  it("never leaves an English string as the Chinese translation placeholder", () => {
    const untranslated = enKeys.filter((key) => {
      const read = (tree: Tree) =>
        key.split(".").reduce<string | Tree | undefined>((node, part) => {
          if (node && typeof node !== "string") return node[part];
          return undefined;
        }, tree);
      const en = read(resources.en.translation as Tree);
      const zh = read(resources.zh.translation as Tree);
      if (typeof en !== "string" || typeof zh !== "string") return false;
      // Interpolation-only or acronym strings may legitimately match.
      if (/^[\s{}A-Za-z0-9_.:—–-]{0,6}$/.test(en)) return false;
      return en === zh;
    });
    expect(untranslated).toEqual([]);
  });
});
