import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ListAiAnalysisRunsQueryDto } from '../overview/ai-runs-overview.dto';

const check = (query: Record<string, string>) =>
  validate(plainToInstance(ListAiAnalysisRunsQueryDto, query));

describe('GET /ai-analysis-runs: sort and priority', () => {
  it('takes the two orders, and none', async () => {
    expect(await check({})).toHaveLength(0);
    expect(await check({ sort: 'priority' })).toHaveLength(0);
    expect(await check({ sort: 'createdAt' })).toHaveLength(0);
  });

  it('refuses any other order', async () => {
    expect(await check({ sort: 'score' })).toHaveLength(1);
    expect(await check({ sort: 'PRIORITY' })).toHaveLength(1);
    expect(await check({ sort: '' })).toHaveLength(1);
  });

  it('takes each level as a filter', async () => {
    for (const priority of ['URGENT', 'HIGH', 'ROUTINE']) {
      expect(await check({ priority })).toHaveLength(0);
    }
  });

  it('refuses a level it does not know, in any case', async () => {
    expect(await check({ priority: 'urgent' })).toHaveLength(1);
    expect(await check({ priority: 'CRITICAL' })).toHaveLength(1);
    expect(await check({ priority: 'LOW' })).toHaveLength(1);
  });

  it('combines with the other filters and the paging', async () => {
    expect(
      await check({
        decision: 'pending',
        limit: '5',
        page: '1',
        priority: 'URGENT',
        sort: 'priority',
      }),
    ).toHaveLength(0);
  });
});
