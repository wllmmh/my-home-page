import { useState, useEffect, useCallback } from 'react'
import { STATIC_SHORTCUTS } from './shortcuts'
import { ICONS } from './icons'
import type { TreeNode, FolderNode, LinkNode, Settings } from './types'
import defaultWallpaper from './default-wallpaper.png'
import { parseBookmarkHtml } from './bookmarkHtml'

const KEY = 'myhomepage.tree.v1'
const SHORTCUTS_KEY = 'myhomepage.shortcuts.v1'
const SETTINGS_KEY = 'myhomepage.settings.v1'
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

// Off-black, matching the old dark-theme page background (--background in
// index.css) — the default so white headline text has contrast out of the box.
export const DEFAULT_BACKGROUND_COLOR = '#090b0c'

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  locale: 'system',
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  dateFormat: 'long',
  backgroundImage: defaultWallpaper,
  backgroundColor: DEFAULT_BACKGROUND_COLOR,
  textTheme: 'light',
  glass: true,
  openInNewTab: false,
}

export const newFolder = (name: string, icon = 'folder'): FolderNode => ({
  id: uid(), type: 'folder', name, icon, children: [],
})
export const newLink = (name: string, url: string): LinkNode => ({ id: uid(), type: 'link', name, url })

/**
 * Coerce the loose nodes read out of an imported file into well-formed tree
 * nodes.
 *
 * The file is user-supplied and may be hand-edited, from an older version, or
 * simply not a bookmark file at all, so nothing about its shape is trusted:
 * anything that isn't a usable folder or link is dropped rather than allowed
 * to reach the renderer as a half-node.
 *
 * Ids are always regenerated. An imported file can legitimately contain ids
 * already present in the tree (re-importing a previous export of it, say), and
 * every tree operation — edit, delete, move, React keys — matches on id, so a
 * collision would make two nodes act as one.
 */
function sanitizeNodes(input: unknown, depth = 0): TreeNode[] {
  // Depth cap: a deeply nested (or maliciously constructed) file would other-
  // wise recurse until the stack blows.
  if (!Array.isArray(input) || depth > 20) return []

  return input.flatMap((raw): TreeNode[] => {
    if (!raw || typeof raw !== 'object') return []

    const name = typeof raw.name === 'string' ? raw.name.trim() : ''

    if (raw.type === 'folder') {
      // `hasOwn`, not `in`: `in` walks the prototype chain, so a file with
      // `"icon": "constructor"` would pass validation and store a junk key.
      const icon = typeof raw.icon === 'string' && Object.hasOwn(ICONS, raw.icon) ? raw.icon : 'folder'
      return [{
        id: uid(),
        type: 'folder',
        name: name || 'Untitled folder',
        icon,
        children: sanitizeNodes(raw.children, depth + 1),
      }]
    }

    if (raw.type === 'link') {
      const url = typeof raw.url === 'string' ? raw.url.trim() : ''
      if (!url || !isSafeUrl(url)) return []
      return [{ id: uid(), type: 'link', name: name || url, url }]
    }

    return []
  })
}

/**
 * Only http(s) links are importable. A file could otherwise carry a
 * `javascript:` URL that runs in this page's origin the moment it's clicked,
 * which would turn importing someone's bookmarks into running their code.
 */
function isSafeUrl(url: string) {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

/** Nodes parsed out of a bookmark HTML file, or [] if it isn't one. */
export function parseImportedTree(text: string): TreeNode[] {
  return sanitizeNodes(parseBookmarkHtml(text))
}

/**
 * Add `incoming` nodes to `existing` (both the children of one directory),
 * skipping duplicates: a link whose URL is already in the directory, and a
 * folder whose name matches an existing folder is merged into it rather than
 * duplicated, applying the same rule to its children. Duplicates within
 * `incoming` itself are dropped too.
 */
export function mergeNodes(existing: TreeNode[], incoming: TreeNode[]): TreeNode[] {
  return incoming.reduce((acc, node) => {
    if (node.type === 'link') {
      return acc.some((n) => n.type === 'link' && n.url === node.url) ? acc : [...acc, node]
    }
    const match = acc.find((n): n is FolderNode => n.type === 'folder' && n.name === node.name)
    if (!match) return [...acc, { ...node, children: mergeNodes([], node.children) }]
    return acc.map((n) => (n === match ? { ...match, children: mergeNodes(match.children, node.children) } : n))
  }, existing)
}

// What a fresh load gets, same idea as `DEFAULT_SHORTCUTS` for the shortcut grid.
const DEFAULT_BOOKMARKS: TreeNode[] = [
  { id: 'default-bookmark-0', type: 'link', name: 'wllmmh.github.io', url: 'https://wllmmh.github.io' },
]

function load(): TreeNode[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_BOOKMARKS
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : DEFAULT_BOOKMARKS
  } catch {
    return DEFAULT_BOOKMARKS
  }
}

/** Where within a folder to place a node: next to the sibling `id`. Without one, a node goes last. */
export interface Anchor {
  id: string
  after: boolean
}

function place(siblings: TreeNode[], node: TreeNode, anchor?: Anchor): TreeNode[] {
  const i = anchor ? siblings.findIndex((n) => n.id === anchor.id) : -1
  if (!anchor || i < 0) return [...siblings, node]
  const at = anchor.after ? i + 1 : i
  return [...siblings.slice(0, at), node, ...siblings.slice(at)]
}

