import { vi } from 'vitest'

// The worker logs one JSON event per admin action; keep test output readable.
vi.spyOn(console, 'log').mockImplementation(() => {})
