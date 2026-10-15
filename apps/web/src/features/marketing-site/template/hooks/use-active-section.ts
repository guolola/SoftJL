// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
'use client'

import { useEffect, useState } from 'react'

import { usePathname } from '@/shared/lib/template-navigation'

export const useActiveSection = (sectionIds: string[]) => {
  const pathname = usePathname()
  const [activeSection, setActiveSection] = useState<string>('')

  // Reset active section when pathname changes (route navigation)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Resetting state on route change is intentional
    setActiveSection('')
  }, [pathname])

  // Scroll to hash on mount if present
  useEffect(() => {
    const hash = window.location.hash.slice(1) // Remove the '#'

    if (hash && sectionIds.includes(hash)) {
      const element = document.getElementById(hash)

      if (element) {
        // Small delay to ensure page is fully loaded
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 100)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run only once on mount

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        // Find all visible sections
        const visibleSections = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => {
            // Sort by how much of the section is visible (intersection ratio)
            // and by position on screen (top edge)
            const ratioComparison = b.intersectionRatio - a.intersectionRatio

            if (ratioComparison !== 0) return ratioComparison

            return a.boundingClientRect.top - b.boundingClientRect.top
          })

        // Set the most visible section as active, or clear if none are visible
        if (visibleSections.length > 0) {
          setActiveSection(visibleSections[0].target.id)
        } else {
          setActiveSection('')
        }
      },
      {
        rootMargin: '-20% 0px -35% 0px', // Adjust when sections become "active"
        threshold: [0, 0.25, 0.5, 0.75, 1] // Multiple thresholds for better detection
      }
    )

    // Observe all sections
    sectionIds.forEach(id => {
      const element = document.getElementById(id)

      if (element) {
        observer.observe(element)
      }
    })

    return () => {
      observer.disconnect()
    }
  }, [sectionIds, pathname])

  return activeSection
}
