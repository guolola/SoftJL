// Keeps answered questions on their assistant turn and repairs exact legacy question/answer echoes for display.
import type { StandardProjectState } from '@uml-platform/contracts'

export function presentConversationClarifications(state: StandardProjectState): StandardProjectState {
  const original = state.conversation
  if (!original?.length) return state
  let conversation = original
  let cursor = 0

  for (const round of state.rounds) {
    if (!round.questions.length || !round.answers.length) continue
    const answers = round.questions.map(question => round.answers.find(answer => answer.questionId === question.id)?.answer)
    if (answers.some(answer => !answer?.trim())) continue
    const answerText = answers.join('\n')
    const legacyText = round.questions.map((question, index) => `${question.title}：${answers[index]}`).join('\n')

    for (let index = cursor; index < conversation.length; index++) {
      const response = conversation[index]!
      if (response.role !== 'user' || (response.text !== answerText && response.text !== legacyText)) continue
      const ownerIndex = index - 1
      if (conversation[ownerIndex]?.role !== 'assistant') continue
      let start = ownerIndex
      while (start > 0 && conversation[start - 1]?.role === 'assistant') start--
      const owner = conversation[ownerIndex]!
      const hasQuestion = conversation.slice(start, index).some(message => message.tools?.some(tool => tool.name === 'ask_questions'))
        || round.questions.every(question => owner.text.includes(question.title))
      // Match stored question/answer data, never classify a message by its wording or change its role.
      if (response.text !== legacyText && !hasQuestion) continue
      const missing = round.questions.map(question => question.title).filter(title => !owner.text.includes(title))
      if (missing.length || response.text !== answerText) {
        if (conversation === original) conversation = original.slice()
        if (missing.length) conversation[ownerIndex] = { ...owner, text: [owner.text, ...missing].filter(text => text.trim()).join('\n\n') }
        if (response.text !== answerText) conversation[index] = { ...response, text: answerText }
      }
      cursor = index + 1
      break
    }
  }

  // This projection preserves persisted IDs, timestamps and action targets without rewriting saved history.
  return conversation === original ? state : { ...state, conversation }
}
