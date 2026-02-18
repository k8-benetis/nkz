/**
 * Component test: KeycloakLogin (critical auth entry point).
 * Verifies that the login page renders title, status message and retry button.
 * No username/password inputs — auth is delegated to Keycloak.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import KeycloakLogin from '../KeycloakLogin'

const mockLogin = vi.fn().mockResolvedValue(undefined)

vi.mock('@/context/KeycloakAuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    login: mockLogin,
  }),
}))

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('KeycloakLogin', () => {
  it('renders login UI: title, status and retry button', () => {
    renderWithRouter(<KeycloakLogin />)
    expect(screen.getByRole('heading', { name: /Conectando con Keycloak/i })).toBeInTheDocument()
    expect(screen.getByText(/Redirigiendo a Keycloak/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reintentar inicio de sesión/i })).toBeInTheDocument()
  })

  it('renders forgot password link', () => {
    renderWithRouter(<KeycloakLogin />)
    expect(screen.getByRole('link', { name: /¿Olvidaste tu contraseña\?/i })).toBeInTheDocument()
  })
})
