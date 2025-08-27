import { Queue, Worker, type Job } from 'bullmq'
import IORedis from 'ioredis'

/**
 * Shared Redis connection for BullMQ.
 *  - maxRetriesPerRequest must be null for BullMQ blocking commands
 *  - enableOfflineQueue disabled so we fail fast if Redis is unavailable
 */
export const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
})

export const forecastQueue = new Queue('forecast', { connection })
export const alertQueue = new Queue('alert', { connection })

/**
 * Instantiate workers only when explicitly enabled.
 * This avoids crashes in environments without Redis running.
 * Enable by setting START_WORKERS=true (e.g., production or worker process).
 */
if (process.env.START_WORKERS === 'true') {
  try {
    // Forecast worker (placeholder implementation)
    new Worker(
      'forecast',
      async (job: Job) => {
        // TODO: implement real forecasting logic
        return { ok: true, datasetId: job.data.datasetId }
      },
      { connection },
    )

    // Alert worker (placeholder implementation)
    new Worker(
      'alert',
      async (job: Job) => {
        // TODO: implement real alerting/notification logic
        return { ok: true, ruleId: job.data.ruleId }
      },
      { connection },
    )
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to start BullMQ workers', err)
  }
}
