import type { TreeNode } from './types'

/**
 * The Netscape bookmark file format — what every major browser exports and
 * imports (Chrome, Firefox, Edge, Safari). Its structure is a `<DL>` per
 * folder, holding one `<DT>` per entry: `<DT><H3>name</H3><DL>…</DL>` for a
 * folder, `<DT><A HREF="…">name</A>` for a link.
 */

/**
 * Read a bookmark HTML file into loose `{ type, name, url, icon, children }`
 * nodes, left for `sanitizeNodes` to validate.
 *
 * Parsed with `DOMParser`, which builds an inert document — no scripts run,
 * no images or favicons load — so reading an untrusted file is safe.
 */
export function parseBookmarkHtml(text: string): unknown[] {
  const doc = new DOMParser().parseFromString(text, 'text/html')
  const root = doc.querySelector('dl')
  return root ? readDl(root, 0) : []
}

function readDl(dl: Element, depth: number): unknown[] {
  // Same cap as `sanitizeNodes`; anything deeper would be dropped there anyway.
  if (depth > 20) return []

  // The format never closes its `<DT>`s and sprinkles stray `<p>`s, so the
  // HTML parser's recovery decides where each entry ends up. Rather than
  // assume an exact shape, take every `<DT>` whose nearest `<DL>` is this one.
  return Array.from(dl.querySelectorAll('dt'))
    .filter((dt) => dt.parentElement?.closest('dl') === dl)
    .flatMap((dt): unknown[] => {
      const heading = dt.querySelector(':scope > h3')
      if (heading) {
        const sub = dt.querySelector(':scope > dl')
        return [{
          type: 'folder',
          name: heading.textContent ?? '',
          icon: heading.getAttribute('data-icon') ?? undefined,
          children: sub ? readDl(sub, depth + 1) : [],
        }]
      }
      const a = dt.querySelector(':scope > a')
      if (a) return [{ type: 'link', name: a.textContent ?? '', url: a.getAttribute('href') ?? '' }]
      return []
    })
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Write the tree as a bookmark HTML file any browser can import. A folder's
 * icon has no equivalent in the format, so it rides along in a `data-icon`
 * attribute — browsers ignore it, `parseBookmarkHtml` reads it back.
 */
export function toBookmarkHtml(nodes: TreeNode[]): string {
  const write = (list: TreeNode[], indent: string): string =>
    list
      .map((n) =>
        n.type === 'link'
          ? `${indent}<DT><A HREF="${escape(n.url)}">${escape(n.name)}</A>\n`
          : `${indent}<DT><H3 data-icon="${escape(n.icon)}">${escape(n.name)}</H3>\n` +
            `${indent}<DL><p>\n${write(n.children, indent + '    ')}${indent}</DL><p>\n`
      )
      .join('')

  return (
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n' +
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n' +
    '<TITLE>Bookmarks</TITLE>\n' +
    '<H1>Bookmarks</H1>\n' +
    `<DL><p>\n${write(nodes, '    ')}</DL><p>\n`
  )
}
