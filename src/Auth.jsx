
import { useState } from 'react'
import { supabase } from './lib/supabase'
import './Auth.css'

export default function Auth() {
  const [mode, setMode] = useState('signup')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')

    if (mode === 'signup' && !fullName.trim()) {
      setMessage('Please enter your full name.')
      return
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setMessage('Passwords do not match.')
      return
    }

    if (password.length < 8) {
      setMessage('Your password must contain at least 8 characters.')
      return
    }

    setLoading(true)

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() },
          },
        })

        if (error) throw error

        if (data.session) {
          setMessage('Account created successfully!')
        } else {
          setMessage('Account created! Please check your email to confirm your account.')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

        if (error) throw error
        setMessage('Login successful!')
      }
    } catch (error) {
      setMessage(error.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand">
        <div className="auth-logo">M</div>
        <span className="auth-brand-name">MindMate</span>
        <p className="auth-tagline">YOUR PERSONAL LEARNING SPACE</p>

        <div className="auth-brand-message">
          <span>LEARN. GROW. ACHIEVE.</span>
          <h1>Your learning journey starts here.</h1>
          <p>
            One space for your notes, study materials, focus sessions
            and everything you need to make learning easier.
          </p>
        </div>

        <span className="auth-footer">A LITTLE MORE FOCUS. A LOT MORE PROGRESS.</span>
      </section>

      <section className="auth-form-section">
        <div className="auth-form-container">
          <div className="auth-mobile-brand">
            <div className="auth-logo">M</div>
            <span className="auth-brand-name">MindMate</span>
          </div>

          <span className="auth-eyebrow">
            {mode === 'signup' ? 'CREATE YOUR SPACE' : 'WELCOME BACK'}
          </span>

          <h2>
            {mode === 'signup' ? 'Create your account' : 'Welcome back!'}
          </h2>

          <p className="auth-description">
            {mode === 'signup'
              ? 'Start building a better learning routine.'
              : 'Sign in to continue your learning journey.'}
          </p>

          <form onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <label>
                Full name
                <input
                  type="text"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={event => setFullName(event.target.value)}
                  autoComplete="name"
                  required
                />
              </label>
            )}

            <label>
              Email address
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={event => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={8}
                required
              />
            </label>

            {mode === 'signup' && (
              <label>
                Confirm password
                <input
                  type="password"
                  placeholder="Enter your password again"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
            )}

            {message && (
              <div className="auth-message" role="status">
                {message}
              </div>
            )}

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading
                ? 'Please wait...'
                : mode === 'signup'
                  ? 'Create account'
                  : 'Sign in'}
              <span>→</span>
            </button>
          </form>

          <div className="auth-switch">
            {mode === 'signup'
              ? 'Already have an account?'
              : "Don't have an account?"}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signup' ? 'login' : 'signup')
                setMessage('')
              }}
            >
              {mode === 'signup' ? 'Sign in' : 'Create account'}
            </button>
          </div>

          <p className="auth-terms">
            Your personal learning space, designed around you.
          </p>
        </div>
      </section>
    </main>
  )
}