/** Recursively insert `node` into the folder with id `parentId` (null = root). */
function insert(nodes: TreeNode[], parentId: string | null, node: TreeNode, anchor?: Anchor): TreeNode[] {
  if (parentId === null) return place(nodes, node, anchor)
  return nodes.map((n) => {
    if (n.id === parentId && n.type === 'folder') {
      return { ...n, children: place(n.children, node, anchor) }
    }
    if (n.type === 'folder') {
      return { ...n, children: insert(n.children, parentId, node, anchor) }
    }
    return n
  })
}

function remove(nodes: TreeNode[], id: string): TreeNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => (n.type === 'folder' ? { ...n, children: remove(n.children, id) } : n))
}

function update(nodes: TreeNode[], id: string, patch: Partial<TreeNode>): TreeNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, ...patch } as TreeNode
    if (n.type === 'folder') return { ...n, children: update(n.children, id, patch) }
    return n
  })
}

/** True if `id` is `targetId` itself, or `targetId` lies somewhere inside `id`'s subtree. */
function contains(node: TreeNode, targetId: string): boolean {
  if (node.id === targetId) return true
  if (node.type !== 'folder') return false
  return node.children.some((c) => contains(c, targetId))
}

/**
 * Move node `id` to be a child of the folder `targetId` (null = root), last
 * unless `anchor` names a sibling to sit next to. No-op if the move is invalid.
 */
function move(nodes: TreeNode[], id: string, targetId: string | null, anchor?: Anchor): TreeNode[] {
  if (id === targetId || id === anchor?.id) return nodes
  const node = findPath(nodes, id)?.at(-1)
  if (!node) return nodes
  if (targetId !== null) {
    const target = findPath(nodes, targetId)?.at(-1)
    if (!target || target.type !== 'folder') return nodes
    if (contains(node, targetId)) return nodes
  }
  return insert(remove(nodes, id), targetId, node, anchor)
}

/** Path of folder nodes from root down to `id`, for breadcrumbs. */
export function findPath(nodes: TreeNode[], id: string, trail: TreeNode[] = []): TreeNode[] | null {
  for (const n of nodes) {
    if (n.id === id) return [...trail, n]
    if (n.type === 'folder') {
      const hit = findPath(n.children, id, [...trail, n])
      if (hit) return hit
    }
  }
  return null
}

export function useTree() {
  const [tree, setTree] = useState(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(tree))
    } catch {
      /* quota or disabled storage — keep working in memory */
    }
  }, [tree])

  return {
    tree,
    addNode: useCallback((parentId: string | null, node: TreeNode) => setTree((t) => insert(t, parentId, node)), []),
    removeNode: useCallback((id: string) => setTree((t) => remove(t, id)), []),
    updateNode: useCallback((id: string, patch: Partial<TreeNode>) => setTree((t) => update(t, id, patch)), []),
    moveNode: useCallback(
      (id: string, targetId: string | null, anchor?: Anchor) => setTree((t) => move(t, id, targetId, anchor)),
      [],
    ),
    // Merges into the root rather than replacing, so an import can never
    // silently destroy bookmarks the user already had, and skips anything
    // already present in the same directory.
    importNodes: useCallback((nodes: TreeNode[]) => setTree((t) => mergeNodes(t, nodes)), []),
  }
}

function loadShortcuts(): LinkNode[] {
  try {
    const raw = localStorage.getItem(SHORTCUTS_KEY)
    if (!raw) return STATIC_SHORTCUTS
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : STATIC_SHORTCUTS
  } catch {
    return STATIC_SHORTCUTS
  }
}

export function useShortcuts() {
  const [shortcuts, setShortcuts] = useState(loadShortcuts)

  useEffect(() => {
    try {
      localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcuts))
    } catch {
      /* quota or disabled storage — keep working in memory */
    }
  }, [shortcuts])

  return {
    shortcuts,
    addShortcut: useCallback((node: LinkNode) => setShortcuts((s) => [...s, node]), []),
    removeShortcut: useCallback((id: string) => setShortcuts((s) => s.filter((n) => n.id !== id)), []),
    updateShortcut: useCallback(
      (id: string, patch: Partial<LinkNode>) => setShortcuts((s) => s.map((n) => (n.id === id ? { ...n, ...patch } : n))),
      []
    ),
  }
}

// The name can be set straight from the address: `index.html#Ada`. A hash is
// used rather than a path segment or a query — `index.html/Ada` would ask the
// filesystem for a file inside a non-directory and 404 before any of this
// runs, and the built page is opened at a `file://` path with no server around
// to rewrite it. The fragment never leaves the browser, so it works there.
//
// It's read once at load and then persisted like any other setting, so the
// name sticks after the hash is dropped; a bare `#` clears it back to the
// plain greeting rather than being ignored.
function nameFromUrl(): string | null {
  try {
    const hash = window.location.hash
    if (!hash.startsWith('#')) return null
    // `decodeURIComponent` throws on a malformed escape (a stray `%`), which
    // would otherwise take the whole settings load down with it.
    let value: string
    try {
      value = decodeURIComponent(hash.slice(1).replace(/\+/g, ' '))
    } catch {
      value = hash.slice(1)
    }
    // Long inputs would blow out the headline, so cap what a link can set.
    return value.trim().slice(0, 40)
  } catch {
    return null
  }
}

function loadSettings(): Settings {
  const urlName = nameFromUrl()
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    const stored: Settings = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
    return urlName === null ? stored : { ...stored, name: urlName }
  } catch {
    return urlName === null ? DEFAULT_SETTINGS : { ...DEFAULT_SETTINGS, name: urlName }
  }
}

export function useSettings() {
  const [settings, setSettings] = useState(loadSettings)

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      /* quota or disabled storage — keep working in memory */
    }
  }, [settings])

  return {
    settings,
    updateSettings: useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []),
  }
}
