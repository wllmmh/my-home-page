export { cn } from "cn"

/**
 * Whether keyboard focus is in somewhere that takes text — an input, a
 * textarea, a select or anything contenteditable — so a single-key page
 * shortcut should leave the key alone rather than hijack a literal character.
 */
export function isTyping() {
  const el = document.activeElement as HTMLElement | null
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    el?.isContentEditable === true
  )
}
