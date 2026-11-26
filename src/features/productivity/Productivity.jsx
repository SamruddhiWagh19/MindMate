import { useEffect, useMemo, useState } from 'react'

const pad = value => String(value).padStart(2, '0')
const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const defaultTasks = []

export default function Productivity({ userId, initialView = 'planner' }) {
  const storageKey = `mindmate-productivity-${userId || 'guest'}`
  const [view, setView] = useState(initialView)
  const [todayKey, setTodayKey] = useState(() => dateKey(new Date()))
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()))
  const [events, setEvents] = useState([])
  const [tasks, setTasks] = useState(defaultTasks)
  const [storageLoaded, setStorageLoaded] = useState(false)
  const [eventTitle, setEventTitle] = useState('')
  const [eventTime, setEventTime] = useState('09:00')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDue, setTaskDue] = useState(() => dateKey(new Date()))
  const [taskPriority, setTaskPriority] = useState('Medium')
  const [timerMode, setTimerMode] = useState('pomodoro')
  const [duration, setDuration] = useState(25)
  const [remaining, setRemaining] = useState(25 * 60)
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const [sessions, setSessions] = useState(0)
  const [focusSubject, setFocusSubject] = useState('Study session')

  // Refresh the local date while the app is open. Historical tasks remain saved
  // with their original due dates; only the selected day and new-task date move.
  useEffect(() => {
    const refreshDate = () => setTodayKey(dateKey(new Date()))
    const interval = window.setInterval(refreshDate, 60 * 1000)
    document.addEventListener('visibilitychange', refreshDate)
    window.addEventListener('focus', refreshDate)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshDate)
      window.removeEventListener('focus', refreshDate)
    }
  }, [])

  useEffect(() => {
    setSelectedDate(todayKey)
    setTaskDue(todayKey)
    setMonth(new Date(Number(todayKey.slice(0, 4)), Number(todayKey.slice(5, 7)) - 1, 1))
  }, [todayKey])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}')
      setEvents(Array.isArray(saved.events) ? saved.events : [])
      setTasks(Array.isArray(saved.tasks) ? saved.tasks : [])
    } catch {
      setEvents([])
      setTasks([])
    }
    setStorageLoaded(true)
  }, [storageKey])

  useEffect(() => {
    if (!storageLoaded) return
    localStorage.setItem(storageKey, JSON.stringify({ events, tasks }))
    window.dispatchEvent(new CustomEvent('mindmate-tasks-updated', {
      detail: { userId: userId || 'guest', tasks },
    }))
  }, [storageKey, events, tasks, storageLoaded, userId])

  useEffect(() => {
    function handleTaskUpdate(event) {
      if (event.detail?.userId !== (userId || 'guest')) return
      if (Array.isArray(event.detail.tasks)) setTasks(event.detail.tasks)
    }
    window.addEventListener('mindmate-tasks-updated', handleTaskUpdate)
    return () => window.removeEventListener('mindmate-tasks-updated', handleTaskUpdate)
  }, [userId])

  useEffect(() => {
    if (!running) return undefined
    const timer = window.setInterval(() => {
      if (timerMode === 'stopwatch') {
        setElapsed(value => value + 1)
      } else {
        setRemaining(value => Math.max(0, value - 1))
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running, timerMode])

  useEffect(() => {
    if (running && timerMode !== 'stopwatch' && remaining === 0) {
      setRunning(false)
      setSessions(count => count + 1)
    }
  }, [running, timerMode, remaining])

  const calendarDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const mondayOffset = (first.getDay() + 6) % 7
    const start = new Date(first)
    start.setDate(first.getDate() - mondayOffset)
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return date
    })
  }, [month])

  const selectedEvents = events
    .filter(event => event.date === selectedDate)
    .sort((a, b) => a.time.localeCompare(b.time))
  const selectedTasks = tasks
    .filter(task => task.due === selectedDate)
    .sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1))
  const completedTasks = tasks.filter(task => task.done).length

  function addEvent(event) {
    event.preventDefault()
    if (!eventTitle.trim()) return
    setEvents(items => [...items, { id: crypto.randomUUID(), title: eventTitle.trim(), date: selectedDate, time: eventTime }])
    setEventTitle('')
  }

  function addTask(event) {
    event.preventDefault()
    if (!taskTitle.trim()) return
    setTasks(items => [...items, { id: crypto.randomUUID(), title: taskTitle.trim(), due: taskDue, priority: taskPriority, done: false }])
    setTaskTitle('')
  }

  function chooseTimerMode(mode) {
    setRunning(false)
    setTimerMode(mode)
    setElapsed(0)
    setRemaining(mode === 'pomodoro' ? 25 * 60 : duration * 60)
  }

  function resetTimer() {
    setRunning(false)
    setElapsed(0)
    setRemaining(timerMode === 'pomodoro' ? 25 * 60 : duration * 60)
  }

  const clock = timerMode === 'stopwatch' ? elapsed : remaining
  const timerText = `${pad(Math.floor(clock / 60))}:${pad(clock % 60)}`

  return (
    <section className="mmprod">
      <style>{`
        .mmprod{color:var(--text-primary,#eef7fb);display:grid;gap:22px}
        .mmprod *{box-sizing:border-box}
        .mmprod-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
        .mmprod-head h1{font-size:clamp(26px,3vw,36px);margin:5px 0 8px}
        .mmprod-head p{color:var(--text-muted,#91a3ad);margin:0}
        .mmprod-tabs{display:flex;gap:8px;flex-wrap:wrap}
        .mmprod button,.mmprod input,.mmprod select{font:inherit}
        .mmprod button{cursor:pointer}
        .mmprod-tab,.mmprod-btn,.mmprod-iconbtn{border:1px solid rgba(155,220,245,.16);background:rgba(255,255,255,.035);color:inherit;border-radius:12px;padding:10px 14px}
        .mmprod-tab.active,.mmprod-btn.primary{background:linear-gradient(135deg,#bfefff,#70c9ec);color:#071219;border-color:transparent;font-weight:700}
        .mmprod-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(270px,.8fr);gap:18px}
        .mmprod-card{background:rgba(255,255,255,.035);border:1px solid rgba(160,220,245,.12);border-radius:18px;padding:20px;min-width:0}
        .mmprod-card h3{margin:0 0 5px;font-size:17px}
        .mmprod-muted{color:var(--text-muted,#91a3ad);font-size:13px}
        .mmprod-monthbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:18px 0}
        .mmprod-monthbar strong{font-size:18px}
        .mmprod-weekdays,.mmprod-calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
        .mmprod-weekdays span{text-align:center;color:var(--text-muted,#91a3ad);font-size:11px;padding:7px 0}
        .mmprod-day{min-height:76px;border:1px solid rgba(160,220,245,.09);background:rgba(0,0,0,.12);border-radius:11px;color:inherit;text-align:left;padding:8px;display:flex;flex-direction:column;gap:7px}
        .mmprod-day.outside{opacity:.35}.mmprod-day.today{border-color:#8bdcf8}.mmprod-day.selected{background:rgba(112,201,236,.15);border-color:#8bdcf8}
        .mmprod-daynum{font-size:13px}.mmprod-dots{display:flex;gap:4px;flex-wrap:wrap}.mmprod-dot{width:6px;height:6px;border-radius:50%;background:#8bdcf8}
        .mmprod-list{display:grid;gap:9px;margin-top:15px}
        .mmprod-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 12px;border:1px solid rgba(160,220,245,.1);border-radius:12px;background:rgba(0,0,0,.12)}
        .mmprod-row small{display:block;color:var(--text-muted,#91a3ad);margin-top:3px}
        .mmprod-form{display:grid;gap:9px;margin-top:14px}
        .mmprod-form input,.mmprod-form select{width:100%;min-width:0;background:rgba(0,0,0,.2);border:1px solid rgba(160,220,245,.17);border-radius:10px;padding:11px 12px;color:inherit;outline:none}
        .mmprod-form input:focus,.mmprod-form select:focus{border-color:#8bdcf8}
        .mmprod-formline{display:grid;grid-template-columns:1fr auto;gap:8px}
        .mmprod-empty{color:var(--text-muted,#91a3ad);font-size:13px;padding:15px 0}
        .mmprod-check{display:flex;align-items:center;gap:9px;min-width:0}.mmprod-check input{accent-color:#8bdcf8}
        .mmprod-done{text-decoration:line-through;opacity:.55}
        .mmprod-timer{text-align:center;padding:28px 10px}
        .mmprod-clock{font-size:clamp(54px,9vw,86px);font-weight:700;letter-spacing:-3px;font-variant-numeric:tabular-nums;margin:18px 0}
        .mmprod-timer-actions{display:flex;justify-content:center;gap:9px;flex-wrap:wrap;margin-top:20px}
        .mmprod-statrow{display:flex;justify-content:center;gap:24px;color:var(--text-muted,#91a3ad);font-size:13px}
        .mmprod-priority{font-size:11px;border-radius:20px;padding:4px 8px;background:rgba(139,220,248,.12);color:#bfefff}
        .mmprod-delete{border:0;background:transparent;color:#ff9b9b;font-size:18px;padding:3px 7px}
        @media(max-width:850px){.mmprod-grid{grid-template-columns:1fr}.mmprod-day{min-height:58px;padding:6px}.mmprod-card{padding:15px}}
        @media(max-width:480px){.mmprod-day{min-height:48px}.mmprod-daynum{font-size:11px}.mmprod-weekdays span{font-size:10px}.mmprod-dots{gap:2px}.mmprod-dot{width:5px;height:5px}.mmprod-formline{grid-template-columns:1fr}.mmprod-monthbar strong{font-size:15px}}
      `}</style>

      <div className="mmprod-head">
        <div>
          <p className="eyebrow">PLAN · FOCUS · MAKE PROGRESS</p>
          <h1>{initialView === 'focus' ? 'Focus Centre' : 'My Planner'}</h1>
          <p>{initialView === 'focus' ? 'Give one thing your full attention.' : 'Your tasks, schedule and study calendar in one place.'}</p>
        </div>
        <div className="mmprod-tabs">
          {initialView !== 'focus' && <button className={`mmprod-tab ${view === 'planner' ? 'active' : ''}`} onClick={() => setView('planner')}>Planner</button>}
          {initialView !== 'focus' && <button className={`mmprod-tab ${view === 'calendar' ? 'active' : ''}`} onClick={() => setView('calendar')}>Calendar</button>}
          {initialView !== 'focus' && <button className={`mmprod-tab ${view === 'tasks' ? 'active' : ''}`} onClick={() => setView('tasks')}>Tasks</button>}
          <button className={`mmprod-tab ${view === 'focus' || initialView === 'focus' ? 'active' : ''}`} onClick={() => setView('focus')}>Focus Centre</button>
        </div>
      </div>

      {(view === 'planner' || view === 'calendar') && (
        <div className="mmprod-grid">
          <div className="mmprod-card">
            <div className="mmprod-monthbar">
              <button className="mmprod-iconbtn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">←</button>
              <strong>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
              <button className="mmprod-iconbtn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">→</button>
              <button className="mmprod-btn" onClick={() => { setMonth(new Date()); setSelectedDate(todayKey) }}>Today</button>
            </div>
            <div className="mmprod-weekdays">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => <span key={day}>{day}</span>)}</div>
            <div className="mmprod-calendar">
              {calendarDays.map(date => {
                const key = dateKey(date)
                const hasEvents = events.some(event => event.date === key)
                const hasTasks = tasks.some(task => task.due === key)
                return (
                  <button key={key} className={`mmprod-day ${date.getMonth() !== month.getMonth() ? 'outside' : ''} ${key === todayKey ? 'today' : ''} ${key === selectedDate ? 'selected' : ''}`} onClick={() => setSelectedDate(key)}>
                    <span className="mmprod-daynum">{date.getDate()}</span>
                    <span className="mmprod-dots">{hasEvents && <i className="mmprod-dot" title="Event" />}{hasTasks && <i className="mmprod-dot" title="Task" />}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mmprod-card">
            <h3>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
            <p className="mmprod-muted">Your schedule for this day</p>
            <div className="mmprod-list">
              {selectedEvents.map(event => (
                <div className="mmprod-row" key={event.id}>
                  <div><strong>{event.title}</strong><small>{event.time}</small></div>
                  <button className="mmprod-delete" onClick={() => setEvents(items => items.filter(item => item.id !== event.id))} aria-label="Delete event">×</button>
                </div>
              ))}
              {selectedTasks.map(task => (
                <div className="mmprod-row" key={task.id}>
                  <label className="mmprod-check"><input type="checkbox" checked={task.done} onChange={() => setTasks(items => items.map(item => item.id === task.id ? { ...item, done: !item.done } : item))} /><span className={task.done ? 'mmprod-done' : ''}>{task.title}</span></label>
                  <span className="mmprod-priority">{task.priority}</span>
                </div>
              ))}
              {!selectedEvents.length && !selectedTasks.length && <div className="mmprod-empty">Nothing scheduled yet. Add an event or task below.</div>}
            </div>
            <form className="mmprod-form" onSubmit={addEvent}>
              <strong>Add an event</strong>
              <input value={eventTitle} onChange={event => setEventTitle(event.target.value)} placeholder="e.g. Java revision" aria-label="Event title" required />
              <div className="mmprod-formline">
                <input type="time" value={eventTime} onChange={event => setEventTime(event.target.value)} aria-label="Event time" />
                <button className="mmprod-btn primary" type="submit">Add event</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(view === 'planner' || view === 'tasks') && (
        <div className="mmprod-card">
          <div className="mmprod-head">
            <div><h3>Task planner</h3><p className="mmprod-muted">All saved tasks · {completedTasks} of {tasks.length} completed</p></div>
            <span className="mmprod-priority">{tasks.length ? Math.round(completedTasks / tasks.length * 100) : 0}% complete</span>
          </div>
          <form className="mmprod-form" onSubmit={addTask}>
            <input value={taskTitle} onChange={event => setTaskTitle(event.target.value)} placeholder="What do you need to get done?" aria-label="Task title" required />
            <div className="mmprod-formline">
              <input type="date" value={taskDue} onChange={event => setTaskDue(event.target.value)} aria-label="Task due date" />
              <select value={taskPriority} onChange={event => setTaskPriority(event.target.value)} aria-label="Task priority"><option>Low</option><option>Medium</option><option>High</option></select>
              <button className="mmprod-btn primary" type="submit">Add task</button>
            </div>
          </form>
          <div className="mmprod-list">
            {tasks.length ? tasks.slice().sort((a,b) => a.due.localeCompare(b.due)).map(task => (
              <div className="mmprod-row" key={task.id}>
                <label className="mmprod-check"><input type="checkbox" checked={task.done} onChange={() => setTasks(items => items.map(item => item.id === task.id ? { ...item, done: !item.done } : item))} /><span className={task.done ? 'mmprod-done' : ''}>{task.title}<small>{task.due}</small></span></label>
                <div><span className="mmprod-priority">{task.priority}</span><button className="mmprod-delete" onClick={() => setTasks(items => items.filter(item => item.id !== task.id))} aria-label="Delete task">×</button></div>
              </div>
            )) : <div className="mmprod-empty">Your task list is clear. Add your first task above.</div>}
          </div>
        </div>
      )}

      {(view === 'focus' || initialView === 'focus') && (
        <div className="mmprod-grid">
          <div className="mmprod-card mmprod-timer">
            <div className="mmprod-tabs" style={{justifyContent:'center'}}>
              <button className={`mmprod-tab ${timerMode === 'pomodoro' ? 'active' : ''}`} onClick={() => chooseTimerMode('pomodoro')}>Pomodoro</button>
              <button className={`mmprod-tab ${timerMode === 'countdown' ? 'active' : ''}`} onClick={() => chooseTimerMode('countdown')}>Countdown</button>
              <button className={`mmprod-tab ${timerMode === 'stopwatch' ? 'active' : ''}`} onClick={() => chooseTimerMode('stopwatch')}>Stopwatch</button>
            </div>
            <div className="mmprod-clock">{timerText}</div>
            <p className="mmprod-muted">{timerMode === 'stopwatch' ? 'Track how long you focus.' : timerMode === 'pomodoro' ? '25 minutes of focus, followed by a break.' : 'Set a custom focus countdown.'}</p>
            {timerMode === 'countdown' && <div style={{maxWidth:180,margin:'14px auto'}}><label className="mmprod-muted">Minutes <input style={{width:'100%',marginTop:6}} type="number" min="1" max="180" value={duration} disabled={running} onChange={event => { const value = Math.max(1, Math.min(180, Number(event.target.value) || 1)); setDuration(value); setRemaining(value * 60) }} /></label></div>}
            <div className="mmprod-timer-actions">
              <button className="mmprod-btn primary" onClick={() => setRunning(value => !value)}>{running ? 'Pause' : 'Start'}</button>
              <button className="mmprod-btn" onClick={resetTimer}>Reset</button>
            </div>
          </div>
          <div className="mmprod-card">
            <h3>Focus session</h3>
            <p className="mmprod-muted">Give this session a name and keep your attention on one thing.</p>
            <form className="mmprod-form" onSubmit={event => event.preventDefault()}>
              <label className="mmprod-muted">Session name<input value={focusSubject} onChange={event => setFocusSubject(event.target.value)} placeholder="What are you working on?" /></label>
            </form>
            <div className="mmprod-list">
              <div className="mmprod-row"><span>Completed focus sessions</span><strong>{sessions}</strong></div>
              <div className="mmprod-row"><span>Current session</span><strong>{focusSubject || 'Study session'}</strong></div>
            </div>
            <p className="mmprod-empty">Keep this tab open while the timer runs. Browser notifications and background audio are not enabled yet.</p>
          </div>
        </div>
      )}
    </section>
  )
}
