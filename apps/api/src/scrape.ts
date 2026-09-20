import { createDb } from './db/index.js';
import { runScrape } from './pipeline/run.js';
import { createSources } from './sources.js';
import { createClassifier } from './llm/classifier.js';
import { config } from './config.js';

const db = createDb(config.dbPath);
const summary = await runScrape({
  db,
  sources: createSources(db),
  classify: createClassifier(),
  log: (message) => console.log(message),
});

console.log('\nResumen:');
for (const s of summary.perSource) {
  console.log(
    `  ${s.source}: ${s.fetched} bajadas, ${s.inserted} nuevas${s.error !== null ? `, ERROR: ${s.error}` : ''}`,
  );
}
console.log(
  `  clasificadas: ${summary.classified}, descartadas por reglas: ${summary.discardedByRules}`,
);
db.close();
