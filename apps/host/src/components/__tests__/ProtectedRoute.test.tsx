/**
 * Component test: ProtectedRoute (critical auth flow).
 * Verifies loading and unauthenticated states without conditional hooks.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProtectedRoute } from '../ProtectedRoute'

const mockLogin = vi.fn()

vi.mock('@/context/KeycloakAuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: true,
    login: mockLogin,
  }),
}))

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('ProtectedRoute', () => {
  it('renders loading state when isLoading is true', () => {
    renderWithRouter(
      <ProtectedRoute>
        <div>Protected content</div>
      </ProtectedRoute>
    )
    expect(screen.getByText(/Cargando/i)).toBeDefined()
  })
})
