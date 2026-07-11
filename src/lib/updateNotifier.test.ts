import { describe, it, expect, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { shaFromResolved, autoUpdate } from './updateNotifier'
import { packageRoot } from './paths'

describe('shaFromResolved (#207)', () => {
  it('extrait le SHA d\'un champ resolved de package-lock (git dep GitHub)', () => {
    expect(shaFromResolved('git+ssh://git@github.com/5e1y/roadmapped.git#571589838c47bd3b883355243dad4d37b3dcaba4'))
      .toBe('571589838c47bd3b883355243dad4d37b3dcaba4')
    expect(shaFromResolved('git+https://github.com/5e1y/roadmapped.git#abc1234'))
      .toBe('abc1234')
  })

  it('renvoie null quand il n\'y a pas de SHA exploitable', () => {
    expect(shaFromResolved(undefined)).toBeNull()
    expect(shaFromResolved('https://registry.npmjs.org/roadmapped/-/roadmapped-0.1.0.tgz')).toBeNull() // pas de #
    expect(shaFromResolved('git+https://github.com/5e1y/roadmapped.git#not-a-sha!')).toBeNull()
    expect(shaFromResolved(42)).toBeNull()
  })
})

// #294 : autoUpdate applique la MAJ en tâche de fond. On injecte `run` pour ne
// JAMAIS spawner npm ; ROADMAPPED_FAKE_UPDATE force un état « en retard » (checkUpdate).
describe('autoUpdate (#294)', () => {
  const INFLIGHT = join(tmpdir(), 'roadmapped-update-inflight.json')
  const clearInflight = () => { try { rmSync(INFLIGHT) } catch { /* absent */ } }
  afterEach(() => { delete process.env.ROADMAPPED_FAKE_UPDATE; clearInflight() })

  it('à jour / clone de dev (packageDir/.git) → n\'applique rien', async () => {
    let calls = 0
    // packageRoot() porte un .git → checkUpdate renvoie null (self-host, jamais d'auto-MAJ).
    await autoUpdate(packageRoot(), '/tmp/host', () => { calls++ })
    expect(calls).toBe(0)
  })

  it('en retard, pas de verrou → applique une fois, avec le hostRoot', async () => {
    clearInflight()
    process.env.ROADMAPPED_FAKE_UPDATE = '1'
    const hosts: string[] = []
    await autoUpdate(packageRoot(), '/tmp/host', (h) => { hosts.push(h) })
    expect(hosts).toEqual(['/tmp/host'])
  })

  it('verrou frais (même remote) → ne relance pas un install déjà en cours', async () => {
    clearInflight()
    process.env.ROADMAPPED_FAKE_UPDATE = '1'
    let calls = 0
    await autoUpdate(packageRoot(), '/tmp/host', () => { calls++ }) // pose le verrou
    await autoUpdate(packageRoot(), '/tmp/host', () => { calls++ }) // bloqué par le verrou
    expect(calls).toBe(1)
  })
})
