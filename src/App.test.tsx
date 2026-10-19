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

test('home has accessible landmarks, navigation, and polished public content', () => {
  renderAt()
  expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
  expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Make your training easier.')
  expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
  expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByText('© 2026 Fitness App.')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Explore our approach' })).toHaveAttribute('href', '/about')
  expect(screen.getByRole('region', { name: 'Make your training easier.' }).querySelectorAll('a')).toHaveLength(1)
  expect(screen.queryByText('Find your starting point')).not.toBeInTheDocument()
  expect(screen.getByRole('main')).not.toHaveTextContent(/Stage \d|Supabase|later stage|foundation is ready/)
})

test('navigation changes pages, updates title, and moves focus to content', async () => {
  const user = userEvent.setup()
  renderAt()
  await user.click(screen.getByRole('link', { name: 'Our approach' }))
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('A Note From the Creator')
  expect(document.title).toBe('Our approach | Fitness App')
  expect(screen.getByRole('main')).toHaveFocus()
  expect(screen.getByRole('link', { name: 'Our approach' })).toHaveAttribute('aria-current', 'page')
  await user.click(screen.getByRole('link', { name: /Back to home/ }))
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Make your training easier.')
})

test('the approach route presents the creator note and a working feedback link', () => {
  renderAt('/about')
  expect(screen.getByRole('heading', { name: 'A Note From the Creator' })).toBeVisible()
  expect(screen.getByText('Hi there! 👋')).toBeVisible()
  expect(screen.getByText('Lorena')).toBeVisible()
  expect(screen.getByText(/Thank you for giving Fitness App a try!/)).toBeVisible()
  expect(screen.getByRole('link', { name: 'nodaloree@gmail.com' })).toHaveAttribute('href', 'mailto:nodaloree@gmail.com')
  expect(screen.queryByRole('heading', { name: 'Sources behind the plan' })).not.toBeInTheDocument()
  expect(screen.getByRole('main')).not.toHaveTextContent(/Stage \d|No paid AI|documented rules/)
})

test('unknown routes provide a working path home', async () => {
  const user = userEvent.setup()
  renderAt('/missing')
  expect(screen.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await user.click(screen.getByRole('link', { name: 'Back to home' }))
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Make your training easier.')
})
