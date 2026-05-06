export const de = {
  // Header
  ichWillFahren: 'Ich will fahren',
  stats: 'Statistik',
  history: 'Verlauf',

  // Filters
  filter: 'Filter',
  clearAll: 'Alle löschen',
  difficulty: 'Schwierigkeit',
  leicht: 'Leicht',
  mittel: 'Mittel',
  schwer: 'Schwer',
  distance: 'Entfernung',
  elevation: 'Höhenmeter',
  duration: 'Dauer',
  loopOnly: 'Nur Schleifen',
  status: 'Status',
  all: 'Alle',
  ridden: 'Gefahren',
  unridden: 'Noch offen',
  searchPlaceholder: 'Strecke suchen…',
  routesCount: '{count} von {total} Strecken',

  // Route detail
  gefahren: 'Gefahren',
  writeReview: 'Bewertung schreiben',
  gpxExport: 'GPX exportieren',
  noDescription: 'Keine Beschreibung verfügbar.',
  surface: 'Untergrund',
  safety: 'Sicherheit',
  equipment: 'Ausrüstung',
  tips: 'Tipps',
  recommendedMonths: 'Beste Monate',
  source: 'Quelle',

  // Ride logging
  datum: 'Datum',
  bike: 'Bike',
  mtb: 'MTB',
  ebike: 'E-Bike',
  gravel: 'Gravel',
  bewertung: 'Bewertung',
  notizen: 'Notizen',
  notizenPlaceholder: 'Optionale Notizen…',
  dauer: 'Dauer (Min.)',
  save: 'Speichern',
  cancel: 'Abbrechen',
  delete: 'Löschen',
  edit: 'Bearbeiten',
  saveEdit: 'Änderungen speichern',

  // Coverage stats
  strecken: 'Strecken',
  kilometer: 'Kilometer',
  hohemeter: 'Höhenmeter',
  ausfahrten: 'Ausfahrten',
  breakdown: 'Nach Schwierigkeit',
  mostRidden: 'Am meisten gefahren',
  lastRide: 'Letzte Fahrt',

  // Ride history
  noRides: 'Noch keine Ausfahrten.',
  noRidesHint: 'Starte eine Strecke und logge deine Fahrt.',
  filterByDate: 'Nach Datum filtern',

  // Suggestion engine
  suggestionTitle: 'Route vorschlagen',
  woStartestDu: 'Wo startest du?',
  mapClickHint: 'Auf die Karte klicken oder Startpunkt wählen',
  woWillstDuAnkommen: 'Wo willst du ankommen? (optional)',
  zuruckZumStart: 'Zurück zum Start',
  timeBudget: 'Zeitbudget',
  schwierigkeit: 'Schwierigkeit',
  beliebig: 'Beliebig',
  neueStrecken: 'Neue Strecken bevorzugen',
  routeVorschlagen: 'Route vorschlagen',
  andererVorschlag: 'Anderer Vorschlag',
  keineRoute: 'Keine Route gefunden.',
  alleBereitsGefahren: 'Alle Strecken in der Nähe bereits gefahren.',
  nearTrailhead: 'Nächster Startpunkt:',
  km: 'km',
  min: 'min',
  neu: 'neu',
  loop: 'Schleife',

  // Settings
  settings: 'Einstellungen',
  exportData: 'Daten exportieren',
  importData: 'Daten importieren',
  exportSuccess: 'Daten exportiert.',
  importSuccess: 'Daten importiert.',
  importError: 'Fehler beim Importieren.',
  tileLayer: 'Kartenansicht',
  gelande: 'Gelände',
  karte: 'Karte',
  satellit: 'Satellit',

  // Map
  difficultyView: 'Schwierigkeit',
  coverageView: 'Entdeckt',
  woBinIch: 'Wo bin ich?',

  // Tile layers
  layerGelande: 'Geländekarte (OpenTopoMap)',
  layerKarte: 'Karte (CartoDB)',
  layerSatellit: 'Satellit (ArcGIS)',

  // Planner
  planungsmodus: 'Planungsmodus',
  wegpunktSetzen: 'Klicke auf einen Weg, um einen Wegpunkt zu setzen.',
  keinWegInDerNaehe: 'Kein Weg in der Nahe.',
  keineVerbindung: 'Keine Verbindung',
  wegpunktEntfernen: 'Wegpunkt entfernen',
  rueckgaengig: 'Ruckgangig',

  // Misc
  loading: 'Laden…',
  error: 'Fehler',
  close: 'Schließen',
  of: 'von',
  hour: 'h',

  // Plans
  plaene: 'Plane',
  speichern: 'Speichern',
  gespeichert: 'Gespeichert',
  bestaetigen: 'Bestatigen',
  planLoeschen: 'Plan loschen',
  planLoeschenConfirm: 'Diesen Plan wirklich loschen?',
  keinPlan: 'Noch keine Plane gespeichert.',
  planName: 'Planname',
  neu: 'neu',
}

export function t(key, vars = {}) {
  let str = de[key] || key
  Object.entries(vars).forEach(([k, v]) => {
    str = str.replace(`{${k}}`, v)
  })
  return str
}