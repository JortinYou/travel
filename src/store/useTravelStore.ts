import { create } from 'zustand';
import type { Trip, DayPlan, PlaceWithRoute, RouteInfo, TransportBooking, Expense, PackingItem, AppSettings, ViewMode, PageRoute } from '@/types';
import { koreaTrip } from '@/data/seedData';

const STORAGE_KEY = 'travel_app_data';
const SEED_LOADED_KEY = 'travel_seed_loaded';

function loadFromStorage(): { trips: Trip[]; settings: AppSettings } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      // Return existing data if trips exist, otherwise fall through to seed
      if (data.trips && data.trips.length > 0) return data;
    }
  } catch { /* ignore */ }

  // Auto-load seed data on first visit (or when trips are empty)
  const seedLoaded = localStorage.getItem(SEED_LOADED_KEY);
  if (!seedLoaded) {
    localStorage.setItem(SEED_LOADED_KEY, '1');
    const seedData = { trips: [koreaTrip], settings: defaultSettings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedData));
    return seedData;
  }

  return { trips: [], settings: defaultSettings };
}

function saveToStorage(data: { trips: Trip[]; settings: AppSettings }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const defaultSettings: AppSettings = {
  mapProvider: 'leaflet',
  amapKey: '',
  googleKey: '',
  baiduKey: '',
  defaultCurrency: 'CNY',
};

function generateDays(startDate: string, endDate: string): DayPlan[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days: DayPlan[] = [];
  let index = 1;
  const current = new Date(start);
  while (current <= end) {
    days.push({
      dayIndex: index,
      date: current.toISOString().slice(0, 10),
      places: [],
    });
    current.setDate(current.getDate() + 1);
    index++;
  }
  return days;
}

interface TravelState {
  trips: Trip[];
  settings: AppSettings;
  currentTripId: string | null;
  currentPage: PageRoute;
  currentDayIndex: number;
  viewMode: ViewMode;

  // Trip CRUD
  addTrip: (trip: Omit<Trip, 'id' | 'days' | 'transports' | 'expenses' | 'packingItems'>) => string;
  updateTrip: (id: string, data: Partial<Trip>) => void;
  deleteTrip: (id: string) => void;
  setCurrentTrip: (id: string | null) => void;

  // Day operations
  setCurrentDay: (index: number) => void;
  addPlace: (tripId: string, dayIndex: number, place: PlaceWithRoute) => void;
  updatePlace: (tripId: string, dayIndex: number, placeId: string, data: Partial<PlaceWithRoute>) => void;
  removePlace: (tripId: string, dayIndex: number, placeId: string) => void;
  reorderPlaces: (tripId: string, dayIndex: number, fromIndex: number, toIndex: number) => void;

  // Transport
  addTransport: (tripId: string, transport: TransportBooking) => void;
  updateTransport: (tripId: string, transportId: string, data: Partial<TransportBooking>) => void;
  removeTransport: (tripId: string, transportId: string) => void;

  // Expense
  addExpense: (tripId: string, expense: Expense) => void;
  updateExpense: (tripId: string, expenseId: string, data: Partial<Expense>) => void;
  removeExpense: (tripId: string, expenseId: string) => void;

  // Packing
  addPackingItem: (tripId: string, item: PackingItem) => void;
  togglePacked: (tripId: string, itemId: string) => void;
  removePackingItem: (tripId: string, itemId: string) => void;

  // Navigation
  setPage: (page: PageRoute) => void;
  setViewMode: (mode: ViewMode) => void;

  // Settings
  updateSettings: (settings: Partial<AppSettings>) => void;

  // Weather
  setDayWeather: (tripId: string, dayIndex: number, weather: DayPlan['weather']) => void;

  // Route between places
  setRouteInfo: (tripId: string, dayIndex: number, placeId: string, route: RouteInfo | undefined) => void;

  // Export/Import
  exportData: () => { trips: Trip[]; settings: AppSettings };
  importData: (data: { trips: Trip[]; settings: AppSettings }) => void;
  clearAll: () => void;
}

export const useTravelStore = create<TravelState>((set, get) => {
  const initial = loadFromStorage();

  const persist = (data: { trips: Trip[]; settings: AppSettings }) => {
    saveToStorage(data);
  };

  const getUpdated = () => {
    const state = get();
    return { trips: state.trips, settings: state.settings };
  };

  return {
    ...initial,
    currentTripId: null,
    currentPage: 'trips',
    currentDayIndex: 1,
    viewMode: 'timeline',

    addTrip: (tripData) => {
      const id = crypto.randomUUID();
      const days = generateDays(tripData.startDate, tripData.endDate);
      const trip: Trip = {
        ...tripData,
        id,
        days,
        transports: [],
        expenses: [],
        packingItems: [],
      };
      const trips = [...get().trips, trip];
      const settings = get().settings;
      set({ trips, currentTripId: id });
      persist({ trips, settings });
      return id;
    },

    updateTrip: (id, data) => {
      const trips = get().trips.map(t => t.id === id ? { ...t, ...data } : t);
      const settings = get().settings;
      // Re-generate days if dates changed
      if (data.startDate || data.endDate) {
        const trip = trips.find(t => t.id === id);
        if (trip) {
          const newDays = generateDays(trip.startDate, trip.endDate);
          // Merge existing places into new days by date
          const oldDaysMap = new Map(trip.days.map(d => [d.date, d.places]));
          trip.days = newDays.map(d => ({
            ...d,
            places: oldDaysMap.get(d.date) || [],
          }));
        }
      }
      set({ trips: [...trips] });
      persist({ trips, settings });
    },

    deleteTrip: (id) => {
      const trips = get().trips.filter(t => t.id !== id);
      const settings = get().settings;
      const currentTripId = get().currentTripId === id ? null : get().currentTripId;
      set({ trips, currentTripId });
      persist({ trips, settings });
    },

    setCurrentTrip: (id) => set({ currentTripId: id }),

    setCurrentDay: (index) => set({ currentDayIndex: index }),

    addPlace: (tripId, dayIndex, place) => {
      const trips = get().trips.map(t => {
        if (t.id !== tripId) return t;
        return {
          ...t,
          days: t.days.map(d =>
            d.dayIndex === dayIndex
              ? { ...d, places: [...d.places, place] }
              : d
          ),
        };
      });
      const settings = get().settings;
      set({ trips });
      persist({ trips, settings });
    },

    updatePlace: (tripId, dayIndex, placeId, data) => {
      const trips = get().trips.map(t => {
        if (t.id !== tripId) return t;
        return {
          ...t,
          days: t.days.map(d =>
            d.dayIndex === dayIndex
              ? { ...d, places: d.places.map(p => p.id === placeId ? { ...p, ...data } : p) }
              : d
          ),
        };
      });
      const settings = get().settings;
      set({ trips });
      persist({ trips, settings });
    },

    removePlace: (tripId, dayIndex, placeId) => {
      const trips = get().trips.map(t => {
        if (t.id !== tripId) return t;
        return {
          ...t,
          days: t.days.map(d =>
            d.dayIndex === dayIndex
              ? { ...d, places: d.places.filter(p => p.id !== placeId) }
              : d
          ),
        };
      });
      const settings = get().settings;
      set({ trips });
      persist({ trips, settings });
    },

    reorderPlaces: (tripId, dayIndex, fromIndex, toIndex) => {
      const trips = get().trips.map(t => {
        if (t.id !== tripId) return t;
        return {
          ...t,
          days: t.days.map(d => {
            if (d.dayIndex !== dayIndex) return d;
            const places = [...d.places];
            const [moved] = places.splice(fromIndex, 1);
            places.splice(toIndex, 0, moved);
            return { ...d, places };
          }),
        };
      });
      const settings = get().settings;
      set({ trips });
      persist({ trips, settings });
    },

    addTransport: (tripId, transport) => {
      const trips = get().trips.map(t =>
        t.id === tripId ? { ...t, transports: [...t.transports, transport] } : t
      );
      const settings = get().settings;
      set({ trips });
      persist({ trips, settings });
    },

    updateTransport: (tripId, transportId, data) => {
      const trips = get().trips.map(t =>
        t.id === tripId
          ? { ...t, transports: t.transports.map(tr => tr.id === transportId ? { ...tr, ...data } : tr) }
          : t
      );
      const settings = get().settings;
      set({ trips });
      persist({ trips, settings });
    },

    removeTransport: (tripId, transportId) => {
      const trips = get().trips.map(t =>
        t.id === tripId ? { ...t, transports: t.transports.filter(tr => tr.id !== transportId) } : t
      );
      const settings = get().settings;
      set({ trips });
      persist({ trips, settings });
    },

    addExpense: (tripId, expense) => {
      const trips = get().trips.map(t =>
        t.id === tripId ? { ...t, expenses: [...t.expenses, expense] } : t
      );
      const settings = get().settings;
      set({ trips });
      persist({ trips, settings });
    },

    updateExpense: (tripId, expenseId, data) => {
      const trips = get().trips.map(t =>
        t.id === tripId
          ? { ...t, expenses: t.expenses.map(e => e.id === expenseId ? { ...e, ...data } : e) }
          : t
      );
      const settings = get().settings;
      set({ trips });
      persist({ trips, settings });
    },

    removeExpense: (tripId, expenseId) => {
      const trips = get().trips.map(t =>
        t.id === tripId ? { ...t, expenses: t.expenses.filter(e => e.id !== expenseId) } : t
      );
      const settings = get().settings;
      set({ trips });
      persist({ trips, settings });
    },

    addPackingItem: (tripId, item) => {
      const trips = get().trips.map(t =>
        t.id === tripId ? { ...t, packingItems: [...t.packingItems, item] } : t
      );
      const settings = get().settings;
      set({ trips });
      persist({ trips, settings });
    },

    togglePacked: (tripId, itemId) => {
      const trips = get().trips.map(t =>
        t.id === tripId
          ? { ...t, packingItems: t.packingItems.map(p => p.id === itemId ? { ...p, packed: !p.packed } : p) }
          : t
      );
      const settings = get().settings;
      set({ trips });
      persist({ trips, settings });
    },

    removePackingItem: (tripId, itemId) => {
      const trips = get().trips.map(t =>
        t.id === tripId ? { ...t, packingItems: t.packingItems.filter(p => p.id !== itemId) } : t
      );
      const settings = get().settings;
      set({ trips });
      persist({ trips, settings });
    },

    setPage: (page) => set({ currentPage: page }),
    setViewMode: (mode) => set({ viewMode: mode }),

    updateSettings: (newSettings) => {
      const settings = { ...get().settings, ...newSettings };
      const trips = get().trips;
      set({ settings });
      persist({ trips, settings });
    },

    setDayWeather: (tripId, dayIndex, weather) => {
      const trips = get().trips.map(t => {
        if (t.id !== tripId) return t;
        return {
          ...t,
          days: t.days.map(d => d.dayIndex === dayIndex ? { ...d, weather } : d),
        };
      });
      const settings = get().settings;
      set({ trips });
      persist({ trips, settings });
    },

    setRouteInfo: (tripId, dayIndex, placeId, route) => {
      const trips = get().trips.map(t => {
        if (t.id !== tripId) return t;
        return {
          ...t,
          days: t.days.map(d =>
            d.dayIndex === dayIndex
              ? { ...d, places: d.places.map(p => p.id === placeId ? { ...p, transportToNext: route } : p) }
              : d
          ),
        };
      });
      const settings = get().settings;
      set({ trips });
      persist({ trips, settings });
    },

    exportData: () => getUpdated(),

    importData: (data) => {
      const { trips, settings } = data;
      set({ trips, settings });
      persist({ trips, settings });
    },

    clearAll: () => {
      set({ trips: [], settings: defaultSettings, currentTripId: null });
      persist({ trips: [], settings: defaultSettings });
    },
  };
});