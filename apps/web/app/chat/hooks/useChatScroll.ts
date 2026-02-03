"use client"

import { useCallback, useEffect, useRef, useState } from "react"

interface UseChatScrollOptions {
  /**
   * Threshold in pixels - if user is within this distance from bottom,
   * they're considered "at bottom" and will auto-scroll
   */
  threshold?: number
  /**
   * Delay in ms before re-enabling auto-scroll after user scrolls back to bottom
   * This prevents flickering on mobile where scroll events fire rapidly
   */
  debounceMs?: number
}

interface UseChatScrollResult {
  /** Ref to attach to the scroll container */
  containerRef: React.RefObject<HTMLDivElement | null>
  /** Ref to attach to the anchor element at the bottom */
  anchorRef: React.RefObject<HTMLDivElement | null>
  /** Whether user has scrolled away from bottom (reading history) */
  isScrolledAway: boolean
  /** Scroll to bottom programmatically */
  scrollToBottom: (behavior?: ScrollBehavior) => void
  /** Call this when user sends a message - forces scroll regardless of position */
  forceScrollToBottom: () => void
}

/**
 * Smart chat scroll hook using Intersection Observer.
 *
 * How it works:
 * 1. An invisible anchor element is placed at the bottom of the message list
 * 2. IntersectionObserver watches if this anchor is visible
 * 3. When anchor is visible → user is at bottom → auto-scroll enabled
 * 4. When anchor is NOT visible → user scrolled up → auto-scroll disabled
 *
 * This is more reliable than scroll position math, especially on mobile where:
 * - Touch scrolling has momentum/inertia
 * - Scroll events fire at unpredictable times
 * - Virtual keyboards can cause layout shifts
 *
 * Based on patterns from Slack, Discord, and react-scroll-to-bottom library.
 */
export function useChatScroll(options: UseChatScrollOptions = {}): UseChatScrollResult {
  const { threshold = 100, debounceMs = 150 } = options

  const containerRef = useRef<HTMLDivElement | null>(null)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  // Core state: is the user scrolled away from bottom?
  const [isScrolledAway, setIsScrolledAway] = useState(false)

  // Track if we're programmatically scrolling (to ignore those scroll events)
  const isProgrammaticScroll = useRef(false)

  // Track if user intentionally scrolled up (vs just momentum)
  const lastScrollTop = useRef(0)
  const scrollUpCount = useRef(0)

  // Debounce timer for scroll-to-bottom detection
  const debounceTimer = useRef<NodeJS.Timeout | null>(null)

  // Force scroll flag - when user sends a message
  const shouldForceScroll = useRef(false)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    if (!anchorRef.current) return

    isProgrammaticScroll.current = true
    anchorRef.current.scrollIntoView({ behavior, block: "end" })

    // Reset after scroll completes
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isProgrammaticScroll.current = false
      })
    })
  }, [])

  const forceScrollToBottom = useCallback(() => {
    shouldForceScroll.current = true
    setIsScrolledAway(false)
    scrollToBottom("auto")
    shouldForceScroll.current = false
  }, [scrollToBottom])

  // Set up Intersection Observer to detect when anchor is visible
  useEffect(() => {
    if (!anchorRef.current || !containerRef.current) return

    // Disconnect any existing observer
    if (observerRef.current) {
      observerRef.current.disconnect()
    }

    const container = containerRef.current

    observerRef.current = new IntersectionObserver(
      entries => {
        const [entry] = entries
        if (!entry) return

        // If anchor is visible (or nearly visible), user is at bottom
        // Using a rootMargin to give some buffer
        if (entry.isIntersecting) {
          // User scrolled back to bottom - re-enable auto-scroll
          // Use debounce to prevent flickering on mobile
          if (debounceTimer.current) {
            clearTimeout(debounceTimer.current)
          }
          debounceTimer.current = setTimeout(() => {
            setIsScrolledAway(false)
            scrollUpCount.current = 0
          }, debounceMs)
        }
        // Anchor not visible - but only set scrolled away if user actively scrolled up
        // Don't set it just because content pushed anchor out of view
      },
      {
        root: container,
        // Extend the intersection area by threshold pixels at the bottom
        // This means we consider "at bottom" if within threshold px
        rootMargin: `0px 0px ${threshold}px 0px`,
        threshold: 0,
      },
    )

    observerRef.current.observe(anchorRef.current)

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
    }
  }, [threshold, debounceMs])

  // Detect intentional scroll UP to set isScrolledAway
  // IntersectionObserver alone can't distinguish between:
  // 1. User scrolling up (should lock position)
  // 2. New content pushing anchor out of view (should NOT lock)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      // Ignore programmatic scrolls
      if (isProgrammaticScroll.current || shouldForceScroll.current) {
        lastScrollTop.current = container.scrollTop
        return
      }

      const currentScrollTop = container.scrollTop
      const { scrollHeight, clientHeight } = container
      const distanceFromBottom = scrollHeight - currentScrollTop - clientHeight

      // User is scrolling UP and is significantly away from bottom
      if (currentScrollTop < lastScrollTop.current - 5 && distanceFromBottom > threshold) {
        scrollUpCount.current++

        // Require multiple scroll-up events to confirm intent
        // This filters out single touch events or minor adjustments
        if (scrollUpCount.current >= 2) {
          setIsScrolledAway(true)
          if (debounceTimer.current) {
            clearTimeout(debounceTimer.current)
            debounceTimer.current = null
          }
        }
      }
      // User is scrolling DOWN toward bottom
      else if (currentScrollTop > lastScrollTop.current) {
        // Will be handled by IntersectionObserver when anchor becomes visible
      }

      lastScrollTop.current = currentScrollTop
    }

    container.addEventListener("scroll", handleScroll, { passive: true })
    return () => container.removeEventListener("scroll", handleScroll)
  }, [threshold])

  // Auto-scroll when new content is added (if not scrolled away)
  // This is handled externally by the component watching messages
  // and calling scrollToBottom when appropriate

  return {
    containerRef,
    anchorRef,
    isScrolledAway,
    scrollToBottom,
    forceScrollToBottom,
  }
}
