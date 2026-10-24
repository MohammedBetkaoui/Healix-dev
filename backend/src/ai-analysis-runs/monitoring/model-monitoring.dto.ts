import { AiRunsPeriodQueryDto } from '../overview/ai-runs-overview.dto';

// ?from&to: ISO instants. `from` rounds down to the start of its month (the
// board is monthly), `to` defaults to now and `from` to eleven months before
// it; at most 24 months.
export class ModelMonitoringQueryDto extends AiRunsPeriodQueryDto {}
