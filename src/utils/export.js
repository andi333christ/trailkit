/**
 * export.js — Client-side GPX and KML generation.
 * All coords in [lon, lat] GeoJSON order (GPX uses lon,lat internally).
 */

function xmlEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Generate a GPX string for a single route or merged chain.
 * @param {Object} route - single route object with geometry.coordinates
 * @param {string} name  - route name
 */
export function generateGPX(route, name) {
  const coords = route.geometry?.coordinates || []
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gpx version="1.1" creator="TrailKit" xmlns="http://www.topografix.com/GPX/1/1">`,
    `  <metadata>`,
    `    <name>${xmlEscape(name)}</name>`,
    `    <desc>${xmlEscape(route.description || '')}</desc>`,
    `  </metadata>`,
    `  <trk>`,
    `    <name>${xmlEscape(name)}</name>`,
    `    <type>${xmlEscape(route.type || 'Mountainbiketour')}</type>`,
    ...coords.map(([lon, lat]) => `    <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"></trkpt>`),
    `  </trk>`,
    `</gpx>`,
  ]
  return lines.join('\n')
}

/**
 * Generate a GPX string for a chain of routes.
 * @param {Object[]} routes  - array of route objects
 * @param {string} chainName - name for the whole chain
 */
export function generateChainGPX(routes, chainName) {
  // Merge all coordinates into one track
  const allCoords = []
  for (const r of routes) {
    const coords = r.geometry?.coordinates || []
    if (allCoords.length > 0) {
      const last = allCoords[allCoords.length - 1]
      const first = coords[0]
      if (!first || (last[0] !== first[0] || last[1] !== first[1])) {
        // Connector point — only add if different
        if (first) allCoords.push(first)
      }
    }
    allCoords.push(...coords.slice(1))
  }

  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gpx version="1.1" creator="TrailKit" xmlns="http://www.topografix.com/GPX/1/1">`,
    `  <metadata>`,
    `    <name>${xmlEscape(chainName)}</name>`,
    `  </metadata>`,
    `  <trk>`,
    `    <name>${xmlEscape(chainName)}</name>`,
    `    <type>${routes.length} Strecken</type>`,
    ...allCoords.map(([lon, lat]) => `    <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"></trkpt>`),
    `  </trk>`,
    `</gpx>`,
  ]
  return lines.join('\n')
}

/**
 * Trigger browser download of a text file.
 */
export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadGPX(route, name) {
  downloadFile(generateGPX(route, name), `${name}.gpx`, 'application/gpx+xml')
}

export function downloadChainGPX(routes, chainName) {
  downloadFile(generateChainGPX(routes, chainName), `${chainName}.gpx`, 'application/gpx+xml')
}

/**
 * Generate a KML string for one or more routes.
 */
export function generateKML(routes, filename = 'trailkit-routes') {
  const placemarks = routes.map((route) => {
    const coords = route.geometry?.coordinates || []
    const coordStr = coords.map(([lon, lat]) => `${lon},${lat},0`).join(' ')
    const color = DIFFICULTY_COLOR[route.difficulty] || '#c4943d'
    // KML uses aabbggrr
    const kmlColor = color.replace('#', '').match(/../g)
      ? `${color.slice(7,9)}${color.slice(5,7)}${color.slice(3,5)}${color.slice(1,3)}`
      : 'ff999999'
    return `    <Placemark>
      <name>${xmlEscape(route.title)}</name>
      <description>${xmlEscape(route.description || '')}</description>
      <styleUrl>#${route.difficulty}</styleUrl>
      <LineString><coordinates>${coordStr}</coordinates></LineString>
    </Placemark>`
  })

  const styles = Object.entries(DIFFICULTY_COLOR).map(([diff, color]) => {
    const kmlColor = `${color.slice(7,9)}${color.slice(5,7)}${color.slice(3,5)}${color.slice(1,3)}`
    return `    <Style id="${diff}"><LineStyle><color>${kmlColor}</color><width>4</width></LineStyle></Style>`
  }).join('\n')

  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<kml xmlns="http://www.opengis.net/kml/2.2">`,
    `<Document><name>${xmlEscape(filename)}</name>`,
    styles,
    ...placemarks,
    `</Document></kml>`,
  ]
  return lines.join('\n')
}
/**
 * Generate GPX for a planned path (array of { geometry, source_route_id } segments).
 */
export function generatePathGPX(segments, name) {
  const allCoords = []
  for (let s = 0; s < segments.length; s++) {
    const geom = segments[s].geometry
    if (!geom || geom.length === 0) continue
    if (s === 0) {
      allCoords.push(...geom)
    } else {
      const first = geom[0]
      const last = allCoords[allCoords.length - 1]
      if (last && last[0] === first[0] && last[1] === first[1]) {
        allCoords.push(...geom.slice(1))
      } else {
        allCoords.push(...geom)
      }
    }
  }

  const trkpts = allCoords.map(([lon, lat, ele]) => {
    if (ele !== null && ele !== undefined) {
      return `    <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><ele>${ele.toFixed(1)}</ele></trkpt>`
    }
    return `    <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"></trkpt>`
  })

  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gpx version="1.1" creator="TrailKit" xmlns="http://www.topografix.com/GPX/1/1">`,
    `  <metadata>`,
    `    <name>${xmlEscape(name)}</name>`,
    `  </metadata>`,
    `  <trk>`,
    `    <name>${xmlEscape(name)}</name>`,
    `    <trkseg>`,
    ...trkpts,
    `    </trkseg>`,
    `  </trk>`,
    `</gpx>`,
  ]
  return lines.join('\n')
}

export function downloadPathGPX(segments, name) {
  downloadFile(generatePathGPX(segments, name), `${name}.gpx`, 'application/gpx+xml')
}
