import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './app'

function renderAtPath(path: string) {
  window.history.pushState({}, '', path)
  render(<App />)
}

afterEach(() => window.history.pushState({}, '', '/'))

describe('Playground navigation', () => {
  it.each([
    ['quran', 'Quran reader', 'Loading Quran reader…'],
    ['supabase', 'Supabase API demo', 'Loading Supabase demo…'],
  ])('offers a way home while %s loads', async (route, title, message) => {
    renderAtPath(`/personal-tools/${route}/`)

    expect(screen.getByRole('status')).toHaveTextContent(message)
    expect(screen.getByRole('heading', { name: title })).toBeVisible()
    if (route === 'quran') {
      expect(screen.getByRole('heading', { name: 'Quran reader' })).toBeVisible()
      expect(screen.getByRole('region', { name: 'Current chapter' })).toHaveAttribute('aria-busy', 'true')
    }
    expect(screen.getByRole('link', { name: /All playground pages/i })).toHaveAttribute('href', import.meta.env.BASE_URL)
    expect(await screen.findByRole('heading', {
      name: route === 'quran' ? 'Al-Fātiḥah' : 'Hello from GitHub Pages',
    })).toBeVisible()
    expect(screen.queryByText(message)).not.toBeInTheDocument()
  })

  it('offers separate destinations for the Quran reader and Supabase demo', () => {
    renderAtPath('/')

    expect(screen.getByRole('heading', { name: 'Playground' })).toBeVisible()
    expect(screen.getByRole('link', { name: /Quran reader/i }).getAttribute('href')).toMatch(/quran\/$/)
    expect(screen.getByRole('link', { name: /Supabase API demo/i }).getAttribute('href')).toMatch(/supabase\/$/)
  })

  it('opens the word availability comparison from its own Playground destination', async () => {
    renderAtPath('/')
    const destination = screen.getByRole('link', { name: /Quran word availability/i })
    const href = destination.getAttribute('href')
    expect(href).toBe(`${import.meta.env.BASE_URL}quran-word-availability/`)

    window.history.pushState({}, '', href)
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Quran word availability' })).toBeVisible()
  })

  it('opens the Qur’an data coverage page from the Playground homepage', async () => {
    renderAtPath(import.meta.env.BASE_URL)
    const destination = screen.getByRole('link', { name: /Qur’an data coverage/i })
    const href = destination.getAttribute('href')
    expect(href).toBe(`${import.meta.env.BASE_URL}quran-data-coverage/`)

    window.history.pushState({}, '', href)
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Qur’an data coverage' })).toBeVisible()
  })

})
