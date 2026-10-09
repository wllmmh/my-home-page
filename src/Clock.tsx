import { useState, useEffect, useRef } from 'react'
import SplitFlapText from './components/SplitFlapText'
import { greetingFor } from './Greeting'
import { dateFormatOptions } from './dateFormats'
import { useI18n } from './i18n'
import { headlineStrongCls } from './textTheme'
import type { Settings } from './types'

export default function Clock({ settings }: { settings: Settings }) {
  const [now, setNow] = useState(() => new Date())
  const prevTime = useRef<string | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const { t, formatDate, formatDateParts, hour12, timeZoneName } = useI18n()

  // The meridiem is split off the flap board deliberately: it changes twice a
  // day, so flipping it alongside the seconds reads as noise, and as two more
  // tiles it made "AM"/"PM" look like part of the number. It's set as ordinary
  // sentence text below instead.
  //
  // Splitting on a space would only work for locales that separate the two
  // that way; `formatToParts` names each field, so the digits and the meridiem
  // are pulled out by type no matter how the locale arranges or punctuates
  // them. `hour12` comes from the locale, so a 24-hour locale simply has no
  // dayPeriod part and renders no meridiem.
  const timeParts = formatDateParts(now, {
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12,
  })
  const meridiem = timeParts.find((p) => p.type === 'dayPeriod')?.value ?? ''
  // Everything except the meridiem (and the space that separates it) forms the
  // flap board, so locale-specific separators — a dot rather than a colon, say
  // — are preserved on the tiles.
  const time = timeParts
    .filter((p) => p.type !== 'dayPeriod')
    .map((p) => p.value)
    .join('')
    .trim()

  const date = formatDate(now, dateFormatOptions(settings.dateFormat))
  const greeting = greetingFor(now, t, formatDateParts)

  // SplitFlapText animates between the two phrases in `words` — feed it
  // [previous tick, current tick] so each change flips instead of snapping,
  // then remember this tick as "previous" for next time.
  const words = [prevTime.current ?? time, time]
  useEffect(() => {
    prevTime.current = time
  }, [time])

  const name = settings.name.trim()

  return (
    <div className="mb-8">
      {/* Salutation — the one piece of the header that's about the reader, so
          it carries the weight; the clock sentence underneath is supporting. */}
      <h1 className={`[text-shadow:0_1px_2px_rgb(0_0_0/0.7),0_1px_6px_rgb(0_0_0/0.5)] text-[clamp(28px,5vw,44px)] font-semibold leading-[1.1] tracking-tight ${headlineStrongCls(settings.textTheme)}`}>
        {/* Whole-sentence salutation from the catalog: a language that needs
            the name first, or different punctuation, changes only its own
            message rather than this markup. The name is emphasized by
            splitting the rendered sentence on it.

            `lastIndexOf`, not `indexOf`: a name that also occurs in the
            greeting — "Good", say — would otherwise match the greeting's copy
            and emphasize that instead, rendering "*Good* morning, Good." The
            name is the last thing every catalog interpolates, so searching
            from the end finds the right occurrence. */}
        {name ? (
          (() => {
            const sentence = t.salutationNamed(greeting, name)
            const at = sentence.lastIndexOf(name)
            // -1 only if a catalog dropped the name from its sentence; render
            // it whole rather than losing the salutation entirely.
            if (at === -1) return sentence
            return (
              <>
                {sentence.slice(0, at)}
                <span className="font-normal">{name}</span>
                {sentence.slice(at + name.length)}
              </>
            )
          })()
        ) : (
          t.salutation(greeting)
        )}
      </h1>

      {/* "It is {date} {time} in {timezone}." — one sentence, with the flip
          tiles set inline so the clock reads as part of the line rather than
          as a separate widget. `items-baseline` + `flex-wrap` keeps the words
          on the text baseline and lets the sentence wrap on narrow screens
          without the tiles overflowing. */}
      {/* The visible sentence is assembled from three separately-styled
          pieces, one of which is a grid of animated character tiles — read
          literally, that is unusable.

          The fix is a real, visually-hidden sentence rather than an
          `aria-label` on the <p>: `aria-label` is prohibited on an element
          with no role, so it would simply be discarded. The visible pieces are
          then hidden from assistive tech, leaving exactly one reading of the
          time.

          Deliberately NOT `aria-live`: the seconds change every tick, and a
          live region here would announce the time endlessly, drowning out the
          rest of the page. The time is read on demand instead — which is how
          a clock on a wall works too. */}
      <p className={`[text-shadow:0_1px_3px_rgb(0_0_0/0.95),0_2px_9px_rgb(0_0_0/0.75)] mt-2.5 flex flex-wrap items-baseline gap-x-[0.4em] gap-y-1.5 text-[clamp(13px,1.7vw,17px)] font-semibold leading-snug ${headlineStrongCls(settings.textTheme)}`}>
        <span className="sr-only">
          {t.clockLabel(date, meridiem ? `${time} ${meridiem}` : time, timeZoneName)}
        </span>
        <span aria-hidden="true">{t.clockBefore(date)}</span>
        <SplitFlapText
          aria-hidden="true"
          words={words}
          loop={false}
          cycleDelay={40}
          padTo={time.length}
          flipDuration={0.12}
          stagger={0.04}
          // The tiles are set as plain text inside the sentence (see
          // `.clock-flaps` in SplitFlapText.css), so the board's card props —
          // tile color, radius, its own font — don't apply; the digits inherit
          // color and type from the paragraph.
          className="clock-flaps"
          gap={0}
          fontSize="1em"
        />
        <span aria-hidden="true" className="-ms-[0.15em]">{t.clockAfter(meridiem, timeZoneName)}</span>
      </p>
    </div>
  )
}
