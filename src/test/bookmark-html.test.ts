import { describe, it, expect } from 'vitest'
import { parseImportedTree } from '../store'
import { toBookmarkHtml } from '../bookmarkHtml'
import type { TreeNode } from '../types'

// Trimmed from a real Chrome export: unclosed <DT>s, stray <p>s, ICON favicons.
const CHROME_EXPORT = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1747748466" LAST_MODIFIED="1790883719" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><H3 ADD_DATE="1747748555" LAST_MODIFIED="0">Linux</H3>
        <DL><p>
            <DT><A HREF="https://askubuntu.com/questions/44122" ADD_DATE="1737991939" ICON="data:image/png;base64,AAAA">How to upgrade - Ask Ubuntu</A>
        </DL><p>
        <DT><A HREF="https://account.proton.me/mail" ADD_DATE="1776897521">Proton Mail</A>
        <DT><A HREF="chrome://wallet/crypto/unlock" ADD_DATE="1765928687">Wallet</A>
        <DT><A HREF="https://example.com/?a=1&amp;b=2">Q &amp; A</A>
    </DL><p>
    <DT><H3 ADD_DATE="1755471662">UI Libraries</H3>
    <DL><p>
        <DT><A HREF="https://reactbits.dev/">React Bits</A>
    </DL><p>
    <DT><A HREF="https://www.reddit.com/r/unixporn/">r/unixporn</A>
</DL><p>
`

// Ids are regenerated on import, so compare everything else.
const strip = (nodes: TreeNode[]): unknown[] =>
  nodes.map((n) => (n.type === 'link'
    ? { name: n.name, url: n.url }
    : { name: n.name, icon: n.icon, children: strip(n.children) }))

describe('bookmark HTML import', () => {
  it('reads a browser export, keeping nesting and dropping non-http links', () => {
    expect(strip(parseImportedTree(CHROME_EXPORT))).toEqual([
      {
        name: 'Bookmarks bar', icon: 'folder', children: [
          { name: 'Linux', icon: 'folder', children: [
            { name: 'How to upgrade - Ask Ubuntu', url: 'https://askubuntu.com/questions/44122' },
          ] },
          { name: 'Proton Mail', url: 'https://account.proton.me/mail' },
          { name: 'Q & A', url: 'https://example.com/?a=1&b=2' },
        ],
      },
      { name: 'UI Libraries', icon: 'folder', children: [{ name: 'React Bits', url: 'https://reactbits.dev/' }] },
      { name: 'r/unixporn', url: 'https://www.reddit.com/r/unixporn/' },
    ])
  })

  it('round-trips an export, including folder icons and characters needing escaping', () => {
    const tree: TreeNode[] = [
      { id: '1', type: 'folder', name: 'Work <stuff> & "things"', icon: 'star', children: [
        { id: '2', type: 'link', name: 'Search', url: 'https://example.com/?q="x"&y=<z>' },
        { id: '3', type: 'folder', name: 'Empty', icon: 'folder', children: [] },
      ] },
      { id: '4', type: 'link', name: 'Top', url: 'https://top.example/' },
    ]
    expect(strip(parseImportedTree(toBookmarkHtml(tree)))).toEqual(strip(tree))
  })

  it('still reads JSON exports', () => {
    const json = JSON.stringify([{ type: 'link', name: 'A', url: 'https://a.com' }])
    expect(strip(parseImportedTree(json))).toEqual([{ name: 'A', url: 'https://a.com' }])
  })
})
