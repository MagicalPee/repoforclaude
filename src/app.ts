import { type AppConfig, loadConfig } from "./config.js";
import { openDatabase } from "./db/database.js";
import { Store } from "./db/store.js";
import { log, setLogLevel } from "./logger.js";
import type { SafeFetcher } from "./net/safeFetch.js";
import { refreshMinedPatterns, seedHeuristicPatterns } from "./patterns/miner.js";
import { ensureSeeded } from "./research/seeds.js";
import { importBundledSnapshots } from "./research/snapshot.js";
import { ResearchService } from "./research/service.js";

export interface App {
  config: AppConfig;
  store: Store;
  research: ResearchService;
  close: () => Promise<void>;
}

/**
 * Opens the database, applies migrations and seeds, and recovers jobs left running by a
 * previous process. Nothing here touches the network.
 */
export function createApp(options: { config?: AppConfig; fetcher?: SafeFetcher } = {}): App {
  const config = options.config ?? loadConfig();
  setLogLevel(config.logLevel);
  const store = new Store(openDatabase(config.dbPath));
  ensureSeeded(store, process.env.DIM_EXTRA_SEEDS_FILE || undefined);
  seedHeuristicPatterns(store);
  const imported = importBundledSnapshots(store);
  const interrupted = store.markInterruptedJobs();
  if (interrupted > 0) log.info("marked interrupted research jobs as resumable", { interrupted });
  if (imported > 0 || store.listPatterns({ origin: "mined" }).length === 0) {
    try {
      refreshMinedPatterns(store);
    } catch (error) {
      log.warn("pattern mining skipped", { error: (error as Error).message });
    }
  }
  const research = new ResearchService(store, config, options.fetcher);
  return {
    config,
    store,
    research,
    close: async () => {
      await research.close();
      store.db.close();
    },
  };
}
