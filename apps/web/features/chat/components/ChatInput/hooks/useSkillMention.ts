"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import type { RefObject } from "react"
import { useAllSkills } from "@/lib/providers/SkillsStoreProvider"
import type { Skill } from "@/lib/stores/skillsStore"

interface UseSkillMentionOptions {
  message: string
  setMessage: (msg: string) => void
  onAddSkill?: (
    skillId: string,
    displayName: string,
    description: string,
    prompt: string,
    source: "global" | "user" | "project",
  ) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
}

/** Only letters and hyphens are valid after @ */
const MENTION_CHAR_PATTERN = /^[a-zA-Z-]$/
const MENTION_QUERY_PATTERN = /^[a-zA-Z-]*$/

/**
 * Extract the @mention query from text at the given cursor position.
 * Returns the query string and start index, or null if no valid mention.
 *
 * Rules:
 * - @ must be at position 0 OR preceded by a space or newline
 * - Only [a-zA-Z-] allowed between @ and cursor
 */
function extractMentionQuery(text: string, cursorPos: number): { query: string; startIndex: number } | null {
  let i = cursorPos - 1

  // Walk backwards from cursor to find @
  while (i >= 0) {
    const ch = text[i]

    if (ch === "@") {
      // @ must be first char or preceded by whitespace
      if (i === 0 || text[i - 1] === " " || text[i - 1] === "\n") {
        const query = text.slice(i + 1, cursorPos)
        if (MENTION_QUERY_PATTERN.test(query)) {
          return { query, startIndex: i }
        }
      }
      return null
    }

    // Only letters and hyphens between @ and cursor
    if (!MENTION_CHAR_PATTERN.test(ch)) {
      return null
    }

    i--
  }

  return null
}

export function useSkillMention({ message, setMessage, onAddSkill, textareaRef }: UseSkillMentionOptions) {
  const skills = useAllSkills()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const mentionStartRef = useRef<number>(-1)

  // Filter skills by query (case-insensitive on displayName and id)
  const filteredSkills = useMemo(() => {
    if (!isOpen) return []
    const lower = query.toLowerCase()
    return skills.filter(skill => {
      if (!lower) return true
      return skill.displayName.toLowerCase().includes(lower) || skill.id.toLowerCase().includes(lower)
    })
  }, [isOpen, query, skills])

  // Called on every textarea change to detect/update @mention
  const handleChange = useCallback(
    (value: string, textarea: HTMLTextAreaElement) => {
      if (!onAddSkill) return

      const cursorPos = textarea.selectionStart
      const result = extractMentionQuery(value, cursorPos)

      if (result) {
        mentionStartRef.current = result.startIndex
        setQuery(result.query)
        setSelectedIndex(0)
        if (!isOpen) setIsOpen(true)
      } else if (isOpen) {
        setIsOpen(false)
        setQuery("")
        mentionStartRef.current = -1
      }
    },
    [isOpen, onAddSkill],
  )

  // Select a skill: remove @query from message, attach the skill
  const selectSkill = useCallback(
    (skill: Skill) => {
      if (!onAddSkill) return

      const startIndex = mentionStartRef.current
      if (startIndex === -1) return

      // Remove "@query" from the message
      const cursorPos = textareaRef.current?.selectionStart ?? message.length
      const before = message.slice(0, startIndex)
      const after = message.slice(cursorPos)
      const newMessage = (before + after).trim().length === 0 ? "" : before + after

      setMessage(newMessage)
      onAddSkill(skill.id, skill.displayName, skill.description, skill.prompt, skill.source)

      // Reset state
      setIsOpen(false)
      setQuery("")
      mentionStartRef.current = -1

      // Refocus and place cursor where the @ was
      requestAnimationFrame(() => {
        const textarea = textareaRef.current
        if (textarea) {
          textarea.focus()
          const pos = Math.min(startIndex, newMessage.length)
          textarea.selectionStart = pos
          textarea.selectionEnd = pos
        }
      })
    },
    [message, setMessage, onAddSkill, textareaRef],
  )

  // Handle keyboard when popup is open. Returns true if event was consumed.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!isOpen) return false

      switch (e.key) {
        case "Escape": {
          e.preventDefault()
          setIsOpen(false)
          setQuery("")
          return true
        }
        case "ArrowDown": {
          if (filteredSkills.length === 0) return false
          e.preventDefault()
          setSelectedIndex(prev => (prev + 1) % filteredSkills.length)
          return true
        }
        case "ArrowUp": {
          if (filteredSkills.length === 0) return false
          e.preventDefault()
          setSelectedIndex(prev => (prev - 1 + filteredSkills.length) % filteredSkills.length)
          return true
        }
        case "Enter":
        case "Tab": {
          if (filteredSkills.length === 0) return false
          e.preventDefault()
          const skill = filteredSkills[selectedIndex]
          if (skill) {
            selectSkill(skill)
          }
          return true
        }
        default:
          return false
      }
    },
    [isOpen, filteredSkills, selectedIndex, selectSkill],
  )

  const dismiss = useCallback(() => {
    setIsOpen(false)
    setQuery("")
    mentionStartRef.current = -1
  }, [])

  return {
    isOpen,
    query,
    filteredSkills,
    selectedIndex,
    setSelectedIndex,
    handleChange,
    handleKeyDown,
    selectSkill,
    dismiss,
  }
}
