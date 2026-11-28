
import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { supabase } from './lib/supabase'
import Auth from './Auth'
import Productivity from './features/productivity/Productivity'
import Notes from './features/Notes'
import Quizzes from './features/Quizzes'

import {
  loadLibrary,
  createSubject,
  createChapter,
  createStudySet,
  saveStudyNotes,
  addStudyResource,
  deleteStudyResource,
  addStudyFlashcard,
  deleteStudyFlashcard,
  uploadStudyFile,
  openStudyFile,
  deleteStudyFile,
  deleteStudySetCloud,
  deleteChapterCloud,
  deleteSubjectCloud,
} from './lib/mindmateLibrary'

const navigation = [
  {
    section: 'WORKSPACE',
    items: [
      { name: 'Dashboard', icon: '⌂' },
      { name: 'My Library', icon: '▤' },
      { name: 'AI Tutor', icon: '✧' },
      { name: 'My Planner', icon: '▦' },
    ],
  },
  {
    section: 'PRODUCTIVITY',
    items: [
      { name: 'Focus Centre', icon: '◷' },
      { name: 'My Notes', icon: '▧' },
      { name: 'Quizzes', icon: '✎' },
      { name: 'Progress', icon: '↗' },
    ],
  },
]

const tutorModes = [
  { id: 'summary', name: 'Quick Summary', description: 'Get the important points quickly.', icon: '✧' },
  { id: 'complete', name: 'Complete Explanation', description: 'Cover the entire uploaded material.', icon: '▤' },
  { id: 'detailed', name: 'Detailed Teaching', description: 'Learn concepts step by step.', icon: '◉' },
  { id: 'simple', name: 'Simple Language', description: 'Understand difficult ideas easily.', icon: '☁' },
  { id: 'exam', name: 'Exam Preparation', description: 'Prepare important concepts and questions.', icon: '✎' },
  { id: 'custom', name: 'Ask Anything', description: 'Tell your tutor exactly what you need.', icon: '＋' },
]

