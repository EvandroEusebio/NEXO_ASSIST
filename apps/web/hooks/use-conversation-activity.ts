"use client"

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"

type Options = {
  conversationId: string | null | undefined
  latestMessageId: string | undefined
  canType: boolean
  readSentinel: RefObject<HTMLDivElement | null>
}
/** Presence per tab, typing without content, and receipts only at the visible end of history. */
export function useConversationActivity(options: Options) {
  const config = useRef(options)
  const lease = useRef<{ id: string; sequence: number } | null>(null)
  const atBottom = useRef(false)
  const typedAt = useRef(0)
  const lastTypingPulse = useRef(0)
  const stopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    config.current = options
  }, [options])
  const pulse = useCallback(async (offline = false) => {
    const tab = lease.current
    if (!tab) return
    const current = config.current
    const active = !offline
    const attentive =
      active && document.visibilityState === "visible" && document.hasFocus()
    const sequence = ++tab.sequence
    const body = {
      tabId: tab.id,
      sequence,
      conversationId: current.conversationId ?? null,
      active,
      typing:
        attentive && current.canType && Date.now() - typedAt.current < 4000,
      ...(attentive &&
      atBottom.current &&
      current.latestMessageId &&
      current.conversationId
        ? { readThrough: current.latestMessageId }
        : {}),
    }
    try {
      const response = await fetch("/api/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      })
      if (lease.current === tab && tab.sequence === sequence)
        setConnected(response.ok && active)
    } catch {
      if (lease.current === tab && tab.sequence === sequence)
        setConnected(false)
    }
  }, [])
  const stopTyping = useCallback(() => {
    typedAt.current = 0
    clearTimeout(stopTimer.current)
    void pulse()
  }, [pulse])
  const reportTyping = useCallback(
    (hasText: boolean) => {
      if (!hasText) {
        stopTyping()
        return
      }
      const now = Date.now()
      const wasTyping = now - typedAt.current < 4000
      typedAt.current = now
      clearTimeout(stopTimer.current)
      stopTimer.current = setTimeout(stopTyping, 4000)
      if (!wasTyping || now - lastTypingPulse.current >= 2000) {
        lastTypingPulse.current = now
        void pulse()
      }
    },
    [pulse, stopTyping]
  )
  useEffect(() => {
    lease.current = { id: crypto.randomUUID(), sequence: 0 }
    const visibility = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus())
        typedAt.current = 0
      void pulse()
    }
    const leave = () => {
      typedAt.current = 0
      void pulse(true)
    }
    const interval = setInterval(() => void pulse(), 15000)
    document.addEventListener("visibilitychange", visibility)
    window.addEventListener("focus", visibility)
    window.addEventListener("pageshow", visibility)
    window.addEventListener("online", visibility)
    window.addEventListener("blur", visibility)
    window.addEventListener("pagehide", leave)
    void pulse()
    return () => {
      leave()
      lease.current = null
      clearInterval(interval)
      clearTimeout(stopTimer.current)
      document.removeEventListener("visibilitychange", visibility)
      window.removeEventListener("focus", visibility)
      window.removeEventListener("pageshow", visibility)
      window.removeEventListener("online", visibility)
      window.removeEventListener("blur", visibility)
      window.removeEventListener("pagehide", leave)
    }
  }, [pulse])
  useEffect(() => {
    typedAt.current = 0
    void pulse()
  }, [options.conversationId, options.canType, pulse])
  useEffect(() => {
    atBottom.current = false
    const element = options.readSentinel.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        atBottom.current = entry?.isIntersecting ?? false
        if (atBottom.current) void pulse()
      },
      { threshold: 0.5 }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [
    options.conversationId,
    options.latestMessageId,
    options.readSentinel,
    pulse,
  ])
  return { connected, reportTyping, stopTyping }
}
