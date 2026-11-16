import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The type ladder of index.css. Without it tailwind-merge reads `text-caption` as a colour and would
// drop the colour class next to it.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['hero-title', 'page-title', 'section-title', 'subhead', 'body', 'button', 'link', 'nav', 'list', 'caption'] }],
    },
  },
})

/** Joins class names; a later Tailwind class wins over an earlier one of the same kind (shadcn/ui). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