const studyTabs = [
  { id: 'notes', label: 'Notes', icon: '▧' },
  { id: 'files', label: 'Files', icon: '▤' },
  { id: 'resources', label: 'Resources', icon: '↗' },
  { id: 'flashcards', label: 'Flashcards', icon: '▣' },
  { id: 'quizzes', label: 'Quizzes', icon: '✎' },
]

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getLocalDateKey(date = new Date()) {
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function App() {
  // Authentication
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [signingOut, setSigningOut] = useState(false)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error(error)
      if (mounted) {
        setSession(data?.session ?? null)
        setAuthLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return

      if (event === 'PASSWORD_RECOVERY') {
        setSession(newSession)
        setIsPasswordRecovery(true)
        setAuthLoading(false)
        return
      }

      setSession(newSession)
      setAuthLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)

    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error(error)
      window.alert('Could not sign out. Please try again.')
      setSigningOut(false)
      return
    }

    setSession(null)
    setSigningOut(false)
  }

  const studentName =
    session?.user?.user_metadata?.full_name?.trim() ||
    session?.user?.email?.split('@')[0] ||
    'Student'

  const studentInitial = studentName.charAt(0).toUpperCase()
  const userId = session?.user?.id

  // Main application state
  const [activePage, setActivePage] = useState('Dashboard')
  const [todayKey, setTodayKey] = useState(() => getLocalDateKey())

  // Keep the displayed date current, including when the app stays open overnight.
  useEffect(() => {
    const refreshDate = () => setTodayKey(getLocalDateKey())
    const interval = window.setInterval(refreshDate, 60 * 1000)
    document.addEventListener('visibilitychange', refreshDate)
    window.addEventListener('focus', refreshDate)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshDate)
      window.removeEventListener('focus', refreshDate)
    }
  }, [])

  const [tasks, setTasks] = useState([])
  const productivityStorageKey = `mindmate-productivity-${userId || 'guest'}`

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(productivityStorageKey) || '{}')
      setTasks(Array.isArray(saved.tasks) ? saved.tasks : [])
    } catch {
      setTasks([])
    }

    function handleProductivityUpdate(event) {
      if (event.detail?.userId !== (userId || 'guest')) return
      setTasks(Array.isArray(event.detail.tasks) ? event.detail.tasks : [])
    }

    window.addEventListener('mindmate-tasks-updated', handleProductivityUpdate)
    return () => window.removeEventListener('mindmate-tasks-updated', handleProductivityUpdate)
  }, [productivityStorageKey, userId])

  // Supabase Library state
  const [subjects, setSubjects] = useState([])
  const [libraryLoading, setLibraryLoading] = useState(true)
  const [libraryError, setLibraryError] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  useEffect(() => {
    if (!userId) {
      setSubjects([])
      setLibraryLoading(false)
      return
    }

    let cancelled = false

    async function fetchLibrary() {
      setLibraryLoading(true)
      setLibraryError('')

      try {
        const data = await loadLibrary(userId)
        if (!cancelled) setSubjects(data)
      } catch (error) {
        console.error('Library loading failed:', error)
        if (!cancelled) {
          setLibraryError('Could not load your library. Please refresh and try again.')
        }
      } finally {
        if (!cancelled) setLibraryLoading(false)
      }
    }

    fetchLibrary()

    return () => {
      cancelled = true
    }
  }, [userId])

  const [selectedSubjectId, setSelectedSubjectId] = useState(null)
  const [selectedChapterId, setSelectedChapterId] = useState(null)
  const [selectedStudySetId, setSelectedStudySetId] = useState(null)

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemDescription, setNewItemDescription] = useState('')

  const [activeStudyTab, setActiveStudyTab] = useState('notes')
  const [resourceName, setResourceName] = useState('')
  const [resourceUrl, setResourceUrl] = useState('')
  const [flashcardQuestion, setFlashcardQuestion] = useState('')
  const [flashcardAnswer, setFlashcardAnswer] = useState('')
  const [flashcardIndex, setFlashcardIndex] = useState(0)
  const [showFlashcardAnswer, setShowFlashcardAnswer] = useState(false)
  const [quizIndex, setQuizIndex] = useState(0)
  const [quizRevealed, setQuizRevealed] = useState(false)

  const [tutorMode, setTutorMode] = useState('summary')
  const [tutorSetId, setTutorSetId] = useState('')
  const [tutorPrompt, setTutorPrompt] = useState('')
  const [tutorMessages, setTutorMessages] = useState([])
  const [tutorLoading, setTutorLoading] = useState(false)

  const selectedSubject = subjects.find(
    subject => subject.id === selectedSubjectId
  )

  const selectedChapter = selectedSubject?.chapters.find(
    chapter => chapter.id === selectedChapterId
  )

  const selectedStudySet = selectedChapter?.sets.find(
    set => set.id === selectedStudySetId
  )

  const allStudySets = useMemo(
    () => subjects.flatMap(subject =>
      subject.chapters.flatMap(chapter =>
        chapter.sets.map(set => ({
          ...set,
          subjectName: subject.name,
          chapterName: chapter.name,
        }))
      )
    ),
    [subjects]
  )

  const tutorStudySet = allStudySets.find(
    set => String(set.id) === String(tutorSetId)
  )

  const todayTasks = tasks.filter(task => task.due === todayKey)
  const completedTasks = todayTasks.filter(task => task.done).length

  function updateStudySet(setId, updater) {
    setSubjects(current =>
      current.map(subject => ({
        ...subject,
        chapters: subject.chapters.map(chapter => ({
          ...chapter,
          sets: chapter.sets.map(set =>
            set.id === setId ? updater(set) : set
          ),
        })),
      }))
    )
  }

  function toggleTask(id) {
    setTasks(current => {
      const updated = current.map(task =>
        task.id === id ? { ...task, done: !task.done } : task
      )
      try {
        const saved = JSON.parse(localStorage.getItem(productivityStorageKey) || '{}')
        localStorage.setItem(productivityStorageKey, JSON.stringify({ ...saved, tasks: updated }))
      } catch (error) {
        console.error('Could not save task update:', error)
      }
      window.dispatchEvent(new CustomEvent('mindmate-tasks-updated', {
        detail: { userId: userId || 'guest', tasks: updated },
      }))
      return updated
    })
  }

  function openLibrary() {
    setActivePage('My Library')
    setSelectedSubjectId(null)
    setSelectedChapterId(null)
    setSelectedStudySetId(null)
    setShowCreateForm(false)
  }

  async function saveNotesFromNotesPage(studySetId, content) {
    await saveStudyNotes(userId, studySetId, content)
    updateStudySet(studySetId, current => ({ ...current, notes: content }))
  }

  function openStudySetFromNotes(subjectId, chapterId, studySetId) {
    const subject = subjects.find(item => item.id === subjectId)
    const chapter = subject?.chapters.find(item => item.id === chapterId)
    const studySet = chapter?.sets.find(item => item.id === studySetId)
    if (subject && chapter && studySet) openStudySet(subject, chapter, studySet)
  }

  function openStudySet(subject, chapter, studySet) {
    setSelectedSubjectId(subject.id)
    setSelectedChapterId(chapter.id)
    setSelectedStudySetId(studySet.id)
    setActiveStudyTab('notes')
    setActivePage('My Library')
    setFlashcardIndex(0)
    setShowFlashcardAnswer(false)
    setQuizIndex(0)
    setQuizRevealed(false)
    setShowCreateForm(false)
  }

  // Create Library items in Supabase
  async function createLibraryItem(event) {
    event.preventDefault()

    const name = newItemName.trim()
    if (!name || !userId) return

    try {
      if (!selectedSubjectId) {
        const row = await createSubject(userId, name)

        setSubjects(current => [
          ...current,
          { id: row.id, name: row.name, chapters: [] },
        ])
      } else if (!selectedChapterId) {
        const row = await createChapter(userId, selectedSubjectId, name)

        setSubjects(current => current.map(subject =>
          subject.id === selectedSubjectId
            ? {
                ...subject,
                chapters: [
                  ...subject.chapters,
                  { id: row.id, name: row.name, sets: [] },
                ],
              }
            : subject
        ))
      } else {
        const row = await createStudySet(
          userId,
          selectedChapterId,
          name,
          newItemDescription.trim()
        )

        setSubjects(current => current.map(subject =>
          subject.id === selectedSubjectId
            ? {
                ...subject,
                chapters: subject.chapters.map(chapter =>
                  chapter.id === selectedChapterId
                    ? {
                        ...chapter,
                        sets: [
                          ...chapter.sets,
                          {
                            id: row.id,
                            name: row.name,
                            description: row.description || '',
                            notes: '',
                            files: [],
                            resources: [],
                            flashcards: [],
                          },
                        ],
                      }
                    : chapter
                ),
              }
            : subject
        ))
      }

      setNewItemName('')
      setNewItemDescription('')
      setShowCreateForm(false)
    } catch (error) {
      console.error('Create failed:', error)
      window.alert(error.message || 'Could not create this item.')
    }
  }

  // Delete Library items and their child records
  async function deleteSubject(id) {
    if (!window.confirm('Delete this subject and everything inside it?')) return

    const subject = subjects.find(item => item.id === id)
    if (!subject) return

    try {
      await deleteSubjectCloud(userId, subject)
      setSubjects(current => current.filter(item => item.id !== id))
      setSelectedSubjectId(null)
      setSelectedChapterId(null)
      setSelectedStudySetId(null)
    } catch (error) {
      console.error(error)
      window.alert(error.message || 'Could not delete this subject.')
    }
  }

  async function deleteChapter(id) {
    if (!window.confirm('Delete this chapter and its study sets?')) return

    const chapter = selectedSubject?.chapters.find(item => item.id === id)
    if (!chapter) return

    try {
      await deleteChapterCloud(userId, chapter)

      setSubjects(current => current.map(subject =>
        subject.id === selectedSubjectId
          ? {
              ...subject,
              chapters: subject.chapters.filter(item => item.id !== id),
            }
          : subject
      ))

      setSelectedChapterId(null)
      setSelectedStudySetId(null)
    } catch (error) {
      console.error(error)
      window.alert(error.message || 'Could not delete this chapter.')
    }
  }

  async function deleteStudySet(id) {
    if (!window.confirm('Delete this study set?')) return

    const set = selectedChapter?.sets.find(item => item.id === id)
    if (!set) return

    try {
      await deleteStudySetCloud(userId, set)

      setSubjects(current => current.map(subject =>
        subject.id === selectedSubjectId
          ? {
              ...subject,
              chapters: subject.chapters.map(chapter =>
                chapter.id === selectedChapterId
                  ? {
                      ...chapter,
                      sets: chapter.sets.filter(item => item.id !== id),
                    }
                  : chapter
              ),
            }
          : subject
      ))
    } catch (error) {
      console.error(error)
      window.alert(error.message || 'Could not delete this study set.')
    }
  }

  function createLabel() {
    if (!selectedSubjectId) return 'Create subject'
    if (!selectedChapterId) return 'Add chapter'
    return 'Create study set'
  }

  function createHeading() {
    if (!selectedSubjectId) return 'New subject'
    if (!selectedChapterId) return 'New chapter'
    return 'New study set'
  }

  function renderCreateForm() {
    if (!showCreateForm) return null

    return (
      <form className="library-create-form" onSubmit={createLibraryItem}>
        <div className="library-form-heading">
          <h3>{createHeading()}</h3>
          <button
            type="button"
            className="close-form-button"
            onClick={() => setShowCreateForm(false)}
          >
            ×
          </button>
        </div>

        <label htmlFor="new-item-name">Name</label>
        <input
          id="new-item-name"
          value={newItemName}
          onChange={event => setNewItemName(event.target.value)}
          placeholder="Enter a name"
          required
          autoFocus
        />

        {selectedChapterId && (
          <>
            <label htmlFor="new-item-description">Description (optional)</label>
            <textarea
              id="new-item-description"
              rows="3"
              value={newItemDescription}
              onChange={event => setNewItemDescription(event.target.value)}
              placeholder="What will you study in this set?"
            />
          </>
        )}

        <button className="primary-button" type="submit">
          {createLabel()} →
        </button>
      </form>
    )
  }

  // Upload files to private Supabase Storage
  async function handleFileUpload(event) {
    const files = Array.from(event.target.files || [])
    if (!selectedStudySet) return

    for (const file of files) {
      try {
        const row = await uploadStudyFile(userId, selectedStudySet.id, file)

        updateStudySet(selectedStudySet.id, current => ({
          ...current,
          files: [
            ...current.files,
            {
              id: row.id,
              name: row.name,
              type: row.type || '',
              size: Number(row.size || 0),
              storagePath: row.storage_path,
            },
          ],
        }))
      } catch (error) {
        console.error(error)
        window.alert(`Could not upload ${file.name}: ${error.message}`)
      }
    }

    event.target.value = ''
  }

  async function openSavedFile(file) {
    try {
      const url = await openStudyFile(file.storagePath)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      console.error(error)
      window.alert('Could not open this file.')
    }
  }

  async function deleteSavedFile(file) {
    if (!window.confirm(`Remove "${file.name}"?`)) return

    try {
      await deleteStudyFile(userId, file)

      updateStudySet(selectedStudySet.id, current => ({
        ...current,
        files: current.files.filter(item => item.id !== file.id),
      }))
    } catch (error) {
      console.error(error)
      window.alert(error.message || 'Could not delete this file.')
    }
  }

  // Save resources in Supabase
  async function addResource(event) {
    event.preventDefault()

    const name = resourceName.trim()
    const url = resourceUrl.trim()

    if (!name || !url || !selectedStudySet) return

    let validUrl

    try {
      validUrl = new URL(url)
      if (!['http:', 'https:'].includes(validUrl.protocol)) {
        throw new Error('Invalid URL')
      }
    } catch {
      window.alert('Enter a valid website link beginning with https:// or http://')
      return
    }

    try {
      const row = await addStudyResource(
        userId,
        selectedStudySet.id,
        name,
        validUrl.href
      )

      updateStudySet(selectedStudySet.id, current => ({
        ...current,
        resources: [
          ...current.resources,
          { id: row.id, name: row.title, url: row.url },
        ],
      }))

      setResourceName('')
      setResourceUrl('')
    } catch (error) {
      console.error(error)
      window.alert(error.message || 'Could not save this resource.')
    }
  }

  async function removeResource(id) {
    try {
      await deleteStudyResource(userId, id)

      updateStudySet(selectedStudySet.id, current => ({
        ...current,
        resources: current.resources.filter(item => item.id !== id),
      }))
    } catch (error) {
      console.error(error)
      window.alert(error.message || 'Could not remove this resource.')
    }
  }

  // Save flashcards in Supabase
  async function addFlashcard(event) {
    event.preventDefault()

    if (!flashcardQuestion.trim() || !flashcardAnswer.trim()) return

    try {
      const row = await addStudyFlashcard(
        userId,
        selectedStudySet.id,
        flashcardQuestion.trim(),
        flashcardAnswer.trim()
      )

      updateStudySet(selectedStudySet.id, current => ({
        ...current,
        flashcards: [
          ...current.flashcards,
          {
            id: row.id,
            question: row.question,
            answer: row.answer,
          },
        ],
      }))

      setFlashcardQuestion('')
      setFlashcardAnswer('')
    } catch (error) {
      console.error(error)
      window.alert(error.message || 'Could not create this flashcard.')
    }
  }

  async function deleteFlashcard(id) {
    try {
      await deleteStudyFlashcard(userId, id)

      updateStudySet(selectedStudySet.id, current => ({
        ...current,
        flashcards: current.flashcards.filter(card => card.id !== id),
      }))

      setFlashcardIndex(0)
      setQuizIndex(0)
      setShowFlashcardAnswer(false)
      setQuizRevealed(false)
    } catch (error) {
      console.error(error)
      window.alert(error.message || 'Could not delete this flashcard.')
    }
  }

  async function sendTutorMessage(event) {
    event.preventDefault()

    const prompt = tutorPrompt.trim()
    if (!prompt || tutorLoading) return

    const userMessage = { role: 'user', content: prompt }
    const conversation = [...tutorMessages, userMessage]

    setTutorMessages(conversation)
    setTutorPrompt('')
    setTutorLoading(true)

    const apiUrl = import.meta.env.VITE_AI_API_URL

    if (!apiUrl) {
      setTutorMessages(current => [
        ...current,
        {
          role: 'assistant',
          content:
            'Your AI Tutor interface is ready! The secure AI backend has not been connected yet. Once it is configured, I will be able to process your selected material and teach it in the style you choose.',
        },
      ])
      setTutorLoading(false)
      return
    }

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: prompt,
          mode: tutorMode,
          conversation,
          material: tutorStudySet
            ? {
                name: tutorStudySet.name,
                description: tutorStudySet.description,
                notes: tutorStudySet.notes || '',
                resources: tutorStudySet.resources || [],
              }
            : null,
          files: [],
        }),
      })

      if (!response.ok) {
        throw new Error(`AI service returned ${response.status}`)
      }

      const data = await response.json()
      const answer = data.answer || data.response || data.message

      if (!answer) throw new Error('No answer received.')

      setTutorMessages(current => [
        ...current,
        { role: 'assistant', content: answer },
      ])
    } catch (error) {
      console.error(error)
      setTutorMessages(current => [
        ...current,
        {
          role: 'assistant',
          content: 'I could not reach the AI service. Please check the backend connection and try again.',
        },
      ])
    } finally {
      setTutorLoading(false)
    }
  }

  // Study set workspace
  function renderStudyWorkspace() {
    if (!selectedStudySet) return null

    const files = selectedStudySet.files || []
    const resources = selectedStudySet.resources || []
    const cards = selectedStudySet.flashcards || []
    const currentCard = cards[flashcardIndex]
    const quizCard = cards[quizIndex]

    return (
      <section className="study-workspace">
        <div className="study-workspace-header">
          <div>
            <p className="eyebrow">
              {selectedSubject?.name} / {selectedChapter?.name}
            </p>
            <h1>{selectedStudySet.name}</h1>
            <p className="welcome-subtitle">
              {selectedStudySet.description || 'Your personal learning workspace.'}
            </p>
          </div>

          <button
            className="secondary-button"
            onClick={() => setSelectedStudySetId(null)}
          >
            ← Back to chapter
          </button>
        </div>

        <div className="study-workspace-tabs">
          {studyTabs.map(tab => (
            <button
              key={tab.id}
              className={activeStudyTab === tab.id ? 'active' : ''}
              onClick={() => setActiveStudyTab(tab.id)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {activeStudyTab === 'notes' && (
          <div className="study-tool-panel">
            <div className="study-tool-heading">
              <div>
                <h2>Your notes</h2>
                <p>Write and organise your learning notes.</p>
              </div>
              <span className="saved-indicator">
                ● {savingNotes ? 'Saving...' : 'Saved to your account'}
              </span>
            </div>

            <textarea
              className="study-notes-editor"
              value={selectedStudySet.notes || ''}
              onChange={event => {
                const content = event.target.value
                updateStudySet(selectedStudySet.id, current => ({
                  ...current,
                  notes: content,
                }))
              }}
              onBlur={async event => {
                setSavingNotes(true)
                try {
                  await saveStudyNotes(
                    userId,
                    selectedStudySet.id,
                    event.target.value
                  )
                } catch (error) {
                  console.error(error)
                  window.alert('Your notes could not be saved. Please try again.')
                } finally {
                  setSavingNotes(false)
                }
              }}
              placeholder="Start writing your notes here...

Add definitions, examples, explanations and important points."
            />
          </div>
        )}

        {activeStudyTab === 'files' && (
          <div className="study-tool-panel">
            <div className="study-tool-heading">
              <div>
                <h2>Study materials</h2>
                <p>Upload and organise your learning documents.</p>
              </div>

              <label className="primary-button upload-button">
                + Upload files
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.md,.ppt,.pptx,.csv,.jpg,.jpeg,.png"
                  onChange={handleFileUpload}
                />
              </label>
            </div>

            <div className="upload-information">
              <span>▤</span>
              <div>
                <strong>Your materials, all together</strong>
                <p>PDFs, Word documents, presentations, text files and images.</p>
              </div>
            </div>

            {files.length === 0 ? (
              <div className="study-empty-state">
                <span>▤</span>
                <h3>No files uploaded yet</h3>
                <p>Upload your first study material.</p>
              </div>
            ) : (
              <div className="uploaded-file-list">
                {files.map(file => (
                  <div className="uploaded-file" key={file.id}>
                    <span className="uploaded-file-icon">▧</span>
                    <div className="uploaded-file-info">
                      <strong>{file.name}</strong>
                      <span>{formatSize(file.size)}</span>
                    </div>
                    <button className="text-action" onClick={() => openSavedFile(file)}>
                      Open
                    </button>
                    <button
                      className="library-delete-button"
                      onClick={() => deleteSavedFile(file)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeStudyTab === 'resources' && (
          <div className="study-tool-panel">
            <div className="study-tool-heading">
              <div>
                <h2>Learning resources</h2>
                <p>Save websites, articles and helpful references.</p>
              </div>
            </div>

            <form className="resource-form" onSubmit={addResource}>
              <input
                placeholder="Resource name"
                value={resourceName}
                onChange={event => setResourceName(event.target.value)}
                required
              />
              <input
                type="url"
                placeholder="https://example.com"
                value={resourceUrl}
                onChange={event => setResourceUrl(event.target.value)}
                required
              />
              <button className="primary-button" type="submit">
                + Save resource
              </button>
            </form>

            {resources.length === 0 ? (
              <div className="study-empty-state">
                <span>↗</span>
                <h3>No resources saved</h3>
                <p>Add useful learning links here.</p>
              </div>
            ) : (
              <div className="resource-list">
                {resources.map(resource => (
                  <div className="resource-item" key={resource.id}>
                    <span className="resource-icon">↗</span>
                    <div>
                      <strong>{resource.name}</strong>
                      <a href={resource.url} target="_blank" rel="noreferrer">
                        {resource.url}
                      </a>
                    </div>
                    <button
                      className="library-delete-button"
                      onClick={() => removeResource(resource.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeStudyTab === 'flashcards' && (
          <div className="study-tool-panel">
            <div className="study-tool-heading">
              <div>
                <h2>Flashcards</h2>
                <p>Create revision cards to test your memory.</p>
              </div>
              <span>{cards.length} cards</span>
            </div>

            <form className="flashcard-form" onSubmit={addFlashcard}>
              <label>Question / Front</label>
              <textarea
                rows="2"
                placeholder="Enter a question or term..."
                value={flashcardQuestion}
                onChange={event => setFlashcardQuestion(event.target.value)}
                required
              />

              <label>Answer / Back</label>
              <textarea
                rows="3"
                placeholder="Enter the answer..."
                value={flashcardAnswer}
                onChange={event => setFlashcardAnswer(event.target.value)}
                required
              />

              <button className="primary-button" type="submit">
                + Create flashcard
              </button>
            </form>

            {cards.length > 0 && (
              <div className="flashcard-review">
                <div className="study-tool-heading">
                  <div>
                    <h3>Revision mode</h3>
                    <p>Try answering before revealing the answer.</p>
                  </div>
                  <span>{flashcardIndex + 1} / {cards.length}</span>
                </div>

                <button
                  className="flashcard-display"
                  onClick={() => setShowFlashcardAnswer(value => !value)}
                >
                  <span>{showFlashcardAnswer ? 'ANSWER' : 'QUESTION'}</span>
                  <strong>
                    {showFlashcardAnswer ? currentCard?.answer : currentCard?.question}
                  </strong>
                  <small>Click to flip the card</small>
                </button>

                <div className="flashcard-controls">
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setFlashcardIndex(index => (index - 1 + cards.length) % cards.length)
                      setShowFlashcardAnswer(false)
                    }}
                  >
                    ← Previous
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => {
                      setFlashcardIndex(index => (index + 1) % cards.length)
                      setShowFlashcardAnswer(false)
                    }}
                  >
                    Next →
                  </button>
                </div>

                <div className="flashcard-manage-list">
                  {cards.map((card, index) => (
                    <div className="flashcard-manage-item" key={card.id}>
                      <span>{index + 1}. {card.question}</span>
                      <button
                        className="library-delete-button"
                        onClick={() => deleteFlashcard(card.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeStudyTab === 'quizzes' && (
          <div className="study-tool-panel">
            <div className="study-tool-heading">
              <div>
                <h2>Quiz practice</h2>
                <p>Practise using your saved flashcards.</p>
              </div>
              <span>{cards.length} questions</span>
            </div>

            {cards.length === 0 ? (
              <div className="study-empty-state">
                <span>✎</span>
                <h3>Your quiz is waiting</h3>
                <p>Create flashcards first to build your practice questions.</p>
                <button
                  className="secondary-button"
                  onClick={() => setActiveStudyTab('flashcards')}
                >
                  Create flashcards →
                </button>
              </div>
            ) : (
              <div className="quiz-practice-card">
                <span className="eyebrow">
                  QUESTION {quizIndex + 1} OF {cards.length}
                </span>
                <div className="quiz-progress-track">
                  <div style={{ width: `${((quizIndex + 1) / cards.length) * 100}%` }} />
                </div>

                <h2>{quizCard?.question}</h2>

                {quizRevealed ? (
                  <div className="quiz-answer">
                    <span>ANSWER</span>
                    <p>{quizCard?.answer}</p>
                  </div>
                ) : (
                  <button
                    className="primary-button"
                    onClick={() => setQuizRevealed(true)}
                  >
                    Reveal answer
                  </button>
                )}

                <button
                  className="secondary-button"
                  onClick={() => {
                    setQuizIndex(index => (index + 1) % cards.length)
                    setQuizRevealed(false)
                  }}
                >
                  Next question →
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    )
  }

  // Library page
  function renderLibrary() {
    return (
      <section className="library-page">
        <div className="library-header">
          <div>
            <p className="eyebrow">YOUR PERSONAL COLLECTION</p>
            <h1>My Library</h1>
            <p className="welcome-subtitle">
              Organise your learning, one subject at a time.
            </p>
          </div>

          {!selectedStudySet && (
            <button
              className="primary-button library-add-button"
              onClick={() => setShowCreateForm(true)}
              disabled={libraryLoading}
            >
              + {createLabel()}
            </button>
          )}
        </div>

        {libraryLoading ? (
          <div className="study-empty-state">
            <h3>Loading your library...</h3>
          </div>
        ) : libraryError ? (
          <div className="study-empty-state">
            <h3>{libraryError}</h3>
            <button
              className="secondary-button"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="library-breadcrumb">
              <button onClick={() => {
                setSelectedSubjectId(null)
                setSelectedChapterId(null)
                setSelectedStudySetId(null)
                setShowCreateForm(false)
              }}>
                My Library
              </button>

              {selectedSubject && (
                <>
                  <span>/</span>
                  <button onClick={() => {
                    setSelectedChapterId(null)
                    setSelectedStudySetId(null)
                    setShowCreateForm(false)
                  }}>
                    {selectedSubject.name}
                  </button>
                </>
              )}

              {selectedChapter && (
                <>
                  <span>/</span>
                  <button onClick={() => {
                    setSelectedStudySetId(null)
                    setShowCreateForm(false)
                  }}>
                    {selectedChapter.name}
                  </button>
                </>
              )}

              {selectedStudySet && (
                <>
                  <span>/</span>
                  <strong>{selectedStudySet.name}</strong>
                </>
              )}
            </div>

            {selectedStudySet ? (
              renderStudyWorkspace()
            ) : (
              <>
                {renderCreateForm()}

                {!selectedSubjectId && (
                  <>
                    <div className="library-section-heading">
                      <div>
                        <h2>Your subjects</h2>
                        <p>Start by creating a subject for your studies.</p>
                      </div>
                      <span>{subjects.length} subjects</span>
                    </div>

                    {subjects.length === 0 ? (
                      <div className="library-empty">
                        <div className="library-empty-icon">▤</div>
                        <h3>Your learning library starts here</h3>
                        <p>Create your first subject and organise your learning.</p>
                        <button className="secondary-button" onClick={() => setShowCreateForm(true)}>
                          + Create your first subject
                        </button>
                      </div>
                    ) : (
                      <div className="library-card-grid">
                        {subjects.map(subject => (
                          <div className="library-card" key={subject.id}>
                            <button
                              className="library-card-main"
                              onClick={() => {
                                setSelectedSubjectId(subject.id)
                                setSelectedChapterId(null)
                                setSelectedStudySetId(null)
                                setShowCreateForm(false)
                              }}
                            >
                              <span className="library-card-icon">▤</span>
                              <strong>{subject.name}</strong>
                              <span>{subject.chapters.length} chapters</span>
                            </button>
                            <button
                              className="library-delete-button"
                              onClick={() => deleteSubject(subject.id)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {selectedSubject && !selectedChapter && (
                  <>
                    <div className="library-section-heading">
                      <div>
                        <h2>{selectedSubject.name}</h2>
                        <p>Choose a chapter or create a new one.</p>
                      </div>
                      <span>{selectedSubject.chapters.length} chapters</span>
                    </div>

                    {selectedSubject.chapters.length === 0 ? (
                      <div className="library-empty">
                        <div className="library-empty-icon">📂</div>
                        <h3>No chapters yet</h3>
                        <p>Break this subject into smaller chapters.</p>
                        <button className="secondary-button" onClick={() => setShowCreateForm(true)}>
                          + Add your first chapter
                        </button>
                      </div>
                    ) : (
                      <div className="library-card-grid">
                        {selectedSubject.chapters.map(chapter => (
                          <div className="library-card" key={chapter.id}>
                            <button
                              className="library-card-main"
                              onClick={() => {
                                setSelectedChapterId(chapter.id)
                                setSelectedStudySetId(null)
                                setShowCreateForm(false)
                              }}
                            >
                              <span className="library-card-icon">📁</span>
                              <strong>{chapter.name}</strong>
                              <span>{chapter.sets.length} study sets</span>
                            </button>
                            <button
                              className="library-delete-button"
                              onClick={() => deleteChapter(chapter.id)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {selectedChapter && (
                  <>
                    <div className="library-section-heading">
                      <div>
                        <h2>{selectedChapter.name}</h2>
                        <p>Your learning materials for this chapter.</p>
                      </div>
                      <span>{selectedChapter.sets.length} study sets</span>
                    </div>

                    {selectedChapter.sets.length === 0 ? (
                      <div className="library-empty">
                        <div className="library-empty-icon">▧</div>
                        <h3>No study sets yet</h3>
                        <p>Create a study set for your learning materials.</p>
                        <button className="secondary-button" onClick={() => setShowCreateForm(true)}>
                          + Create your first study set
                        </button>
                      </div>
                    ) : (
                      <div className="study-set-list">
                        {selectedChapter.sets.map(set => (
                          <div className="study-set-card" key={set.id}>
                            <button
                              className="study-set-open"
                              onClick={() => openStudySet(selectedSubject, selectedChapter, set)}
                            >
                              <div className="study-set-icon">▤</div>
                              <div className="study-set-info">
                                <strong>{set.name}</strong>
                                <p>{set.description || 'Open your personal study space.'}</p>
                                <span>
                                  {(set.files || []).length} files · {(set.flashcards || []).length} flashcards
                                </span>
                              </div>
                              <span className="study-set-arrow">→</span>
                            </button>
                            <button
                              className="library-delete-button"
                              onClick={() => deleteStudySet(set.id)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </section>
    )
  }

  // AI Tutor
  function renderTutor() {
    return (
      <section className="tutor-page">
        <div className="tutor-page-heading">
          <div>
            <p className="eyebrow">YOUR PERSONAL LEARNING ASSISTANT</p>
            <h1>AI Tutor <span>✧</span></h1>
            <p className="welcome-subtitle">
              Learn your way. Choose the teaching style that works for you.
            </p>
          </div>
        </div>

        <div className="tutor-layout">
          <div className="tutor-settings-panel">
            <h2>How would you like to learn?</h2>
            <p>Choose a teaching style.</p>

            <div className="tutor-mode-grid">
              {tutorModes.map(mode => (
                <button
                  key={mode.id}
                  className={`tutor-mode-card ${tutorMode === mode.id ? 'active' : ''}`}
                  onClick={() => setTutorMode(mode.id)}
                >
                  <span className="tutor-mode-icon">{mode.icon}</span>
                  <strong>{mode.name}</strong>
                  <small>{mode.description}</small>
                </button>
              ))}
            </div>

            <div className="tutor-material-picker">
              <label htmlFor="tutor-study-set">Choose study material</label>
              <select
                id="tutor-study-set"
                value={tutorSetId}
                onChange={event => setTutorSetId(event.target.value)}
              >
                <option value="">No study set selected</option>
                {allStudySets.map(set => (
                  <option key={set.id} value={String(set.id)}>
                    {set.subjectName} / {set.chapterName} / {set.name}
                  </option>
                ))}
              </select>

              {tutorStudySet ? (
                <p className="tutor-material-status">
                  ● {tutorStudySet.name} selected · {(tutorStudySet.files || []).length} files
                </p>
              ) : (
                <p className="tutor-material-hint">
                  Select a study set to use its notes and uploaded files.
                </p>
              )}

              <button className="text-action" onClick={openLibrary}>
                Open My Library to upload material →
              </button>
            </div>
          </div>

          <div className="tutor-chat-panel">
            <div className="tutor-chat-heading">
              <div className="tutor-symbol">✧</div>
              <div>
                <strong>Your AI Tutor</strong>
                <span>Ready to help you learn</span>
              </div>
              <button className="text-action" onClick={() => setTutorMessages([])}>
                Clear chat
              </button>
            </div>

            <div className="tutor-chat-messages">
              {tutorMessages.length === 0 ? (
                <div className="tutor-welcome-card">
                  <span className="tutor-large-symbol">✧</span>
                  <h2>What shall we learn today?</h2>
                  <p>
                    Select your study material, choose a teaching style and
                    tell your tutor what you want to understand.
                  </p>

                  <div className="tutor-suggestions">
                    {[
                      'Explain this topic from the beginning.',
                      'Give me a complete summary of my material.',
                      'Prepare me for an exam on this chapter.',
                    ].map(suggestion => (
                      <button
                        key={suggestion}
                        onClick={() => setTutorPrompt(suggestion)}
                      >
                        {suggestion} →
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                tutorMessages.map((message, index) => (
                  <div className={`tutor-message ${message.role}`} key={index}>
                    <span>{message.role === 'user' ? 'YOU' : 'AI TUTOR'}</span>
                    <p>{message.content}</p>
                  </div>
                ))
              )}

              {tutorLoading && (
                <div className="tutor-message assistant">
                  <span>AI TUTOR</span>
                  <p>Preparing your lesson...</p>
                </div>
              )}
            </div>

            <form className="tutor-input-area" onSubmit={sendTutorMessage}>
              <textarea
                rows="3"
                placeholder="Tell your tutor what you want to learn..."
                value={tutorPrompt}
                onChange={event => setTutorPrompt(event.target.value)}
              />

              <div className="tutor-input-footer">
                <span>
                  Mode: {tutorModes.find(mode => mode.id === tutorMode)?.name}
                </span>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!tutorPrompt.trim() || tutorLoading}
                >
                  {tutorLoading ? 'Working...' : 'Send message ↑'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <p className="tutor-connection-note">
          AI teaching requires a secure AI backend. Your uploaded files are
          stored privately in your account.
        </p>
      </section>
    )
  }

  // Authentication gate
  if (authLoading) {
    return <div className="auth-loading">Loading MindMate...</div>
  }

  if (isPasswordRecovery) {
    return (
      <Auth
        recoveryMode
        recoveryEmail={session?.user?.email || ''}
        onRecoveryComplete={() => {
          setIsPasswordRecovery(false)
          setSession(null)
        }}
      />
    )
  }

  if (!session) {
    return <Auth />
  }

  // Main application
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img
            className="brand-logo-image"
            src="/mindmate-app-icon.png"
            alt="MindMate"
          />
          <div className="brand-name">
            <h2>MindMate</h2>
            <span>YOUR LEARNING SPACE</span>
          </div>
        </div>

        <div className="sidebar-content">
          {navigation.map(group => (
            <div className="nav-group" key={group.section}>
              <p className="nav-heading">{group.section}</p>
              {group.items.map(item => (
                <button
                  key={item.name}
                  className={`nav-item ${activePage === item.name ? 'active' : ''}`}
                  onClick={() => {
                    setActivePage(item.name)
                    setShowCreateForm(false)
                  }}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="sidebar-bottom">
          <button
            className={`nav-item ${activePage === 'Settings' ? 'active' : ''}`}
            onClick={() => setActivePage('Settings')}
          >
            <span className="nav-icon">⚙</span>
            Settings
          </button>

          <div className="profile">
            <div className="profile-avatar">{studentInitial}</div>
            <div className="profile-details">
              <strong>{studentName}</strong>
              <span>Personal account</span>
            </div>
          </div>

          <button
            className="sign-out-button"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <span>↪</span>
            {signingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> {activePage}
          </div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Notifications">♧</button>
            <div className="top-avatar">{studentInitial}</div>
          </div>
        </header>

        <div className="page-content">
          {activePage === 'Dashboard' ? (
            <>
              <section className="welcome-section">
                <div>
                  <p className="eyebrow">YOUR PERSONAL LEARNING SPACE</p>
                  <h1 className="dashboard-welcome-title">
                    Welcome back, {studentName}! <span>✦</span>
                  </h1>
                  <p className="welcome-subtitle">
                    Ready to make today count? Let's get learning.
                  </p>
                </div>
                <div className="date-display">
                  <span>TODAY'S DATE</span>
                  <strong>{new Date(`${todayKey}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong>
                </div>
              </section>

              <section className="stats-grid">
                <div className="stat-card">
                  <div className="stat-top">
                    <span>Study sessions</span>
                    <span className="stat-icon">◷</span>
                  </div>
                  <h2>0</h2>
                  <p>Start your first session</p>
                </div>

                <div className="stat-card">
                  <div className="stat-top">
                    <span>Tasks completed</span>
                    <span className="stat-icon">✓</span>
                  </div>
                  <h2>{completedTasks}/{todayTasks.length}</h2>
                  <p>Your daily task progress</p>
                </div>

                <div className="stat-card">
                  <div className="stat-top">
                    <span>Study sets</span>
                    <span className="stat-icon">▤</span>
                  </div>
                  <h2>{allStudySets.length}</h2>
                  <p>Your library is growing</p>
                </div>

                <div className="stat-card">
                  <div className="stat-top">
                    <span>Focus time</span>
                    <span className="stat-icon">◴</span>
                  </div>
                  <h2>0 min</h2>
                  <p>Time to get started</p>
                </div>
              </section>

              <section className="dashboard-grid">
                <div className="panel tasks-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Today's tasks</h3>
                      <p>Small steps make big progress.</p>
                    </div>
                    <span className="panel-count">{completedTasks}/{todayTasks.length}</span>
                  </div>

                  <div className="task-list">
                    {todayTasks.length ? todayTasks.map(task => (
                      <label className="task-item" key={task.id}>
                        <input
                          type="checkbox"
                          checked={task.done}
                          onChange={() => toggleTask(task.id)}
                        />
                        <span className={task.done ? 'task-done' : ''}>
                          {task.title}
                        </span>
                      </label>
                    )) : <p className="empty-state">No tasks scheduled for today. Add tasks in My Planner.</p>}
                  </div>
                </div>

                <div className="panel focus-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Focus centre</h3>
                      <p>Make time for what matters.</p>
                    </div>
                    <span className="panel-icon">◷</span>
                  </div>
                  <div className="focus-display">
                    <span>00:00</span>
                    <p>Ready when you are.</p>
                  </div>
                  <button
                    className="primary-button"
                    onClick={() => setActivePage('Focus Centre')}
                  >
                    Open focus centre →
                  </button>
                </div>

                <div className="panel library-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Your study library</h3>
                      <p>Everything you need, in one place.</p>
                    </div>
                    <span className="panel-icon">▤</span>
                  </div>
                  <div className="empty-state">
                    <span>＋</span>
                    <strong>Your learning space awaits</strong>
                    <p>Create subjects, organise chapters and open your study sets.</p>
                    <button className="secondary-button" onClick={openLibrary}>
                      Explore library
                    </button>
                  </div>
                </div>

                <div className="panel tutor-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>AI Tutor</h3>
                      <p>Learn in the way that works for you.</p>
                    </div>
                    <span className="panel-icon">✧</span>
                  </div>
                  <div className="tutor-content">
                    <div className="tutor-symbol">✧</div>
                    <strong>Your personal learning assistant</strong>
                    <p>Choose a teaching style and explore your study materials.</p>
                    <button
                      className="secondary-button"
                      onClick={() => setActivePage('AI Tutor')}
                    >
                      Meet your tutor →
                    </button>
                  </div>
                </div>
              </section>
            </>
          ) : activePage === 'My Library' ? (
            renderLibrary()
          ) : activePage === 'AI Tutor' ? (
            renderTutor()
          ) : activePage === 'My Planner' ? (
            <Productivity userId={userId} initialView="planner" />
          ) : activePage === 'Focus Centre' ? (
            <Productivity userId={userId} initialView="focus" />
          ) : activePage === 'My Notes' ? (
            <Notes subjects={subjects} onSaveNotes={saveNotesFromNotesPage} onOpenStudySet={openStudySetFromNotes} />
          ) : activePage === 'Quizzes' ? (
            <Quizzes userId={userId} studySets={allStudySets} />
          ) : (
            <section className="placeholder-page">
              <p className="eyebrow">MINDMATE WORKSPACE</p>
              <h1>{activePage}</h1>
              <p>This section is part of our development roadmap.</p>
              <button
                className="secondary-button"
                onClick={() => setActivePage('Dashboard')}
              >
                ← Back to dashboard
              </button>
            </section>
          )}

          <footer className="app-footer">
            <span>MindMate</span>
            <span>PLAN · LEARN · IMPROVE</span>
          </footer>
        </div>
      </main>
    </div>
  )
}

export default App
