import { JobsService } from '../../src/jobs/jobs.service';

const fakePrisma = { enabled: false, client: null } as any;

describe('Durable async primitives (H1)', () => {
  it('claimOnce grants a key exactly once (replica-safe / idempotency)', async () => {
    const jobs = new JobsService(fakePrisma);
    expect(await jobs.claimOnce('run:hour-13')).toBe(true);
    expect(await jobs.claimOnce('run:hour-13')).toBe(false);
  });

  it('alreadyProcessed dedupes webhook/approval keys', async () => {
    const jobs = new JobsService(fakePrisma);
    expect(await jobs.alreadyProcessed('esign-webhook:evt-1')).toBe(false);
    expect(await jobs.alreadyProcessed('esign-webhook:evt-1')).toBe(true);
  });

  it('retries with backoff and returns on eventual success', async () => {
    const jobs = new JobsService(fakePrisma);
    let attempts = 0;
    const result = await jobs.runWithRetry(
      'flaky',
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('transient');
        return 'ok';
      },
      { retries: 5, baseDelayMs: 1 },
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
    expect(jobs.deadLetters()).toHaveLength(0);
  });

  it('dead-letters a job that exhausts its retries', async () => {
    const jobs = new JobsService(fakePrisma);
    await expect(
      jobs.runWithRetry('always-fails', async () => { throw new Error('boom'); }, {
        retries: 2,
        baseDelayMs: 1,
        key: 'job-x',
      }),
    ).rejects.toThrow('boom');
    const dlq = jobs.deadLetters();
    expect(dlq).toHaveLength(1);
    expect(dlq[0].key).toBe('job-x');
    expect(dlq[0].attempts).toBe(3);
  });
});
