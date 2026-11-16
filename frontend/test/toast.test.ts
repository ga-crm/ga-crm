import { beforeEach, describe, expect, it, vi } from 'vitest'

const sonner = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), dismiss: vi.fn() }))
vi.mock('sonner', () => ({ toast: sonner }))

const { toast } = await import('../src/lib/toast')

describe('toast', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(['success', 'info', 'warning', 'error'] as const)('shows a %s message with its kind and detail', (kind) => {
    toast[kind]('Đã làm xong', 'Bước tiếp theo')
    expect(sonner[kind]).toHaveBeenCalledWith('Đã làm xong', expect.objectContaining({ description: 'Bước tiếp theo', closeButton: true }))
  })

  it('keeps problems on screen longer than confirmations', () => {
    toast.success('Xong')
    toast.warning('Chú ý')
    toast.error('Lỗi')
    const duration = (kind: 'success' | 'warning' | 'error') => sonner[kind].mock.calls[0][1].duration as number
    expect(duration('success')).toBe(4000)
    expect(duration('warning')).toBe(7000)
    expect(duration('error')).toBe(8000)
  })

  it('can be closed by hand', () => {
    toast.dismiss(3)
    expect(sonner.dismiss).toHaveBeenCalledWith(3)
  })
})
