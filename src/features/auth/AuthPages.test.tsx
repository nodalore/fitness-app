import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router'
import { beforeEach, vi } from 'vitest'
import { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage } from './AuthPages'

const auth = vi.hoisted(() => ({
  signUp: vi.fn(), signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(),
}))
const state = vi.hoisted(() => ({ session: null as object | null, loading: false }))
vi.mock('./AuthProvider', () => ({ useAuth: () => ({ client: { auth }, ...state }) }))
beforeEach(() => {
  vi.clearAllMocks(); state.session = null
  for (const fn of Object.values(auth)) fn.mockResolvedValue({ data: {}, error: null })
})
function page(element: React.ReactNode) {
  return render(<MemoryRouter initialEntries={['/form']}><Routes><Route path="/form" element={element} /><Route path="/profile" element={<h1>Private profile</h1>} /></Routes></MemoryRouter>)
}
async function credentials() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), 'example@example.test')
  await user.type(screen.getByLabelText('Password', { exact: true }), 'synthetic-test-only-password')
  return user
}

test('registration sends the confirmation redirect and asks the user to check email', async () => {
  page(<RegisterPage />)
  const user = await credentials()
  await user.click(screen.getByRole('button', { name: 'Create account' }))
  expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ options: { emailRedirectTo: `${window.location.origin}/auth/callback` } }))
  expect(screen.getByRole('status')).toHaveTextContent('Check your email')
})

test('successful login moves to the profile route', async () => {
  page(<LoginPage />)
  const user = await credentials()
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(auth.signInWithPassword).toHaveBeenCalledTimes(1)
  expect(await screen.findByRole('heading', { name: 'Private profile' })).toBeVisible()
})

test('failed login stays on the form and does not expose server error details', async () => {
  auth.signInWithPassword.mockResolvedValue({ error: { message: 'private-server-detail' } })
  page(<LoginPage />)
  const user = await credentials()
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Sign-in failed')
  expect(screen.queryByText('private-server-detail')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
})

test('network failures are recoverable rather than successful sign-ins', async () => {
  auth.signInWithPassword.mockRejectedValue(new Error('network'))
  page(<LoginPage />)
  const user = await credentials()
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Check your connection')
})

test('password recovery uses the exact local reset path without disclosing account existence', async () => {
  page(<ForgotPasswordPage />)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), 'example@example.test')
  await user.click(screen.getByRole('button', { name: 'Send reset email' }))
  expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('example@example.test', { redirectTo: `${window.location.origin}/auth/reset-password` })
  expect(screen.getByRole('status')).toHaveTextContent('If an account matches')
})

test('reset without a session requests a new link and cannot submit a password', () => {
  page(<ResetPasswordPage />)
  expect(screen.getByRole('alert')).toHaveTextContent('expired')
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('password reset validates confirmation before updating the authenticated user', async () => {
  state.session = { user: { id: 'test-user' } }
  page(<ResetPasswordPage />)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Password', { exact: true }), 'synthetic-test-only-password')
  await user.type(screen.getByLabelText('Confirm password'), 'different-test-only-password')
  await user.click(screen.getByRole('button', { name: 'Save new password' }))
  expect(auth.updateUser).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent('do not match')
  await user.clear(screen.getByLabelText('Confirm password'))
  await user.type(screen.getByLabelText('Confirm password'), 'synthetic-test-only-password')
  await user.click(screen.getByRole('button', { name: 'Save new password' }))
  expect(auth.updateUser).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('status')).toHaveTextContent('Password updated')
})
