import clsx from 'clsx';
import { useStore } from '../../store/useStore';
import { EmptyPane } from './EmptyPane';
import { NoteView } from './NoteView';
import { TabStrip } from './TabStrip';

interface PaneProps {
  paneId: string;
  tabs: string[];
  activeTab: string | null;
  active: boolean;
}

export function Pane({ paneId, tabs, activeTab, active }: PaneProps) {
  const setActivePane = useStore((state) => state.setActivePane);

  return (
    <section
      className={clsx('pane', active && 'is-active')}
      aria-label="Editor pane"
      onMouseDown={() => setActivePane(paneId)}
      onFocusCapture={() => setActivePane(paneId)}
    >
      <TabStrip paneId={paneId} tabs={tabs} activeTab={activeTab} />
      {activeTab ? <NoteView paneId={paneId} path={activeTab} /> : <EmptyPane />}
    </section>
  );
}
