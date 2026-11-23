import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { supabase } from './lib/supabase'
import Auth from './Auth'

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

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('MindMateFiles', 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function saveFile(file) {
  const db = await openDatabase()
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('files', 'readwrite')
    transaction.objectStore('files').put({
      id,
      name: file.name,
      type: file.type,
      size: file.size,
      blob: file,
    })

    transaction.oncomplete = () => {
      db.close()
      resolve(id)
    }

    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

async function getFile(id) {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('files', 'readonly')
    const request = transaction.objectStore('files').get(id)

    request.onsuccess = () => {
      db.close()
      resolve(request.result || null)
    }

    request.onerror = () => {
      db.close()
      reject(request.error)
    }
  })
}

async function removeFile(id) {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('files', 'readwrite')
    transaction.objectStore('files').delete(id)

    transaction.oncomplete = () => {
      db.close()
      resolve()
    }

    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function App() {
  // SUPABASE AUTHENTICATION
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error(error)
      setSession(data?.session ?? null)
      setAuthLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setAuthLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // EXISTING MINDMATE STATE
  const [activePage, setActivePage] = useState('Dashboard')

  const [tasks, setTasks] = useState([
    { id: 1, title: 'Review Java concepts', done: false },
    { id: 2, title: 'Complete mathematics practice', done: false },
    { id: 3, title: 'Revise yesterday’s notes', done: true },
  ])

  const [subjects, setSubjects] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('mindmate-library')) || []

      return saved.map(subject => ({
        ...subject,
        chapters: (subject.chapters || []).map(chapter => ({
          ...chapter,
          sets: (chapter.sets || []).map(set => ({
            ...set,
            notes: set.notes || '',
            files: set.files || [],
            resources: set.resources || [],
            flashcards: set.flashcards || [],
          })),
        })),
      }))
    } catch {
      return []
    }
  })

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

  useEffect(() => {
    localStorage.setItem('mindmate-library', JSON.stringify(subjects))
  }, [subjects])

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

  const completedTasks = tasks.filter(task => task.done).length

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
    setTasks(current =>
      current.map(task =>
        task.id === id ? { ...task, done: !task.done } : task
      )
    )
  }

  function openLibrary() {
    setActivePage('My Library')
    setSelectedSubjectId(null)
    setSelectedChapterId(null)
    setSelectedStudySetId(null)
    setShowCreateForm(false)
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

  function createLibraryItem(event) {
    event.preventDefault()

    const name = newItemName.trim()
    if (!name) return

    if (!selectedSubjectId) {
      setSubjects(current => [
        ...current,
        { id: Date.now(), name, chapters: [] },
      ])
    } else if (!selectedChapterId) {
      setSubjects(current =>
        current.map(subject =>
          subject.id === selectedSubjectId
            ? {
                ...subject,
                chapters: [
                  ...subject.chapters,
                  { id: Date.now(), name, sets: [] },
                ],
              }
            : subject
        )
      )
    } else {
      setSubjects(current =>
        current.map(subject =>
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
                            id: Date.now(),
                            name,
                            description: newItemDescription.trim(),
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
        )
      )
    }

    setNewItemName('')
    setNewItemDescription('')
    setShowCreateForm(false)
  }

  function deleteSubject(id) {
    if (!window.confirm('Delete this subject and everything inside it?')) return
    setSubjects(current => current.filter(subject => subject.id !== id))
  }

  function deleteChapter(id) {
    if (!window.confirm('Delete this chapter and its study sets?')) return

    setSubjects(current =>
      current.map(subject =>
        subject.id === selectedSubjectId
          ? {
              ...subject,
              chapters: subject.chapters.filter(chapter => chapter.id !== id),
            }
          : subject
      )
    )
  }

  async function deleteStudySet(id) {
    if (!window.confirm('Delete this study set?')) return

    const set = selectedChapter?.sets.find(item => item.id === id)

    for (const file of set?.files || []) {
      await removeFile(file.id).catch(() => {})
    }

    setSubjects(current =>
      current.map(subject =>
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
      )
    )
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
            <label htmlFor="new-item-description">
              Description (optional)
            </label>
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

  async function handleFileUpload(event) {
    const files = Array.from(event.target.files || [])
    if (!selectedStudySet) return

    for (const file of files) {
      try {
        const id = await saveFile(file)

        updateStudySet(selectedStudySet.id, current => ({
          ...current,
          files: [
            ...(current.files || []),
            {
              id,
              name: file.name,
              type: file.type || 'Unknown',
              size: file.size,
            },
          ],
        }))
      } catch (error) {
        console.error(error)
        window.alert(`Could not save ${file.name}. Please try again.`)
      }
    }

    event.target.value = ''
  }

  async function openSavedFile(file) {
    try {
      const saved = await getFile(file.id)

      if (!saved?.blob) {
        window.alert('This file could not be found in browser storage.')
        return
      }

      const url = URL.createObjectURL(saved.blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (error) {
      console.error(error)
      window.alert('Could not open this file.')
    }
  }

  async function deleteSavedFile(file) {
    if (!window.confirm(`Remove "${file.name}"?`)) return

    await removeFile(file.id).catch(console.error)

    updateStudySet(selectedStudySet.id, current => ({
      ...current,
      files: current.files.filter(item => item.id !== file.id),
    }))
  }

  function addResource(event) {
    event.preventDefault()

    const name = resourceName.trim()
    const url = resourceUrl.trim()

    if (!name || !url) return

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

    updateStudySet(selectedStudySet.id, current => ({
      ...current,
      resources: [
        ...(current.resources || []),
        { id: Date.now(), name, url: validUrl.href },
      ],
    }))

    setResourceName('')
    setResourceUrl('')
  }

  function addFlashcard(event) {
    event.preventDefault()

    if (!flashcardQuestion.trim() || !flashcardAnswer.trim()) return

    updateStudySet(selectedStudySet.id, current => ({
      ...current,
      flashcards: [
        ...(current.flashcards || []),
        {
          id: Date.now(),
          question: flashcardQuestion.trim(),
          answer: flashcardAnswer.trim(),
        },
      ],
    }))

    setFlashcardQuestion('')
    setFlashcardAnswer('')
  }

  function deleteFlashcard(id) {
    updateStudySet(selectedStudySet.id, current => ({
      ...current,
      flashcards: current.flashcards.filter(card => card.id !== id),
    }))

    setFlashcardIndex(0)
    setQuizIndex(0)
    setShowFlashcardAnswer(false)
    setQuizRevealed(false)
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
      const attachedFiles = []

      if (tutorStudySet?.files?.length) {
        for (const file of tutorStudySet.files) {
          const saved = await getFile(file.id)

          if (saved?.blob) {
            attachedFiles.push({
              name: file.name,
              type: file.type,
              dataUrl: await toDataUrl(saved.blob),
            })
          }
        }
      }

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
          files: attachedFiles,
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
              <span className="saved-indicator">● Saved automatically</span>
            </div>

            <textarea
              className="study-notes-editor"
              value={selectedStudySet.notes || ''}
              onChange={event =>
                updateStudySet(selectedStudySet.id, current => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
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
                      onClick={() =>
                        updateStudySet(selectedStudySet.id, current => ({
                          ...current,
                          resources: current.resources.filter(
                            item => item.id !== resource.id
                          ),
                        }))
                      }
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
            >
              + {createLabel()}
            </button>
          )}
        </div>

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
      </section>
    )
  }

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
          AI teaching requires a secure AI backend. Your uploaded files remain
          in this browser until sent to a connected AI service.
        </p>
      </section>
    )
  }

  // AUTHENTICATION GATE
  if (authLoading) {
    return <div className="auth-loading">Loading MindMate...</div>
  }

  if (!session) {
    return <Auth />
  }

  // EXISTING MINDMATE INTERFACE
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">M</div>
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
            <div className="profile-avatar">S</div>
            <div>
              <strong>My Workspace</strong>
              <span>Personal account</span>
            </div>
            <span className="profile-menu">···</span>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> {activePage}
          </div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Notifications">♧</button>
            <button className="top-avatar">S</button>
          </div>
        </header>

        <div className="page-content">
          {activePage === 'Dashboard' ? (
            <>
              <section className="welcome-section">
                <div>
                  <p className="eyebrow">YOUR PERSONAL LEARNING SPACE</p>
                  <h1>Welcome back! <span>✦</span></h1>
                  <p className="welcome-subtitle">
                    Ready to make today count? Let's get learning.
                  </p>
                </div>
                <div className="date-display">
                  <span>YOUR WORKSPACE</span>
                  <strong>My Dashboard</strong>
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
                  <h2>{completedTasks}/{tasks.length}</h2>
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
                    <span className="panel-count">{completedTasks}/{tasks.length}</span>
                  </div>

                  <div className="task-list">
                    {tasks.map(task => (
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
                    ))}
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