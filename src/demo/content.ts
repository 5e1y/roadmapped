import type { DocNode } from '../server/docs'

/*
 * Contenus DÉMO annexes (#148) : l'arbre Docs et la note d'accueil du Notepad.
 * Même quatrième mur que tree.ts — les docs parlent de la page qui les affiche.
 */

export const DEMO_DOCS: DocNode[] = [
  {
    name: 'specs',
    path: 'specs',
    children: [
      { name: 'homepage.md', path: 'specs/homepage.md', createdAt: '2026-06-12' },
    ],
  },
  { name: 'tone-of-voice.md', path: 'tone-of-voice.md', createdAt: '2026-06-14' },
]

export const DEMO_DOC_CONTENT: Record<string, string> = {
  'specs/homepage.md': `# Homepage — spec

## The problem

Every dashboard demo is a lie of some kind. A video goes stale. Screenshots
crop out the rough edges. A hand-built imitation drifts from the real thing
one commit at a time (we know — we built one; it's ticket #8, done and rejected).

## The decision

Embed the **real dashboard** in the homepage. Same components, same parser,
same validator. The only differences:

- the backlog is baked into the bundle at build time (\`src/demo/tree.ts\`)
- writes are declined politely (\`src/demo/api.ts\`)

## The data

The demo backlog is the backlog of the homepage itself. Ticket #10
("Embed the real dashboard in the homepage") is \`in_progress\` — if you can
read this document inside the demo, that ticket is doing its job.

## Non-goals

- Editing. The demo shows; the product does.
- A second schema. There is exactly one, and you're looking through it.
`,
  'tone-of-voice.md': `# Tone of voice

The house rules for every word on roadmapped.dev — enforced by an agent
that re-reads the copy and files tickets about it.

1. **Direct.** Say the thing. "It's a folder of YAML files."
2. **Deadpan, never negative.** Dry humor is welcome; punching down is not —
   not even at competitors, not even at databases.
3. **Disarming transparency.** The backlog is public. The rejected v1 of this
   very page is ticket #8, and it stays there.
4. **Anti-marketing.** No "blazingly fast", no "supercharge", no exclamation
   marks doing the work the product should do.

If a sentence survives all four, it ships. Most don't. See ticket #3:
"Four rewrites. The document won."
`,
}

/** Note d'accueil du Notepad — les éditions restent en mémoire (session). */
export const DEMO_NOTE = {
  slug: 'welcome-to-the-notepad',
  content: `Welcome to the Notepad

This is the local scratchpad — in the real app it's a gitignored folder of
markdown files on your machine, for the ideas that aren't tickets yet.

In this demo it lives in memory: type anything, it autosaves until you close
the tab, then it's gone. Which, for a scratchpad demo, is honestly on-brand.
`,
}
