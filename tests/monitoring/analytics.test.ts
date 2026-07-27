import { describe, it, expect } from 'vitest'
import {
  sinceTimestamp,
  errorRate,
  average,
  percentile,
  parseHours,
  parsePage,
  parseLimit,
} from '../../src/monitoring/analytics.js'

describe('sinceTimestamp', () => {
  it('returns an ISO timestamp string', () => {
    const result = sinceTimestamp(24)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
  })

  it('returns a timestamp in the past', () => {
    const result = sinceTimestamp(1)
    const resultDate = new Date(result)
    const now = new Date()
    expect(resultDate.getTime()).toBeLessThan(now.getTime())
  })

  it('calculates correct time difference', () => {
    const hoursAgo = 24
    const result = sinceTimestamp(hoursAgo)
    const resultDate = new Date(result)
    const expectedMs = hoursAgo * 60 * 60 * 1000
    const actualDiff = Date.now() - resultDate.getTime()
    // Allow 1 second tolerance for test execution time
    expect(Math.abs(actualDiff - expectedMs)).toBeLessThan(1000)
  })
})

describe('errorRate', () => {
  it('returns 0 when total is 0', () => {
    expect(errorRate(5, 0)).toBe(0)
  })

  it('returns 0 when total is negative', () => {
    expect(errorRate(5, -1)).toBe(0)
  })

  it('returns 0 when no errors', () => {
    expect(errorRate(0, 100)).toBe(0)
  })

  it('calculates correct percentage', () => {
    expect(errorRate(1, 100)).toBe(1)
    expect(errorRate(5, 100)).toBe(5)
    expect(errorRate(25, 100)).toBe(25)
  })

  it('returns percentage with 2 decimal places', () => {
    expect(errorRate(1, 3)).toBe(33.33)
    expect(errorRate(2, 3)).toBe(66.67)
  })

  it('returns 100 when all requests are errors', () => {
    expect(errorRate(100, 100)).toBe(100)
  })
})

describe('average', () => {
  it('returns 0 for empty array', () => {
    expect(average([])).toBe(0)
  })

  it('returns the value for single element', () => {
    expect(average([42])).toBe(42)
  })

  it('calculates correct average', () => {
    expect(average([1, 2, 3, 4, 5])).toBe(3)
    expect(average([10, 20, 30])).toBe(20)
  })

  it('rounds the result to integer', () => {
    expect(average([1, 2])).toBe(2) // 1.5 rounded
    expect(average([1, 2, 3])).toBe(2) // 2 exact
  })
})

describe('percentile', () => {
  it('returns 0 for empty array', () => {
    expect(percentile([], 0.95)).toBe(0)
  })

  it('returns the value for single element', () => {
    expect(percentile([100], 0.95)).toBe(100)
    expect(percentile([100], 0.5)).toBe(100)
  })

  it('calculates P50 (median) correctly', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3)
  })

  it('calculates P95 correctly', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1)
    // The function uses floor(length * p), so P95 on 100 values = values[95] = 96
    expect(percentile(values, 0.95)).toBe(96)
  })

  it('calculates P99 correctly', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1)
    // The function uses floor(length * p), so P99 on 100 values = values[99] = 100
    expect(percentile(values, 0.99)).toBe(100)
  })

  it('does not modify the original array', () => {
    const original = [5, 3, 1, 4, 2]
    const copy = [...original]
    percentile(original, 0.5)
    expect(original).toEqual(copy)
  })

  it('handles unsorted input', () => {
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3)
  })
})

describe('parseHours', () => {
  it('parses valid number string', () => {
    expect(parseHours('24')).toBe(24)
    expect(parseHours('48')).toBe(48)
    expect(parseHours('1')).toBe(1)
  })

  it('returns fallback for undefined', () => {
    expect(parseHours(undefined)).toBe(24)
    expect(parseHours(undefined, 48)).toBe(48)
  })

  it('returns fallback for invalid string', () => {
    expect(parseHours('invalid')).toBe(24)
    expect(parseHours('')).toBe(24)
  })

  it('uses custom fallback', () => {
    expect(parseHours(undefined, 12)).toBe(12)
    expect(parseHours('invalid', 12)).toBe(12)
  })
})

describe('parsePage', () => {
  it('parses valid page number', () => {
    expect(parsePage('1')).toBe(1)
    expect(parsePage('5')).toBe(5)
    expect(parsePage('100')).toBe(100)
  })

  it('returns 1 for undefined', () => {
    expect(parsePage(undefined)).toBe(1)
  })

  it('returns 1 for invalid string', () => {
    expect(parsePage('invalid')).toBe(1)
    expect(parsePage('')).toBe(1)
  })

  it('clamps to minimum of 1', () => {
    expect(parsePage('0')).toBe(1)
    expect(parsePage('-1')).toBe(1)
  })
})

describe('parseLimit', () => {
  it('parses valid limit', () => {
    expect(parseLimit('10')).toBe(10)
    expect(parseLimit('50')).toBe(50)
  })

  it('returns fallback for undefined', () => {
    expect(parseLimit(undefined)).toBe(25)
    expect(parseLimit(undefined, 50)).toBe(50)
  })

  it('returns fallback for invalid string', () => {
    expect(parseLimit('invalid')).toBe(25)
  })

  it('clamps to maximum', () => {
    expect(parseLimit('200')).toBe(100)
    expect(parseLimit('150', 25, 50)).toBe(50)
  })

  it('uses custom max', () => {
    expect(parseLimit('200', 25, 200)).toBe(200)
  })
})
