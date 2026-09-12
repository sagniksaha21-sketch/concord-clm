import { NotificationsService } from '../../src/notifications/notifications.service';
import * as graph from '../../src/notifications/graph.client';

describe('Outlook request retry classification', () => {
  afterEach(() => jest.restoreAllMocks());
  it.each([[400, true], [401, true], [403, true], [408, false], [429, true], [500, false], [503, false], [undefined, false]])('classifies provider status %p without claiming delivery', async (statusCode, retrySafe) => {
    jest.spyOn(graph, 'isGraphConfigured').mockReturnValue(true);
    jest.spyOn(graph, 'getGraphClient').mockReturnValue({ api: () => ({ post: async () => { throw { statusCode }; } }) } as any);
    const result = await new NotificationsService().sendEmail({ to: ['uat@example.test'], subject: 'UAT assignment', html: '<p>Test only</p>' });
    expect(result.status).toBe('failed'); expect(result.retrySafe).toBe(retrySafe);
  });
});
