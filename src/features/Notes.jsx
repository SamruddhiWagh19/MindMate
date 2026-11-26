import { useEffect, useMemo, useState } from 'react'
import './Notes.css'

export default function Notes({ subjects = [], onSaveNotes, onOpenStudySet }) {
  const notes = useMemo(() => subjects.flatMap(subject =>
    (subject.chapters || []).flatMap(chapter =>
      (chapter.sets || []).map(set => ({
        id: set.id,
        name: set.name,
        content: set.notes || '',
        subjectName: subject.name,
        chapterName: chapter.name,
        subjectId: subject.id,
        chapterId: chapter.id,
      }))
    )
  ), [subjects])

  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [saveState, setSaveState] = useState('Saved')
  const [error, setError] = useState('')
  const selected = notes.find(note => String(note.id) === String(selectedId))

  useEffect(() => {
    if (!selected) {
      setDraft('')
      return
    }
    setDraft(selected.content)
    setSaveState('Saved')
    setError('')
  }, [selectedId, selected?.content])

  useEffect(() => {
    if (!selected || draft === selected.content) return undefined
    setSaveState('Saving…')
    const timer = window.setTimeout(async () => {
      try {
        await onSaveNotes(selected.id, draft)
        setSaveState('Saved')
        setError('')
      } catch (err) {
        console.error(err)
        setSaveState('Not saved')
        setError('Your changes could not be saved. Check your connection and try again.')
      }
    }, 650)
    return () => window.clearTimeout(timer)
  }, [draft, selectedId]) // save after the user pauses typing

  const filtered = notes.filter(note =>
    `${note.name} ${note.subjectName} ${note.chapterName} ${note.content}`
      .toLowerCase().includes(search.toLowerCase())
  )
  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0

  return (
    <section className="notes-page">
      <div className="notes-page-heading">
        <div>
          <p className="eyebrow">YOUR PERSONAL KNOWLEDGE SPACE</p>
          <h1>My Notes</h1>
          <p className="welcome-subtitle">All your study-set notes, together in one place.</p>
        </div>
        <div className="notes-total-card"><strong>{notes.length}</strong><span>Study set notes</span></div>
      </div>

      <div className="notes-workspace">
        <aside className="notes-list-panel">
          <input className="notes-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notes, subjects or chapters…" />
          <div className="notes-list-heading">YOUR STUDY SETS <span>{filtered.length}</span></div>
          {filtered.length ? filtered.map(note => (
            <button key={note.id} className={`notes-list-item ${String(selectedId) === String(note.id) ? 'active' : ''}`} onClick={() => setSelectedId(note.id)}>
              <strong>{note.name}</strong>
              <span>{note.subjectName} / {note.chapterName}</span>
              <small>{note.content.trim() ? `${note.content.trim().split(/\s+/).length} words` : 'No notes yet'}</small>
            </button>
          )) : <div className="notes-list-empty">No matching study sets. Create a study set in My Library first.</div>}
        </aside>

        <div className="notes-editor-panel">
          {selected ? <>
            <div className="notes-editor-top">
              <div><p>{selected.subjectName} / {selected.chapterName}</p><h2>{selected.name}</h2></div>
              <span className={`notes-save-status ${saveState === 'Not saved' ? 'error' : ''}`}>● {saveState}</span>
            </div>
            <textarea className="notes-main-editor" value={draft} onChange={e => setDraft(e.target.value)} placeholder={'Start writing your notes…\n\nAdd definitions, examples, explanations and important points.'} />
            <div className="notes-editor-footer"><span>{wordCount} words</span><div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><button className="text-action" onClick={async () => { if (!window.confirm('Clear all notes in this study set?')) return; setDraft(''); try { await onSaveNotes(selected.id, ''); setSaveState('Saved'); setError('') } catch (err) { console.error(err); setSaveState('Not saved'); setError('Your notes could not be cleared. Please try again.') } }}>Clear notes</button><button className="text-action" onClick={() => onOpenStudySet(selected.subjectId, selected.chapterId, selected.id)}>Open in My Library →</button></div></div>
            {error && <p className="notes-error">{error}</p>}
          </> : <div className="notes-empty-editor"><span>▧</span><h2>Your notes live here</h2><p>Select a study set to view or edit its notes. Notes are automatically saved to your account.</p></div>}
        </div>
      </div>
    </section>
  )
}
