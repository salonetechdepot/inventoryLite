'use client'

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'biva-label-show-price'

/** Whether product labels include the price — remembered on this device. */
export function useLabelShowPrice() {
  const [showPrice, setShowPriceState] = useState(false)

  useEffect(() => {
    try {
      setShowPriceState(localStorage.getItem(STORAGE_KEY) === '1')
    } catch {
      // Storage blocked — default to no price.
    }
  }, [])

  const setShowPrice = useCallback((value: boolean) => {
    setShowPriceState(value)
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
    } catch {
      // ignore
    }
  }, [])

  return { showPrice, setShowPrice }
}
