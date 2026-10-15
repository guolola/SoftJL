// Loads the authenticated, complete dashboard summary through the common HTTP client.
import { dashboardSummarySchema } from '@uml-platform/contracts'
import { requestJson } from '@/services/api-client'

export const dashboardApi = {
  async getSummary(signal?: AbortSignal) {
    return dashboardSummarySchema.parse(await requestJson('/api/dashboard/summary', { signal }))
  },
}
