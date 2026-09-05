import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appTabFromHistoryState,
  createAppHistoryState,
} from '../lib/ui-history.ts';

test('akzeptiert ausschließlich eigene bekannte Tab-Historieneinträge', () => {
  assert.equal(
    appTabFromHistoryState(createAppHistoryState('recipes')),
    'recipes',
  );
  assert.equal(
    appTabFromHistoryState({ mampffred: true, tab: 'admin' }),
    undefined,
  );
  assert.equal(appTabFromHistoryState({ tab: 'recipes' }), undefined);
  assert.equal(appTabFromHistoryState(null), undefined);
});
