import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import './Auth.css'

export default function Auth({ recoveryMode = false, recoveryEmail = '', onRecoveryComplete }) {
  const [mode, setMode] = useState('signup')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('info')

  useEffect(() => {
    if (recoveryMode) {
      setMode('reset-link')
      setEmail(recoveryEmail || '')
      setPassword('')
      setConfirmPassword('')
      setOtp('')
      setMessage('')
    }
  }, [recoveryMode, recoveryEmail])

  function notify(text, type = 'info') {
    setMessage(text)
    setMessageType(type)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')

    if (!email.trim()) {
      notify('Please enter your email address.', 'error')
      return
    }

    if (mode === 'forgot') {
      setLoading(true)
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim())
        if (error) throw error
        setMode('reset')
        notify('We sent a recovery code to your email. Check your inbox and spam folder.', 'success')
      } catch (error) {
        notify(error.message || 'Could not send the recovery code. Please try again.', 'error')
      } finally {
        setLoading(false)
      }
      return
    }

    if (mode === 'reset' || mode === 'reset-link') {
      if (mode === 'reset' && !otp.trim()) {
        notify('Enter the recovery code from your email.', 'error')
        return
      }
      if (password.length < 8) {
        notify('Your new password must contain at least 8 characters.', 'error')
        return
      }
      if (password !== confirmPassword) {
        notify('Passwords do not match.', 'error')
        return
      }

      setLoading(true)
      try {
        // A recovery link establishes a recovery session automatically.
        // The manual-code flow still verifies its OTP before updating the password.
        if (mode === 'reset') {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            email: email.trim(),
            token: otp.trim(),
            type: 'recovery',
          })
          if (verifyError) throw verifyError
        }

        const { error: updateError } = await supabase.auth.updateUser({ password })
        if (updateError) throw updateError
        await supabase.auth.signOut()

        setPassword('')
        setConfirmPassword('')
        setOtp('')
        setMode('login')
        if (onRecoveryComplete) onRecoveryComplete()
        notify('Your password has been updated. You can now sign in with your new password.', 'success')
      } catch (error) {
        notify(error.message || 'The code could not be verified. Request a new code and try again.', 'error')
      } finally {
        setLoading(false)
      }
      return
    }

    if (mode === 'signup' && !fullName.trim()) {
      notify('Please enter your full name.', 'error')
      return
    }

    if (password.length < 8) {
      notify('Your password must contain at least 8 characters.', 'error')
      return
    }

    if (mode === 'signup' && password !== confirmPassword) {
      notify('Passwords do not match.', 'error')
      return
    }

    setLoading(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() } },
        })
        if (error) throw error
        notify(
          data.session
            ? 'Account created successfully!'
            : 'Account created! Please check your email to confirm your account.',
          'success',
        )
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
        notify('Login successful!', 'success')
      }
    } catch (error) {
      notify(error.message || 'Something went wrong. Please try again.', 'error')
    } finally {
      setLoading(false)
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode)
    setMessage('')
    setPassword('')
    setConfirmPassword('')
    setOtp('')
  }

  const isSignup = mode === 'signup'
  const isForgot = mode === 'forgot'
  const isReset = mode === 'reset' || mode === 'reset-link'
  const requiresOtp = mode === 'reset'
  const isLogin = mode === 'login'

  return (
    <main className="auth-page">
      <section className="auth-brand">
        <div className="auth-brand-glow auth-brand-glow-one" />
        <div className="auth-brand-glow auth-brand-glow-two" />
        <div className="auth-brand-top">
          <img className="auth-website-banner" src="/mindmate-website-banner.png" alt="MindMate — Your learning space" />
        </div>
        <div className="auth-brand-message">
          <span>LEARN. GROW. ACHIEVE.</span>
          <h1>Your learning journey starts here.</h1>
          <p>One space for your notes, study materials, focus sessions and everything you need to make learning easier.</p>
          <div className="auth-feature-list">
            <div><span>✦</span> Organise your learning</div>
            <div><span>✦</span> Build better study habits</div>
            <div><span>✦</span> Make every session count</div>
          </div>
        </div>
        <span className="auth-footer">A LITTLE MORE FOCUS. A LOT MORE PROGRESS.</span>
      </section>

      <section className="auth-form-section">
        <div className="auth-form-container">
          <div className="auth-mobile-brand">
            <img className="auth-mobile-banner" src="/mindmate-website-banner.png" alt="MindMate — Your learning space" />
          </div>
          <div className="auth-form-heading">
            <span className="auth-eyebrow">
              {isSignup ? 'CREATE YOUR SPACE' : isForgot || isReset ? 'ACCOUNT RECOVERY' : 'WELCOME BACK'}
            </span>
            <h2>
              {isSignup ? 'Create your account' : isForgot ? 'Forgot your password?' : isReset ? 'Choose a new password' : 'Welcome back!'}
            </h2>
            <p className="auth-description">
              {isSignup
                ? 'Start building a better learning routine.'
                : isForgot
                  ? 'Enter your account email and we’ll send you a recovery code.'
                  : isReset
                    ? requiresOtp ? 'Enter the recovery code from your email and set a new password.' : 'Choose a new password for your account.'
                    : 'Sign in to continue your learning journey.'}
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            {isSignup && (
              <label>
                Full name
                <input type="text" placeholder="Enter your full name" value={fullName} onChange={event => setFullName(event.target.value)} autoComplete="name" required />
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
                readOnly={isReset}
              />
            </label>

            {requiresOtp && (
              <label>
                Email recovery code
                <input type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="Enter the code from your email" value={otp} onChange={event => setOtp(event.target.value)} required />
              </label>
            )}

            {!isForgot && (
              <label>
                {isReset ? 'New password' : 'Password'}
                <input
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  autoComplete={isSignup || isReset ? 'new-password' : 'current-password'}
                  minLength={8}
                  required
                />
              </label>
            )}

            {(isSignup || isReset) && (
              <label>
                Confirm password
                <input type="password" placeholder="Enter your password again" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
              </label>
            )}

            {message && <div className={`auth-message auth-message-${messageType}`} role="status">{message}</div>}

            <button className="auth-submit" type="submit" disabled={loading}>
              <span>
                {loading ? 'Please wait...' : isSignup ? 'Create account' : isForgot ? 'Send recovery code' : isReset ? 'Update password' : 'Sign in'}
              </span>
              <span className="auth-submit-arrow">→</span>
            </button>
          </form>

          {isLogin && (
            <div className="auth-forgot">
              <button type="button" onClick={() => switchMode('forgot')}>Forgot password?</button>
            </div>
          )}

          {requiresOtp && (
            <div className="auth-forgot">
              <button type="button" onClick={() => switchMode('forgot')}>Send a new recovery code</button>
            </div>
          )}

          <div className="auth-switch">
            {isSignup ? 'Already have an account?' : isLogin ? "Don't have an account?" : 'Remembered your password?'}
            <button type="button" onClick={() => switchMode(isSignup ? 'login' : isLogin ? 'signup' : 'login')}>
              {isSignup ? 'Sign in' : isLogin ? 'Create account' : 'Back to sign in'}
            </button>
          </div>
          <p className="auth-terms">Your personal learning space, designed around you.</p>
        </div>
      </section>
    </main>
  )
}
