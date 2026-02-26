// =============================================================================
// Bulk Import Parsers — CSV and GeoJSON
// =============================================================================

export interface ImportRow {
  name: string;
  lat: number | null;
  lng: number | null;
  description?: string;
  [key: string]: string | number | null | undefined;
}

export type ParseResult =
  | { ok: true; rows: ImportRow[]; warnings: string[] }
  | { ok: false; error: string };

// ── CSV ───────────────────────────────────────────────────────────────────────

const LAT_KEYS  = ['lat', 'latitude', 'latitud', 'y', 'coord_y'];
const LNG_KEYS  = ['lng', 'lon', 'longitude', 'longitud', 'x', 'coord_x'];
const NAME_KEYS = ['name', 'nombre', 'label', 'id', 'ref', 'code', 'codigo'];
const DESC_KEYS = ['description', 'descripcion', 'notes', 'notas', 'obs'];

function detectColumn(headers: string[], candidates: string[]): string | null {
  const h = headers.map(s => s.toLowerCase().trim());
  for (const c of candidates) {
    const idx = h.indexOf(c);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

export function parseCSV(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { ok: false, error: 'El fichero CSV debe tener cabecera y al menos una fila de datos.' };

  // Detect delimiter: comma or semicolon
  const delim = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delim).map(h => h.trim().replace(/^"|"$/g, ''));

  const latCol  = detectColumn(headers, LAT_KEYS);
  const lngCol  = detectColumn(headers, LNG_KEYS);
  const nameCol = detectColumn(headers, NAME_KEYS);
  const descCol = detectColumn(headers, DESC_KEYS);

  if (!latCol || !lngCol) {
    return {
      ok: false,
      error: `No se detectaron columnas de coordenadas. Cabeceras encontradas: ${headers.join(', ')}. Se esperan columnas como: lat, lng, latitude, longitude, x, y.`,
    };
  }

  const rows: ImportRow[] = [];
  const warnings: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cells = line.split(delim).map(c => c.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] ?? ''; });

    const lat = parseFloat(row[latCol]);
    const lng = parseFloat(row[lngCol]);

    if (isNaN(lat) || isNaN(lng)) {
      warnings.push(`Fila ${i + 1}: coordenadas inválidas (lat=${row[latCol]}, lng=${row[lngCol]}) — omitida.`);
      continue;
    }

    const name = nameCol ? (row[nameCol] || `Entidad_${i}`) : `Entidad_${i}`;
    const description = descCol ? row[descCol] : undefined;

    const extra: Record<string, string> = {};
    for (const h of headers) {
      if (h === latCol || h === lngCol || h === nameCol || h === descCol) continue;
      if (row[h]) extra[h] = row[h];
    }

    rows.push({ name, lat, lng, description, ...extra });
  }

  if (rows.length === 0) return { ok: false, error: 'No se encontraron filas válidas con coordenadas.' };
  return { ok: true, rows, warnings };
}

// ── GeoJSON ───────────────────────────────────────────────────────────────────

export function parseGeoJSON(text: string): ParseResult {
  let geojson: any;
  try {
    geojson = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSON inválido. Verifica el formato del fichero.' };
  }

  let features: any[] = [];

  if (geojson.type === 'FeatureCollection') {
    features = geojson.features ?? [];
  } else if (geojson.type === 'Feature') {
    features = [geojson];
  } else if (geojson.type === 'GeometryCollection') {
    return { ok: false, error: 'GeometryCollection no está soportado. Usa FeatureCollection de puntos.' };
  } else {
    // Bare geometry or unknown
    return { ok: false, error: 'El GeoJSON debe ser una FeatureCollection o Feature.' };
  }

  if (features.length === 0) return { ok: false, error: 'La FeatureCollection no contiene features.' };

  const rows: ImportRow[] = [];
  const warnings: string[] = [];

  features.forEach((f: any, i: number) => {
    const geom = f.geometry;
    if (!geom) { warnings.push(`Feature ${i + 1}: sin geometría — omitida.`); return; }

    let lat: number | null = null;
    let lng: number | null = null;

    if (geom.type === 'Point') {
      [lng, lat] = geom.coordinates;
    } else if (geom.type === 'Polygon' || geom.type === 'MultiPoint') {
      // Use centroid of first ring / first point
      const coords: number[][] = geom.type === 'Polygon'
        ? geom.coordinates[0]
        : geom.coordinates;
      const sumLng = coords.reduce((s: number, c: number[]) => s + c[0], 0);
      const sumLat = coords.reduce((s: number, c: number[]) => s + c[1], 0);
      lng = sumLng / coords.length;
      lat = sumLat / coords.length;
      warnings.push(`Feature ${i + 1}: geometría ${geom.type} — se usa el centroide como punto de localización.`);
    } else {
      warnings.push(`Feature ${i + 1}: geometría ${geom.type} no soportada — omitida.`);
      return;
    }

    if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) {
      warnings.push(`Feature ${i + 1}: coordenadas inválidas — omitida.`);
      return;
    }

    const props = f.properties ?? {};
    const name = props.name ?? props.nombre ?? props.label ?? props.id ?? props.ref ?? `Feature_${i + 1}`;
    const description = props.description ?? props.descripcion ?? props.notes ?? undefined;

    const SKIP = new Set(['name', 'nombre', 'label', 'description', 'descripcion', 'notes', 'notas']);
    const extra: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(props)) {
      if (SKIP.has(k) || v === null || v === undefined) continue;
      if (typeof v === 'string' || typeof v === 'number') extra[k] = v;
    }

    rows.push({ name: String(name), lat, lng, description: description ? String(description) : undefined, ...extra });
  });

  if (rows.length === 0) return { ok: false, error: 'No se encontraron features válidas con coordenadas.' };
  return { ok: true, rows, warnings };
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export function parseFile(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) { resolve({ ok: false, error: 'No se pudo leer el fichero.' }); return; }

      const name = file.name.toLowerCase();
      if (name.endsWith('.geojson') || name.endsWith('.json')) {
        resolve(parseGeoJSON(text));
      } else if (name.endsWith('.csv') || name.endsWith('.txt')) {
        resolve(parseCSV(text));
      } else {
        // Try GeoJSON first, then CSV
        const gjResult = parseGeoJSON(text);
        resolve(gjResult.ok ? gjResult : parseCSV(text));
      }
    };
    reader.onerror = () => resolve({ ok: false, error: 'Error leyendo el fichero.' });
    reader.readAsText(file, 'UTF-8');
  });
}
