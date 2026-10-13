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

export function longIntervalRepairFixture() {
  const result = continuousMaterializationFixture()
  const { data } = result.document
  const obsoleteIds = Object.values(data.occurrencesById)
    .filter((item) => item.status === 'available').map((item) => item.id)
  const tank = data.definitionsById.tank
  if (tank.schedule.frequency !== 'after_completion') throw new Error('Expected repeating fixture')
  tank.schedule = { ...tank.schedule, intervalDays: 120 }
  for (const item of Object.values(data.occurrencesById)) {
    if (item.definitionId === 'tank' && item.status !== 'done') delete data.occurrencesById[item.id]
  }
  const add = (definitionId: string, scheduledAt: string, fields: Partial<ChoreWorkspaceData['occurrencesById'][string]> = {}) => {
    const id = `${definitionId}:${scheduledAt}:manager`
    data.occurrencesById[id] = {
      id, definitionId, scheduledAt,
      dueAt: new Date(Date.parse(scheduledAt) + 3600000).toISOString(),
      assigneeIds: ['manager'], assignmentSlot: 'manager', status: 'available',
      updatedAt: scheduledAt, ...fields,
    }
    return id
  }
  // Keep the next valid long-interval recurrence and protected future work.
  add('tank', '2027-01-31T17:00:00.000Z')
  obsoleteIds.push(add('tank', '2027-02-10T17:00:00.000Z'))
  obsoleteIds.push(add('plants', '2027-02-01T17:00:00.000Z'))
  add('plants', '2027-02-05T17:00:00.000Z', { carriedForwardFrom: 'plants:2026-10-08T16:00:00.000Z:manager' })
  add('plants', '2027-02-06T17:00:00.000Z', { status: 'claimed', claimedBy: 'manager', claimedAt: '2026-10-13T10:00:00.000Z' })
  data.participantsById.manager.pausedAt = '2027-03-01T00:00:00.000Z'
  add('plants', '2027-03-05T17:00:00.000Z')
  return { ...result, obsoleteIds }
}

export function loneStaleRepeatFixture(intervalDays = 120) {
  const result = longIntervalRepairFixture()
  const { data } = result.document
  const tank = data.definitionsById.tank
  if (tank.schedule.frequency !== 'after_completion') throw new Error('Expected repeating fixture')
  tank.schedule.intervalDays = intervalDays
  const stale = data.occurrencesById['tank:2027-02-10T17:00:00.000Z:manager']
  delete data.occurrencesById['tank:2027-01-31T17:00:00.000Z:manager']
  if (intervalDays === 14) {
    delete data.occurrencesById[stale.id]
    stale.scheduledAt = '2026-10-14T16:00:00.000Z'
    stale.dueAt = '2026-10-14T17:00:00.000Z'
    stale.updatedAt = stale.scheduledAt
    stale.id = `tank:${stale.scheduledAt}:manager`
    data.occurrencesById[stale.id] = stale
    result.obsoleteIds.push(stale.id)
  }
  return result
}
