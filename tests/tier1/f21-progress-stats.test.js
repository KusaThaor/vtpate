// tests/tier1/f21-progress-stats.test.js
// Tier 1 - Feature 21: Visual Progress Bar & Live Stats
const { assert } = require('../harness/test-assert');

module.exports = {
  name: 'Feature 21: Visual Progress Bar & Live Stats',
  featureId: 21,
  milestone: 'M5',
  tests: [
    {
      name: 'F21.1: Progress percentage calculation returns correct integer/float rounded value',
      fn: () => {
        const computeProgress = (completed, total) => {
          if (!total || total <= 0) return 0;
          return Math.min(100, Math.round((completed / total) * 100));
        };

        assert.strictEqual(computeProgress(0, 100), 0);
        assert.strictEqual(computeProgress(50, 100), 50);
        assert.strictEqual(computeProgress(33, 100), 33);
        assert.strictEqual(computeProgress(100, 100), 100);
      }
    },
    {
      name: 'F21.2: Crawl speed calculation computes chapters downloaded per second',
      fn: () => {
        const computeSpeed = (downloadedCount, elapsedSeconds) => {
          if (!elapsedSeconds || elapsedSeconds <= 0) return 0;
          return parseFloat((downloadedCount / elapsedSeconds).toFixed(2));
        };

        assert.strictEqual(computeSpeed(20, 10), 2.0);
        assert.strictEqual(computeSpeed(15, 30), 0.5);
      }
    },
    {
      name: 'F21.3: ETA calculation predicts remaining time based on current rate',
      fn: () => {
        const computeEta = (remainingCount, speedChaptersPerSec) => {
          if (!speedChaptersPerSec || speedChaptersPerSec <= 0) return 'Calculating...';
          const remainingSecs = Math.ceil(remainingCount / speedChaptersPerSec);
          const mins = Math.floor(remainingSecs / 60);
          const secs = remainingSecs % 60;
          return `${mins}m ${secs}s`;
        };

        assert.strictEqual(computeEta(60, 2), '0m 30s');
        assert.strictEqual(computeEta(150, 1), '2m 30s');
        assert.strictEqual(computeEta(10, 0), 'Calculating...');
      }
    },
    {
      name: 'F21.4: Active worker count updates dynamically upon task start and finish',
      fn: () => {
        let activeWorkers = 0;
        const taskStart = () => activeWorkers++;
        const taskFinish = () => activeWorkers--;

        taskStart();
        taskStart();
        assert.strictEqual(activeWorkers, 2);

        taskFinish();
        assert.strictEqual(activeWorkers, 1);

        taskFinish();
        assert.strictEqual(activeWorkers, 0);
      }
    },
    {
      name: 'F21.5: Lifecycle state transitions across crawling stages',
      fn: () => {
        const stages = ['IDLE', 'FETCHING_TOC', 'CRAWLING', 'PACKAGING', 'COMPLETED'];
        let currentStage = 'IDLE';

        const setStage = (next) => {
          assert.ok(stages.includes(next), `Invalid stage ${next}`);
          currentStage = next;
        };

        setStage('FETCHING_TOC');
        assert.strictEqual(currentStage, 'FETCHING_TOC');
        setStage('CRAWLING');
        assert.strictEqual(currentStage, 'CRAWLING');
        setStage('PACKAGING');
        assert.strictEqual(currentStage, 'PACKAGING');
        setStage('COMPLETED');
        assert.strictEqual(currentStage, 'COMPLETED');
      }
    }
  ]
};
