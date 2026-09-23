import AppShell from '@/components/AppShell';
import { useTravelStore } from '@/store/useTravelStore';
import TripList from '@/pages/TripList';
import ItineraryPlanner from '@/pages/ItineraryPlanner';
import TransportManager from '@/pages/TransportManager';
import FinanceTracker from '@/pages/FinanceTracker';
import PackingList from '@/pages/PackingList';
import Settings from '@/pages/Settings';

const PAGES = {
  trips: TripList,
  itinerary: ItineraryPlanner,
  transports: TransportManager,
  finance: FinanceTracker,
  packing: PackingList,
  settings: Settings,
} as const;

function App() {
  const currentPage = useTravelStore((s) => s.currentPage);
  const Page = PAGES[currentPage] ?? TripList;

  return (
    <AppShell>
      <div key={currentPage} className="animate-fade-in h-full">
        <Page />
      </div>
    </AppShell>
  );
}

export default App;
