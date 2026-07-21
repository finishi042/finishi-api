import { describe, it, expect } from 'vitest'
import { formatResponse, formatError } from '../../src/shared/response.js'

describe('formatResponse', () => {
  it('wraps data in a success envelope', () => {
    const result = formatResponse({ id: '1', name: 'Test' })
    expect(result).toEqual({
      success: true,
      data: { id: '1', name: 'Test' },
    })
  })

  it('defaults success to true', () => {
    const result = formatResponse('hello')
    expect(result.success).toBe(true)
  })

  it('allows overriding success to false', () => {
    const result = formatResponse(null, false)
    expect(result).toEqual({ success: false, data: null })
  })

  it('handles arrays', () => {
    const result = formatResponse([1, 2, 3])
    expect(result.data).toEqual([1, 2, 3])
  })

  it('handles undefined data', () => {
    const result = formatResponse(undefined)
    expect(result).toEqual({ success: true, data: undefined })
  })
})

describe('formatError', () => {
  it('returns an error envelope with message', () => {
    const result = formatError('Something went wrong')
    expect(result).toEqual({
      success: false,
      error: { message: 'Something went wrong', code: undefined },
    })
  })

  it('includes error code when provided', () => {
    const result = formatError('Not found', 'NOT_FOUND')
    expect(result).toEqual({
      success: false,
      error: { message: 'Not found', code: 'NOT_FOUND' },
    })
  })

  it('always sets success to false', () => {
    const result = formatError('err')
    expect(result.success).toBe(false)
  })
})
