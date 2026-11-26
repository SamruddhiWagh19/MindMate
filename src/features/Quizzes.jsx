import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './Notes.css'

const QUESTION_TYPES = [
  { value: 'mcq', label: 'Multiple choice' },
  { value: 'true_false', label: 'True / False' },
  { value: 'short', label: 'Short answer' },
]

function normaliseAnswer(value) {
  return String(value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

function supportedFile(file) {
  const type = String(file.type || '').toLowerCase()
  return type === 'application/pdf' || type.startsWith('text/') || /\.(pdf|txt|md|csv)$/i.test(file.name || '')
}

export default function Quizzes({ userId, studySets = [] }) {
  const [quizzes, setQuizzes] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [questions, setQuestions] = useState([])
  const [attempts, setAttempts] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [savingAttempt, setSavingAttempt] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('generate')
  const [title, setTitle] = useState('')
  const [studySetId, setStudySetId] = useState('')
  const [includeNotes, setIncludeNotes] = useState(true)
  const [includeFlashcards, setIncludeFlashcards] = useState(true)
  const [selectedFileIds, setSelectedFileIds] = useState([])
  const [pastedText, setPastedText] = useState('')
  const [questionCount, setQuestionCount] = useState('10')
  const [difficulty, setDifficulty] = useState('medium')
  const [questionTypes, setQuestionTypes] = useState(['mcq', 'true_false'])
  const [answers, setAnswers] = useState({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [result, setResult] = useState(null)

  const selectedQuiz = quizzes.find(quiz => quiz.id === selectedId)
  const currentQuestion = questions[currentIndex]
  const completedCount = Object.keys(answers).filter(key => String(answers[key] ?? '').trim()).length
  const selectedStudySet = useMemo(
    () => studySets.find(set => String(set.id) === String(studySetId)),
    [studySets, studySetId],
  )
  const availableFiles = useMemo(
    () => (selectedStudySet?.files || []).filter(supportedFile),
    [selectedStudySet],
  )

  async function loadQuizzes(keepSelection = true) {
    if (!userId) return
    setLoading(true)
    setError('')
    try {
      const { data, error: queryError } = await supabase
        .from('study_quizzes')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (queryError) throw queryError
      setQuizzes(data || [])
      if (!keepSelection || !selectedId) {
        setSelectedId(data?.[0]?.id || null)
        if (data?.length) setMode('details')
      }
    } catch (err) {
      console.error(err)
      setError('Could not load your saved quizzes. Check the Supabase quiz tables and try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadQuizzes(false) }, [userId])

  useEffect(() => {
    if (!selectedId || !userId) {
      setQuestions([])
      setAttempts([])
      return undefined
    }
    let active = true
    async function loadDetails() {
      try {
        const [questionResult, attemptResult] = await Promise.all([
          supabase.from('study_quiz_questions').select('*').eq('user_id', userId).eq('quiz_id', selectedId).order('sort_order'),
          supabase.from('study_quiz_attempts').select('*').eq('user_id', userId).eq('quiz_id', selectedId).order('created_at', { ascending: false }),
        ])
        if (questionResult.error) throw questionResult.error
        if (attemptResult.error) throw attemptResult.error
        if (active) {
          setQuestions(questionResult.data || [])
          setAttempts(attemptResult.data || [])
        }
      } catch (err) {
        console.error(err)
        if (active) setError('Could not load this quiz. Please refresh and try again.')
      }
    }
    loadDetails()
    return () => { active = false }
  }, [selectedId, userId])

  useEffect(() => {
    setSelectedFileIds(availableFiles.map(file => file.id))
  }, [studySetId, availableFiles])

  function toggleQuestionType(type) {
    setQuestionTypes(current => current.includes(type)
      ? current.filter(item => item !== type)
      : [...current, type])
  }

  function toggleFile(fileId) {
    setSelectedFileIds(current => current.includes(fileId)
      ? current.filter(id => id !== fileId)
      : [...current, fileId])
  }

  async function generateQuiz(event) {
    event.preventDefault()
    if (generating) return
    if (!studySetId && !pastedText.trim()) {
      setError('Choose a study set or paste some study material first.')
      return
    }
    if (!questionTypes.length) {
      setError('Choose at least one question type.')
      return
    }
    const hasSetText = Boolean(
      (includeNotes && selectedStudySet?.notes?.trim()) ||
      (includeFlashcards && selectedStudySet?.flashcards?.length) ||
      selectedFileIds.length,
    )
    if (!hasSetText && !pastedText.trim()) {
      setError('There is no selected material to generate questions from. Add notes, flashcards, a PDF/text file, or paste material.')
      return
    }

    setGenerating(true)
    setError('')
    try {
      const { data, error: functionError } = await supabase.functions.invoke('generate-quiz', {
        body: {
          title: title.trim(),
          studySetId: studySetId || null,
          includeNotes,
          includeFlashcards,
          fileIds: selectedFileIds,
          pastedText: pastedText.trim(),
          questionCount: Number(questionCount),
          difficulty,
          questionTypes,
        },
      })
      if (functionError) throw functionError
      if (data?.error) throw new Error(data.error)
      if (!data?.quiz?.id) throw new Error('The AI service did not return a saved quiz. Please try again.')

      setTitle('')
      setPastedText('')
      setSelectedId(data.quiz.id)
      setResult(null)
      setAnswers({})
      setCurrentIndex(0)
      setMode('details')
      await loadQuizzes(true)
    } catch (err) {
      console.error('Quiz generation failed:', err)
      setError(err.message || 'Could not generate your quiz. Check that the AI function is deployed and configured.')
    } finally {
      setGenerating(false)
    }
  }

  function startQuiz() {
    setAnswers({})
    setCurrentIndex(0)
    setResult(null)
    setMode('taking')
  }

  function chooseAnswer(value) {
    if (!currentQuestion) return
    setAnswers(current => ({ ...current, [currentQuestion.id]: value }))
  }

  async function submitQuiz() {
    if (!questions.length || savingAttempt) return
    const score = questions.reduce((total, question) => (
      total + (normaliseAnswer(answers[question.id]) === normaliseAnswer(question.correct_answer) ? 1 : 0)
    ), 0)
    const attempt = { score, total: questions.length, answers }
    setResult(attempt)
    setSavingAttempt(true)
    try {
      const { data, error: attemptError } = await supabase
        .from('study_quiz_attempts')
        .insert({ user_id: userId, quiz_id: selectedId, score, total_questions: questions.length, answers })
        .select()
        .single()
      if (attemptError) throw attemptError
      setAttempts(current => [data, ...current])
    } catch (err) {
      console.error(err)
      setError('Your score is shown, but this attempt could not be saved.')
    } finally {
      setSavingAttempt(false)
      setMode('result')
    }
  }

  async function deleteQuiz(quiz) {
    if (!window.confirm(`Delete “${quiz.title}” and its attempt history?`)) return
    try {
      const { error: deleteError } = await supabase.from('study_quizzes').delete().eq('id', quiz.id).eq('user_id', userId)
      if (deleteError) throw deleteError
      setSelectedId(null)
      setMode('generate')
      await loadQuizzes(false)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Could not delete this quiz.')
    }
  }

  const linkedSet = useMemo(
    () => studySets.find(set => String(set.id) === String(selectedQuiz?.study_set_id)),
    [studySets, selectedQuiz],
  )

  return (
    <section className="quizzes-page">
      <div className="quizzes-page-heading">
        <div>
          <p className="eyebrow">PRACTISE · TEST · IMPROVE</p>
          <h1>Quizzes</h1>
          <p className="welcome-subtitle">Turn your own study material into practice quizzes with AI.</p>
        </div>
        <div className="notes-total-card"><strong>{quizzes.length}</strong><span>Saved quizzes</span></div>
      </div>

      {error && <div className="notes-error quiz-error-banner" role="alert">{error}</div>}

      <div className="quizzes-layout">
        <aside className="quiz-library-panel">
          <button className="primary-button quiz-create-button" onClick={() => { setMode('generate'); setSelectedId(null); setError('') }}>✧ Generate with AI</button>
          <h2>Your quizzes</h2>
          {loading ? <p className="quiz-muted">Loading quizzes…</p> : quizzes.length ? quizzes.map(quiz => (
            <button key={quiz.id} className={`quiz-library-item ${selectedId === quiz.id ? 'active' : ''}`} onClick={() => { setSelectedId(quiz.id); setMode('details'); setResult(null); setError('') }}>
              <strong>{quiz.title}</strong>
              <span>{quiz.description || 'AI-generated practice quiz'}</span>
              <small>{quiz.study_set_id ? 'Linked to a study set' : 'Pasted material'}</small>
            </button>
          )) : <p className="quiz-muted">Your generated quizzes will appear here.</p>}
        </aside>

        <div className="quiz-main-panel">
          {mode === 'generate' ? (
            <div className="quiz-generator">
              <div className="quiz-generator-heading">
                <span className="quiz-ai-icon">✧</span>
                <div><p className="eyebrow">YOUR MATERIAL, YOUR PRACTICE</p><h2>Create a new quiz</h2><p className="quiz-muted">Choose what to study. MindMate will write the questions and answer key.</p></div>
              </div>
              <form className="quiz-generator-form" onSubmit={generateQuiz}>
                <label className="quiz-field">Quiz title <span className="quiz-optional">Optional</span>
                  <input value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Java – Constructors and Inheritance" maxLength={100} />
                </label>

                <label className="quiz-field">Choose a study set
                  <select value={studySetId} onChange={event => setStudySetId(event.target.value)}>
                    <option value="">No study set — use pasted material</option>
                    {studySets.map(set => <option key={set.id} value={set.id}>{set.subjectName} / {set.chapterName} / {set.name}</option>)}
                  </select>
                </label>

                {selectedStudySet && (
                  <div className="quiz-source-card">
                    <strong>{selectedStudySet.name}</strong>
                    <span>{selectedStudySet.subjectName} / {selectedStudySet.chapterName}</span>
                    <label className="quiz-check-row"><input type="checkbox" checked={includeNotes} onChange={event => setIncludeNotes(event.target.checked)} /> Include saved notes</label>
                    <label className="quiz-check-row"><input type="checkbox" checked={includeFlashcards} onChange={event => setIncludeFlashcards(event.target.checked)} /> Include flashcards</label>
                    <div className="quiz-file-list">
                      <p>Study set files</p>
                      {availableFiles.length ? availableFiles.map(file => (
                        <label className="quiz-check-row" key={file.id}>
                          <input type="checkbox" checked={selectedFileIds.includes(file.id)} onChange={() => toggleFile(file.id)} />
                          <span>{file.name}</span><small>{file.type?.includes('pdf') || /\.pdf$/i.test(file.name) ? 'PDF' : 'Text'}</small>
                        </label>
                      )) : <span className="quiz-muted">No PDF or text files in this study set yet.</span>}
                      {(selectedStudySet.files || []).some(file => !supportedFile(file)) && <p className="quiz-muted">Some file formats are not supported by quiz generation yet. PDF and text files are supported.</p>}
                    </div>
                  </div>
                )}

                <label className="quiz-field">Add extra material <span className="quiz-optional">Optional</span>
                  <textarea value={pastedText} onChange={event => setPastedText(event.target.value)} rows={6} placeholder="Paste textbook extracts, class notes, a topic outline, or any other study material here…" />
                </label>

                <div className="quiz-settings-grid">
                  <label className="quiz-field">Number of questions
                    <select value={questionCount} onChange={event => setQuestionCount(event.target.value)}>
                      <option value="5">5 questions</option><option value="10">10 questions</option><option value="15">15 questions</option><option value="20">20 questions</option>
                    </select>
                  </label>
                  <label className="quiz-field">Difficulty
                    <select value={difficulty} onChange={event => setDifficulty(event.target.value)}>
                      <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                    </select>
                  </label>
                </div>

                <div className="quiz-field">
                  <span>Question types</span>
                  <div className="quiz-type-options">
                    {QUESTION_TYPES.map(type => <label className={`quiz-type-chip ${questionTypes.includes(type.value) ? 'selected' : ''}`} key={type.value}>
                      <input type="checkbox" checked={questionTypes.includes(type.value)} onChange={() => toggleQuestionType(type.value)} />{type.label}
                    </label>)}
                  </div>
                </div>

                <div className="quiz-generator-footer">
                  <p className="quiz-muted">Questions are generated from the material you select, not from unrelated topics.</p>
                  <button type="submit" className="primary-button" disabled={generating}>{generating ? '✧ Generating your quiz…' : '✧ Generate quiz'}</button>
                </div>
              </form>
            </div>
          ) : mode === 'taking' && currentQuestion ? (
            <div className="quiz-question-card">
              <span className="eyebrow">QUESTION {currentIndex + 1} OF {questions.length}</span>
              <div className="quiz-progress-track"><div style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} /></div>
              <h2>{currentQuestion.prompt}</h2>
              {currentQuestion.question_type === 'short' ? (
                <input className="quiz-answer-input" value={answers[currentQuestion.id] || ''} onChange={event => chooseAnswer(event.target.value)} placeholder="Type your answer…" />
              ) : (currentQuestion.options || []).map((option, index) => (
                <label key={index} className={`quiz-choice ${answers[currentQuestion.id] === option ? 'selected' : ''}`}>
                  <input type="radio" name={`question-${currentQuestion.id}`} checked={answers[currentQuestion.id] === option} onChange={() => chooseAnswer(option)} />{option}
                </label>
              ))}
              <div className="quiz-actions">
                <button className="secondary-button" disabled={currentIndex === 0} onClick={() => setCurrentIndex(index => index - 1)}>← Previous</button>
                {currentIndex < questions.length - 1
                  ? <button className="primary-button" onClick={() => setCurrentIndex(index => index + 1)}>Next question →</button>
                  : <button className="primary-button" disabled={savingAttempt || completedCount !== questions.length} onClick={submitQuiz}>{savingAttempt ? 'Submitting…' : 'Submit quiz'}</button>}
              </div>
              <p className="quiz-muted">Answered {completedCount} of {questions.length}. Complete every question before submitting.</p>
            </div>
          ) : mode === 'result' && result ? (
            <div className="quiz-question-card">
              <p className="eyebrow">QUIZ COMPLETED</p><h2>Your result</h2>
              <div className="quiz-result-panel"><strong className="quiz-score">{result.score}/{result.total}</strong><p>{Math.round((result.score / result.total) * 100)}% correct</p></div>
              {questions.map((question, index) => {
                const correct = normaliseAnswer(answers[question.id]) === normaliseAnswer(question.correct_answer)
                return <div className="quiz-review-item" key={question.id}>
                  <strong>{index + 1}. {question.prompt}</strong>
                  <p>Your answer: {answers[question.id] || 'Not answered'}</p>
                  <p>Correct answer: {question.correct_answer}</p>
                  {question.explanation && <p className="quiz-explanation">{question.explanation}</p>}
                  <span className={correct ? 'quiz-correct' : 'quiz-incorrect'}>{correct ? 'Correct' : 'Incorrect'}</span>
                </div>
              })}
              <div className="quiz-actions"><button className="primary-button" onClick={startQuiz}>Try again</button><button className="secondary-button" onClick={() => setMode('details')}>Back to quiz</button></div>
            </div>
          ) : selectedQuiz ? (
            <div className="quiz-detail-view">
              <p className="eyebrow">SAVED PRACTICE QUIZ</p>
              <h2>{selectedQuiz.title}</h2>
              <p className="quiz-muted">{selectedQuiz.description || 'AI-generated from your selected study material.'}</p>
              {linkedSet && <p className="quiz-muted">Source: {linkedSet.subjectName} / {linkedSet.chapterName} / {linkedSet.name}</p>}
              <div className="quiz-detail-stats"><span><strong>{questions.length}</strong> Questions</span><span><strong>{attempts.length}</strong> Attempts</span></div>
              {questions.length ? <button className="primary-button" onClick={startQuiz}>Start quiz →</button> : <p className="quiz-muted">This saved quiz has no questions.</p>}
              <div className="quiz-actions"><button className="text-action" onClick={() => deleteQuiz(selectedQuiz)}>Delete quiz</button><button className="text-action" onClick={() => { setSelectedId(null); setMode('generate') }}>Generate another →</button></div>
              <h3 className="quiz-history-heading">Previous attempts</h3>
              {attempts.length ? attempts.map(attempt => <div className="quiz-history-row" key={attempt.id}><span>{new Date(attempt.created_at).toLocaleString()}</span><strong>{attempt.score}/{attempt.total_questions} ({Math.round(attempt.score / attempt.total_questions * 100)}%)</strong></div>) : <p className="quiz-muted">Your completed attempts will appear here.</p>}
            </div>
          ) : (
            <div className="notes-empty-editor"><span>✧</span><h2>Ready when you are</h2><p>Choose a study set or paste your material, then let MindMate build a quiz for you.</p><button className="primary-button" onClick={() => setMode('generate')}>Generate your first quiz</button></div>
          )}
        </div>
      </div>
    </section>
  )
}
