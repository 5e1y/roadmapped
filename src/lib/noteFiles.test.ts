import { describe, it, expect } from 'vitest'
import { parseFileLine, fileLineOf, cleanForAgent, insertOnOwnLines, extractDropPaths } from './noteFiles'

describe('parseFileLine / fileLineOf (#89 — lignes pièces jointes)', () => {
  it('extrait le chemin d\'une ligne [file: …] (roundtrip avec fileLineOf)', () => {
    expect(fileLineOf('/x.png')).toBe('[file: /x.png]') // #155 : émet le préfixe anglais
    expect(parseFileLine('[file: /Users/remi/maquette.png]')).toBe('/Users/remi/maquette.png')
    expect(parseFileLine(fileLineOf('/a/b c/d.png'))).toBe('/a/b c/d.png')
  })

  it('lit encore le préfixe legacy [fichier: …] (notes d\'avant #155)', () => {
    expect(parseFileLine('[fichier: /Users/remi/maquette.png]')).toBe('/Users/remi/maquette.png')
  })

  it('tolère espaces autour et crochets DANS le nom de fichier', () => {
    expect(parseFileLine('  [fichier:   /a/pic [2].png ]  ')).toBe('/a/pic [2].png')
  })

  it('ne matche pas une ligne ordinaire, un [fichier:…] en milieu de ligne, ni un contenu vide', () => {
    expect(parseFileLine('une idée à creuser')).toBeNull()
    expect(parseFileLine('voir [fichier: /a.png] plus tard')).toBeNull()
    expect(parseFileLine('[fichier: ]')).toBeNull()
  })
})

describe('cleanForAgent (#89 — « Copier pour l\'agent »)', () => {
  it('convertit les lignes fichier en chemins nus, garde titre et prose intacts', () => {
    const note = 'Refonte header\n\nRegarde la maquette :\n[fichier: /Users/remi/maquette.png]\net le CSV :\n[fichier: /Users/remi/data.csv]\n'
    expect(cleanForAgent(note)).toBe(
      'Refonte header\n\nRegarde la maquette :\n/Users/remi/maquette.png\net le CSV :\n/Users/remi/data.csv\n',
    )
  })

  it('laisse une note sans pièce jointe strictement inchangée', () => {
    const note = 'Titre\ncorps\n'
    expect(cleanForAgent(note)).toBe(note)
  })
})

describe('insertOnOwnLines (#89 — insertion au drop)', () => {
  it('coupe la ligne en cours : newline avant ET après le bloc', () => {
    const r = insertOnOwnLines('abcdef', 3, ['[fichier: /x]'])
    expect(r.content).toBe('abc\n[fichier: /x]\ndef')
    expect(r.caret).toBe(r.content.indexOf('def'))
  })

  it('en fin de note sans newline final : ajoute une ligne vierge pour continuer à écrire', () => {
    const r = insertOnOwnLines('titre', 5, ['[fichier: /x]'])
    expect(r.content).toBe('titre\n[fichier: /x]\n')
    expect(r.caret).toBe(r.content.length)
  })

  it('note vide et positions hors bornes : pas de newline parasite, clamp propre', () => {
    expect(insertOnOwnLines('', 0, ['[fichier: /x]']).content).toBe('[fichier: /x]\n')
    expect(insertOnOwnLines('ab', 99, ['L']).content).toBe('ab\nL\n')
    expect(insertOnOwnLines('ab', -4, ['L']).content).toBe('L\nab')
  })

  it('en début de ligne existante : pas de newline avant, un seul après', () => {
    const r = insertOnOwnLines('l1\nl2', 3, ['[fichier: /x]'])
    expect(r.content).toBe('l1\n[fichier: /x]\nl2')
  })

  it('insère plusieurs chemins, un par ligne', () => {
    const r = insertOnOwnLines('t\n', 2, ['[fichier: /a]', '[fichier: /b]'])
    expect(r.content).toBe('t\n[fichier: /a]\n[fichier: /b]\n')
  })
})

const dt = (over: { files?: { name: string; path?: unknown }[]; data?: Record<string, string> }) => ({
  files: over.files ?? [],
  getData: (t: string) => over.data?.[t] ?? '',
})

describe('extractDropPaths (#89 — canaux de chemin au drop)', () => {
  it('file.path absolu (Electron/local) : prioritaire', () => {
    const r = extractDropPaths(dt({ files: [{ name: 'm.png', path: '/Users/remi/m.png' }] }))
    expect(r).toEqual({ paths: ['/Users/remi/m.png'], names: [] })
  })

  it('text/uri-list file:// : décodé (espaces %20), apparié aux fichiers', () => {
    const r = extractDropPaths(dt({
      files: [{ name: 'm.png' }],
      data: { 'text/uri-list': 'file:///Users/remi/mes%20docs/m.png' },
    }))
    expect(r).toEqual({ paths: ['/Users/remi/mes docs/m.png'], names: [] })
  })

  it('uri-list seul (sans files) : tous les file:// pris, les autres schémas ignorés', () => {
    const r = extractDropPaths(dt({
      data: { 'text/uri-list': 'file:///a.png\r\nhttps://exemple.com/x\nfile:///b.png' },
    }))
    expect(r).toEqual({ paths: ['/a.png', '/b.png'], names: [] })
  })

  it('drag depuis un terminal : text/plain avec chemins absolus', () => {
    const r = extractDropPaths(dt({ data: { 'text/plain': ' /Users/remi/a.csv \n/Users/remi/b.csv' } }))
    expect(r).toEqual({ paths: ['/Users/remi/a.csv', '/Users/remi/b.csv'], names: [] })
  })

  it('navigateur pur (Finder → Chrome) : ni path ni uri → fallback NOMS, jamais de plantage', () => {
    const r = extractDropPaths(dt({ files: [{ name: 'maquette.png' }, { name: 'data.csv' }] }))
    expect(r).toEqual({ paths: [], names: ['maquette.png', 'data.csv'] })
  })

  it('texte quelconque (pas un chemin) : rien d\'extrait', () => {
    expect(extractDropPaths(dt({ data: { 'text/plain': 'juste du texte' } }))).toEqual({ paths: [], names: [] })
  })
})
