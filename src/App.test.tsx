import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import App from './App'
import { vi } from 'vitest'

// Never contact the configured live project from unit tests.
vi.mock('./lib/supabase', () => ({ getSupabaseClient: () => null, supabaseConfiguration: { ready: false, message: 'Supabase is not configured.' } }))

function renderAt(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}

test('home has accessible landmarks, navigation, and an honest preview status', () => {
  renderAt()
  expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
  expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Build a routine.')
  expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
  expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByText(/Workout logging arrives in a later stage/)).toBeVisible()
})

test('navigation changes pages, updates title, and moves focus to content', async () => {
  const user = userEvent.setup()
  renderAt()
  await user.click(screen.getByRole('link', { name: 'Our approach' }))
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Simple tools.')
  expect(document.title).toBe('Our approach | Fitness App')
  expect(screen.getByRole('main')).toHaveFocus()
  expect(screen.getByRole('link', { name: 'Our approach' })).toHaveAttribute('aria-current', 'page')
  await user.click(screen.getByRole('link', { name: /Back to home/ }))
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Build a routine.')
})

test('the approach route can be opened directly and includes evidence links', () => {
  renderAt('/about')
  expect(screen.getByRole('heading', { name: 'Sources behind the plan' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'ACSM position stands' })).toHaveAttribute('href', 'https://acsm.org/education-resources/pronouncements-scientific-communications/position-stands/')
})

test('unknown routes provide a working path home', async () => {
  const user = userEvent.setup()
  renderAt('/missing')
  expect(screen.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await user.click(screen.getByRole('link', { name: 'Back to home' }))
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Build a routine.')
})
