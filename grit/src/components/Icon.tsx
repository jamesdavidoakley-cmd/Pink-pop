/**
 * Hand-drawn-feeling icons. Everything a child needs to understand a button is
 * carried by the picture; the words underneath are for the grown-up reading
 * over their shoulder.
 */

export type IconName =
  | 'tyre'
  | 'knobbly'
  | 'chains'
  | 'sand'
  | 'weights'
  | 'liftaxle'
  | 'boards'
  | 'tank'
  | 'paint'
  | 'horn'
  | 'hat'
  | 'dog'
  | 'mudflaps'
  | 'name'
  | 'thumb-up'
  | 'thumb-down'
  | 'lorry'
  | 'shop'
  | 'play'
  | 'back'
  | 'cog'
  | 'lock'
  | 'tick'
  | 'star'
  | 'shovel'
  | 'crate'
  | 'speaker'
  | 'replay'

interface Props {
  name: IconName
  className?: string
  title?: string
}

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function Icon({ name, className, title }: Props) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {paths(name)}
    </svg>
  )
}

function paths(name: IconName) {
  switch (name) {
    case 'tyre':
      return (
        <>
          <circle cx="32" cy="32" r="23" {...STROKE} />
          <circle cx="32" cy="32" r="9" {...STROKE} />
          <path d="M32 9v9M32 46v9M9 32h9M46 32h9" {...STROKE} />
        </>
      )
    case 'knobbly':
      return (
        <>
          <circle cx="32" cy="32" r="21" {...STROKE} />
          <circle cx="32" cy="32" r="8" {...STROKE} />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
            const r = (a * Math.PI) / 180
            return (
              <path
                key={a}
                d={`M${32 + Math.cos(r) * 21} ${32 + Math.sin(r) * 21}L${32 + Math.cos(r) * 29} ${32 + Math.sin(r) * 29}`}
                {...STROKE}
                strokeWidth={7}
              />
            )
          })}
        </>
      )
    case 'chains':
      return (
        <>
          <circle cx="32" cy="32" r="21" {...STROKE} />
          <path d="M11 32h42M32 11v42M17 17l30 30M47 17L17 47" {...STROKE} strokeWidth={4} />
        </>
      )
    case 'sand':
      return (
        <>
          <path d="M20 10h24l-6 18H26z" {...STROKE} />
          <path d="M26 28l-8 26h28l-8-26" {...STROKE} />
          <circle cx="26" cy="44" r="2.5" fill="currentColor" />
          <circle cx="36" cy="48" r="2.5" fill="currentColor" />
        </>
      )
    case 'weights':
      return (
        <>
          <circle cx="32" cy="32" r="20" {...STROKE} />
          <circle cx="32" cy="32" r="7" fill="currentColor" />
          <path d="M32 12v6M32 46v6M12 32h6M46 32h6" {...STROKE} strokeWidth={8} />
        </>
      )
    case 'liftaxle':
      return (
        <>
          <circle cx="20" cy="46" r="9" {...STROKE} />
          <circle cx="46" cy="46" r="9" {...STROKE} />
          <path d="M10 34h44" {...STROKE} />
          <path d="M32 28V10M24 18l8-9 8 9" {...STROKE} />
        </>
      )
    case 'boards':
      return (
        <>
          <rect x="8" y="20" width="48" height="10" rx="3" {...STROKE} />
          <rect x="8" y="36" width="48" height="10" rx="3" {...STROKE} />
          <path d="M18 20v10M30 20v10M42 20v10M18 36v10M30 36v10M42 36v10" {...STROKE} strokeWidth={3} />
        </>
      )
    case 'tank':
      return (
        <>
          <rect x="10" y="18" width="44" height="30" rx="8" {...STROKE} />
          <path d="M14 36c6-4 10 4 16 0s10 4 16 0" {...STROKE} strokeWidth={5} />
        </>
      )
    case 'paint':
      return (
        <>
          <path d="M18 14h28v10a14 14 0 0 1-28 0z" {...STROKE} />
          <path d="M32 38v14" {...STROKE} />
          <ellipse cx="32" cy="55" rx="7" ry="5" {...STROKE} />
        </>
      )
    case 'horn':
      return (
        <>
          <path d="M12 26h14l18-12v36L26 38H12z" {...STROKE} />
          <path d="M50 22c5 6 5 14 0 20" {...STROKE} />
        </>
      )
    case 'hat':
      return (
        <>
          <path d="M18 36a14 14 0 0 1 28 0" {...STROKE} />
          <path d="M10 40h44" {...STROKE} strokeWidth={8} />
        </>
      )
    case 'dog':
      return (
        <>
          <circle cx="32" cy="36" r="16" {...STROKE} />
          <path d="M18 22c-4-8-2-12 4-10M46 22c4-8 2-12-4-10" {...STROKE} />
          <circle cx="26" cy="34" r="2.5" fill="currentColor" />
          <circle cx="38" cy="34" r="2.5" fill="currentColor" />
          <circle cx="32" cy="42" r="4" fill="currentColor" />
        </>
      )
    case 'mudflaps':
      return (
        <>
          <circle cx="24" cy="30" r="12" {...STROKE} />
          <rect x="38" y="24" width="14" height="26" rx="3" {...STROKE} />
        </>
      )
    case 'name':
      return (
        <>
          <rect x="8" y="18" width="48" height="28" rx="5" {...STROKE} />
          <path d="M18 36l6-12 6 12M20 32h8M38 26v10M38 26h6a4 4 0 0 1 0 8h-6" {...STROKE} strokeWidth={4} />
        </>
      )
    case 'thumb-up':
      return (
        <>
          <path d="M20 28h-6a4 4 0 0 0-4 4v18a4 4 0 0 0 4 4h6z" {...STROKE} />
          <path d="M20 28l10-18a6 6 0 0 1 6 6v10h12a6 6 0 0 1 6 7l-3 15a6 6 0 0 1-6 6H20z" {...STROKE} />
        </>
      )
    case 'thumb-down':
      return (
        <>
          <path d="M20 36h-6a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4h6z" {...STROKE} />
          <path d="M20 36l10 18a6 6 0 0 0 6-6V38h12a6 6 0 0 0 6-7l-3-15a6 6 0 0 0-6-6H20z" {...STROKE} />
        </>
      )
    case 'lorry':
      return (
        <>
          <path d="M6 40V20h28v20" {...STROKE} />
          <path d="M34 40V26h12l8 10v4" {...STROKE} />
          <circle cx="18" cy="46" r="6" {...STROKE} />
          <circle cx="44" cy="46" r="6" {...STROKE} />
        </>
      )
    case 'shop':
      return (
        <>
          <path d="M10 24h44l-4 28H14z" {...STROKE} />
          <path d="M22 24v-6a10 10 0 0 1 20 0v6" {...STROKE} />
        </>
      )
    case 'play':
      return <path d="M20 12l30 20-30 20z" {...STROKE} />
    case 'back':
      return <path d="M40 12L20 32l20 20" {...STROKE} strokeWidth={8} />
    case 'cog':
      return (
        <>
          <circle cx="32" cy="32" r="9" {...STROKE} />
          <path
            d="M32 8v8M32 48v8M8 32h8M48 32h8M15 15l6 6M43 43l6 6M49 15l-6 6M21 43l-6 6"
            {...STROKE}
          />
        </>
      )
    case 'lock':
      return (
        <>
          <rect x="14" y="28" width="36" height="26" rx="5" {...STROKE} />
          <path d="M22 28v-8a10 10 0 0 1 20 0v8" {...STROKE} />
        </>
      )
    case 'tick':
      return <path d="M12 34l14 14 26-30" {...STROKE} strokeWidth={9} />
    case 'star':
      return (
        <path
          d="M32 8l7 15 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2z"
          {...STROKE}
          strokeWidth={5}
        />
      )
    case 'shovel':
      return (
        <>
          <path d="M44 10l10 10-18 18-10-10z" {...STROKE} />
          <path d="M26 28L12 42" {...STROKE} />
          <path d="M6 42h14v14z" {...STROKE} />
        </>
      )
    case 'crate':
      return (
        <>
          <rect x="10" y="16" width="44" height="34" rx="4" {...STROKE} />
          <path d="M32 16v34M10 30h44" {...STROKE} strokeWidth={4} />
        </>
      )
    case 'speaker':
      return (
        <>
          <path d="M12 26h10l12-10v32L22 38H12z" {...STROKE} />
          <path d="M42 24c4 5 4 11 0 16" {...STROKE} />
        </>
      )
    case 'replay':
      return (
        <>
          <path d="M50 32a18 18 0 1 1-6-13" {...STROKE} />
          <path d="M46 8v12H34" {...STROKE} />
        </>
      )
    default:
      return null
  }
}
