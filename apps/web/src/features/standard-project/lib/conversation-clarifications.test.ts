// Verifies speaker ownership for submitted answers and narrowly matched legacy transcripts.
import { expect, it } from 'vitest'
import { createStandardProjectState, type StandardConversationMessage, type StandardProjectState } from '@uml-platform/contracts'
import { presentConversationClarifications } from './conversation-clarifications'

const message = (id: string, role: 'user' | 'assistant', text: string): StandardConversationMessage => ({ id, role, text, status: 'completed', createdAt: '2026-10-17T10:00:00Z' })
const title = '你目前只发来了问候，还没有具体的项目需求说明。请先选择本次希望生成的模型（可多选）：'
const option = '功能结构图：展示系统模块及功能划分'
function fixture(legacy: boolean): StandardProjectState {
  return { ...createStandardProjectState(), rounds: [{ purpose: 'generation_scope', questions: [
    { id: 'scope', title, options: [option, '用例图'], multiple: true, recommendation: option },
  ], answers: [{ questionId: 'scope', answer: option }] }], conversation: [
    message('hello', 'user', '你好'),
    { ...message('question', 'assistant', ''), reasoning: '确认生成范围', tools: [{ id: 'ask', name: 'ask_questions', status: 'completed' }] },
    { ...message('answer', 'user', legacy ? `${title}：${option}` : option), quote: { text: '引用内容' } },
    message('next', 'assistant', '请补充项目主题。'),
  ] }
}

it.each([true, false])('keeps the Agent question on the assistant turn and only the selection on the user turn (legacy=%s)', legacy => {
  const state = fixture(legacy)
  const saved = structuredClone(state)
  const visible = presentConversationClarifications(state)
  expect(visible.conversation!.map(item => [item.id, item.role, item.text])).toEqual([
    ['hello', 'user', '你好'], ['question', 'assistant', title], ['answer', 'user', option], ['next', 'assistant', '请补充项目主题。'],
  ])
  expect(visible.conversation![1]!.reasoning).toBe('确认生成范围')
  expect(visible.conversation![1]!.tools).toEqual(state.conversation![1]!.tools)
  expect(visible.conversation![2]!.quote).toEqual({ text: '引用内容' })
  expect(visible.conversation!.map(item => item.createdAt)).toEqual(state.conversation!.map(item => item.createdAt))
  expect(state).toEqual(saved)
  expect(presentConversationClarifications(visible)).toBe(visible)
})

it('preserves multiple rounds, repeated answers and the question order', () => {
  const state = fixture(false)
  state.rounds.push({ questions: [
    { id: 'role', title: '谁可以借阅？', options: ['学生', '教师'], multiple: false, recommendation: '学生' },
    { id: 'return', title: '谁可以归还？', options: ['学生', '教师'], multiple: false, recommendation: '学生' },
  ], answers: [{ questionId: 'return', answer: '学生' }, { questionId: 'role', answer: '学生' }] })
  state.conversation!.push(message('second-answer', 'user', '谁可以借阅？：学生\n谁可以归还？：学生'))
  const visible = presentConversationClarifications(state)
  expect(visible.conversation![1]!.text).toBe(title)
  expect(visible.conversation![3]!.text).toBe('请补充项目主题。\n\n谁可以借阅？\n\n谁可以归还？')
  expect(visible.conversation![4]!.text).toBe('学生\n学生')
})

it('does not reclassify free text or messages that only quote part of a question', () => {
  const state = fixture(true)
  state.conversation![2]!.text += '\n另外请增加报表模块。'
  expect(presentConversationClarifications(state)).toBe(state)
})

it('keeps unanswered questions in the interactive form and avoids duplicating existing assistant text', () => {
  const state = fixture(false)
  state.rounds[0]!.answers = []
  expect(presentConversationClarifications(state)).toBe(state)
  state.rounds[0]!.answers = [{ questionId: 'scope', answer: option }]
  state.conversation![1]!.text = title
  expect(presentConversationClarifications(state)).toBe(state)
})
