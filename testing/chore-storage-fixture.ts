import {
  createChoreOutboxItem,
  createEmptyChoreWorkspace,
  type ChoreActivity,
  type ChoreWorkspaceData,
} from '../packages/core/src/chores'
import fixture from './fixtures/chores/continuous-materialization.json'

export function continuousMaterializationFixture() {
  const document = structuredClone(fixture) as Omit<typeof fixture, 'data'> & {
    data: ChoreWorkspaceData
  }
  document.data = { ...createEmptyChoreWorkspace(), ...document.data }
  const events: ChoreActivity[] = Array.from({ length: 37_288 }, (_, index) => {
    const commandId = `chore:legacy-materialization:${index}`
    return {
      id: `activity:${commandId}`,
      commandId,
      type: 'workspace_materialized',
      timestamp: new Date(Date.parse('2026-10-12T00:00:00.000Z') + index * 1000).toISOString(),
    }
  })
  const completed = Object.values(document.data.occurrencesById).filter(
    (item) => item.status === 'done',
  )
  for (const [index, occurrence] of completed.entries()) {
    events[index === 0 ? 100 : 30_000] = {
      id: `activity:completion:${occurrence.id}`,
      commandId: `completion:${occurrence.id}`,
      type: 'completed',
      timestamp: occurrence.completedAt ?? occurrence.updatedAt,
      occurrenceId: occurrence.id,
      definitionId: occurrence.definitionId,
      actorParticipantId: 'manager',
    }
  }
  for (const occurrence of Object.values(document.data.occurrencesById)) {
    if (occurrence.status === 'available') continue
    events.push({
      id: `activity:scheduler:due:${occurrence.id}`,
      commandId: `scheduler:due:${occurrence.id}`,
      type: 'due',
      timestamp: occurrence.dueAt,
      occurrenceId: occurrence.id,
      definitionId: occurrence.definitionId,
      assigneeIds: occurrence.assigneeIds,
    })
  }
  document.data.activity = events.slice(-5000)
  document.data.outbox = document.data.activity.map(createChoreOutboxItem)
  return { document, events }
}
