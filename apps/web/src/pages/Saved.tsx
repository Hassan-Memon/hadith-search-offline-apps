import { useState } from 'react';

import { listBookmarks, listHistory } from '@tehqeqat/core';

import { HadithList } from '../components/HadithCard';
import { PageTitle } from '../components/Shell';
import { db } from '../db/client';
import { useQuery } from '../hooks';
import { t } from '../strings';

export function SavedPage() {
  const [tab, setTab] = useState<'bookmarks' | 'history'>('bookmarks');
  const bookmarks = useQuery(() => listBookmarks(db), []);
  const history = useQuery(() => listHistory(db, 50), []);
  const items = tab === 'bookmarks' ? bookmarks.data : history.data;
  return (
    <div className="page">
      <PageTitle title={t.nav.saved} />
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'bookmarks'} onClick={() => setTab('bookmarks')}>
          {t.saved.bookmarks}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')}>
          {t.saved.history}
        </button>
      </div>
      {items && items.length === 0 ? (
        <p className="empty">{tab === 'bookmarks' ? t.saved.noBookmarks : t.saved.noHistory}</p>
      ) : (
        items && <HadithList items={items} />
      )}
    </div>
  );
}
