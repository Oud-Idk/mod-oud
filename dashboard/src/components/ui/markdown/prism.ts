import type { CSSProperties } from "react";

import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism-light";
import vscDarkPlus from "react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus";
import oneLight from "react-syntax-highlighter/dist/esm/styles/prism/one-light";

import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import clojure from "react-syntax-highlighter/dist/esm/languages/prism/clojure";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import crystal from "react-syntax-highlighter/dist/esm/languages/prism/crystal";
import csharp from "react-syntax-highlighter/dist/esm/languages/prism/csharp";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import dart from "react-syntax-highlighter/dist/esm/languages/prism/dart";
import diff from "react-syntax-highlighter/dist/esm/languages/prism/diff";
import docker from "react-syntax-highlighter/dist/esm/languages/prism/docker";
import elixir from "react-syntax-highlighter/dist/esm/languages/prism/elixir";
import elm from "react-syntax-highlighter/dist/esm/languages/prism/elm";
import erlang from "react-syntax-highlighter/dist/esm/languages/prism/erlang";
import fsharp from "react-syntax-highlighter/dist/esm/languages/prism/fsharp";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import graphql from "react-syntax-highlighter/dist/esm/languages/prism/graphql";
import haskell from "react-syntax-highlighter/dist/esm/languages/prism/haskell";
import http from "react-syntax-highlighter/dist/esm/languages/prism/http";
import ini from "react-syntax-highlighter/dist/esm/languages/prism/ini";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import kotlin from "react-syntax-highlighter/dist/esm/languages/prism/kotlin";
import lua from "react-syntax-highlighter/dist/esm/languages/prism/lua";
import makefile from "react-syntax-highlighter/dist/esm/languages/prism/makefile";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import nginx from "react-syntax-highlighter/dist/esm/languages/prism/nginx";
import nim from "react-syntax-highlighter/dist/esm/languages/prism/nim";
import nix from "react-syntax-highlighter/dist/esm/languages/prism/nix";
import ocaml from "react-syntax-highlighter/dist/esm/languages/prism/ocaml";
import perl from "react-syntax-highlighter/dist/esm/languages/prism/perl";
import powershell from "react-syntax-highlighter/dist/esm/languages/prism/powershell";
import properties from "react-syntax-highlighter/dist/esm/languages/prism/properties";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import r from "react-syntax-highlighter/dist/esm/languages/prism/r";
import ruby from "react-syntax-highlighter/dist/esm/languages/prism/ruby";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import scala from "react-syntax-highlighter/dist/esm/languages/prism/scala";
import scss from "react-syntax-highlighter/dist/esm/languages/prism/scss";
import solidity from "react-syntax-highlighter/dist/esm/languages/prism/solidity";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import swift from "react-syntax-highlighter/dist/esm/languages/prism/swift";
import toml from "react-syntax-highlighter/dist/esm/languages/prism/toml";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import vim from "react-syntax-highlighter/dist/esm/languages/prism/vim";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import zig from "react-syntax-highlighter/dist/esm/languages/prism/zig";

/**
 * `@types/react-syntax-highlighter` types every language module as `any`, which
 * oxlint's type-aware rules reject. This is the shape we actually rely on:
 * refractor keys the grammar off `name` and registers `aliases` from the
 * definition itself.
 */
export interface PrismGrammar {
    name: string;
    aliases?: string[];
}

/**
 * Prism themes, dark and light.
 *
 * Both are static objects, so importing them costs nothing per render. The
 * original `react-syntax-highlighter/dist/cjs/styles/prism` barrel re-exports
 * every theme in the library; these are the two single files we actually use.
 */
export const themes: Record<"dark" | "light", Record<string, CSSProperties>> = {
    dark: vscDarkPlus,
    light: oneLight,
};

/**
 * The grammar set, in dependency order.
 *
 * `refractor` keeps its registry in a module-level singleton, so the set of
 * registered grammars depends on module load order, and grammars must be
 * registered before anything that builds on them: `typescript` extends
 * `javascript`, `jsx` extends both, and `tsx` extends all three. Register in
 * any other order and the derived grammars silently capture an incomplete base.
 *
 * This matters for correctness, not just tidiness. The same source tokenizes
 * differently depending on how many grammars are loaded — `/foo(\d+)/` in a
 * `tsx` block is one `regex` token with this set registered and a dozen
 * fragments with the full library loaded. If the server and client end up with
 * different sets, the token boundaries differ, React sees a text mismatch, and
 * the whole subtree re-renders on the client.
 */
// oxlint-disable-next-line typescript/no-unsafe-assignment -- @types declares each language module as `any`; see src/types/react-syntax-highlighter.d.ts
const grammars: PrismGrammar[] = [
    // No dependencies.
    bash, c, clojure, cpp, crystal, csharp, css, dart, diff, docker, elixir,
    elm, erlang, fsharp, go, graphql, haskell, http, ini, java, lua, makefile,
    markdown, markup, nginx, nim, nix, ocaml, perl, powershell, properties,
    python, r, ruby, rust, scala, scss, solidity, sql, swift, toml, vim, yaml,
    zig, json, kotlin,
    // Depend on the above; order is load-bearing.
    javascript, typescript, jsx, tsx,
];

/** Aliases the grammars don't carry themselves. */
const extraAliases: Record<string, string> = {
    golang: "go",
    rs: "rust",
    cxx: "cpp",
    "c++": "cpp",
    cc: "cpp",
    hpp: "cpp",
    "c#": "csharp",
    ps1: "powershell",
    pwsh: "powershell",
    env: "properties",
    dotenv: "properties",
    cfg: "ini",
    conf: "ini",
};

const registered = new Set<string>();

// `registerLanguage` keys off the grammar's own `name` and `aliases`, ignoring
// its first argument, so mirror both into `registered` for `normalizeLanguage`.
for (const grammar of grammars) {
    SyntaxHighlighter.registerLanguage(grammar.name, grammar);
    registered.add(grammar.name);
    for (const alias of grammar.aliases ?? []) {
        registered.add(alias);
    }
}

for (const [alias, target] of Object.entries(extraAliases)) {
    SyntaxHighlighter.alias(target, alias);
    registered.add(alias);
}

// Fences we render unstyled, so no grammar is ever requested for them.
const PLAIN = new Set(["plain", "plaintext", "text", "txt", "none", ""]);

/** Resolve a fence name to a grammar, or `null` to render it unstyled. */
export function normalizeLanguage(language: string): string | null {
    const key = language.trim().toLowerCase();
    if (PLAIN.has(key)) {
        return null;
    }
    return registered.has(key) ? key : null;
}

/** The highlighter, with the curated grammars registered. */
export const Prism = SyntaxHighlighter;
