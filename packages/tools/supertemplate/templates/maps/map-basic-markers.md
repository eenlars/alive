---
name: Interactive Map with Markers
description: Leaflet map with custom markers and popups. Click markers to see location details.
category: components
complexity: 2
files: 4
dependencies:
  - leaflet@^1.9.0
  - react-leaflet@^4.2.0
estimatedTime: 4-5 minutes
estimatedTokens: 20
tags: [leaflet, maps, markers]
requires:
  - React 18+
previewImage: https://terminal.goalive.nl/_images/t/alive.best/o/b3b8acdfe5207a6a/v/orig.webp
enabled: true
---

# Interactive Map with Markers

An interactive Leaflet map with custom markers and popups. Click markers to see location details. Uses vanilla Leaflet with React refs (not react-leaflet, which has React 18 compatibility issues).

## Step-by-Step Implementation

### Step 1: Install Dependencies

```bash
bun add leaflet @types/leaflet
```

### Step 2: Create the Map Component

Create `src/components/InteractiveMap.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in bundled apps
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

export interface Location {
  id: string | number;
  lat: number;
  lon: number;
  name: string;
  description?: string;
}

interface InteractiveMapProps {
  locations: Location[];
  center?: [number, number];
  zoom?: number;
}

export const InteractiveMap = ({
  locations,
  center = [51.505, -0.09],
  zoom = 13,
}: InteractiveMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // Initialize map if not already created
    if (!mapInstanceRef.current) {
      const map = L.map(mapRef.current).setView(center, zoom);

      // Add OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    } else {
      // Update view if map already exists
      mapInstanceRef.current.setView(center, zoom);
    }

    // Clear existing markers
    mapInstanceRef.current.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        mapInstanceRef.current?.removeLayer(layer);
      }
    });

    // Add markers for each location
    locations.forEach((location) => {
      if (mapInstanceRef.current) {
        const marker = L.marker([location.lat, location.lon]);

        const popupContent = `
          <div style="min-width: 200px;">
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: #1f2937;">
              ${location.name}
            </div>
            ${location.description ? `<div style="font-size: 13px; color: #666; line-height: 1.4;">${location.description}</div>` : ''}
          </div>
        `;

        marker.bindPopup(popupContent);
        marker.addTo(mapInstanceRef.current);
      }
    });

    // Cleanup on unmount
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [locations, center, zoom]);

  return (
    <div
      ref={mapRef}
      className="w-full rounded-lg overflow-hidden border border-gray-200"
      style={{ height: '500px' }}
    />
  );
};
```

### Step 3: Use the Map in Your Page

Update `src/pages/Index.tsx`:

```tsx
import { InteractiveMap, type Location } from '../components/InteractiveMap';

const Index = () => {
  // Sample locations
  const locations: Location[] = [
    {
      id: 1,
      lat: 51.5074,
      lon: -0.1278,
      name: 'London',
      description: 'Capital of the United Kingdom',
    },
    {
      id: 2,
      lat: 48.8566,
      lon: 2.3522,
      name: 'Paris',
      description: 'Capital of France',
    },
    {
      id: 3,
      lat: 52.52,
      lon: 13.405,
      name: 'Berlin',
      description: 'Capital of Germany',
    },
  ];

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Interactive Map
          </h1>
          <p className="text-gray-600">
            Click on markers to see location details
          </p>
        </div>

        <InteractiveMap
          locations={locations}
          center={[51.5074, -0.1278]}
          zoom={4}
        />
      </div>
    </div>
  );
};

export default Index;
```

## How It Works

1. **Marker Icon Fix**: Leaflet's default marker icons don't load in bundled apps, so we import the actual PNG files and reconfigure Leaflet to use them.

2. **Map Instance**: Uses `mapInstanceRef` to persist the map instance across re-renders (crucial for performance).

3. **Marker Management**: When locations change, it clears all existing markers and adds new ones.

4. **Popups**: Click any marker to see a popup with the location name and description.

5. **Cleanup**: When the component unmounts, the map instance is properly disposed.

## Customization Examples

### Change Map Tiles (Dark Mode)

```tsx
// Replace the L.tileLayer call with:
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '© OpenStreetMap, © CartoDB',
  maxZoom: 19,
}).addTo(map);
```

### Add Zoom Controls

```tsx
// After creating the map:
L.control.zoom({ position: 'bottomright' }).addTo(map);
```

### Center on a Location

```tsx
const handleCenterOnLocation = (location: Location) => {
  if (mapInstanceRef.current) {
    mapInstanceRef.current.setView([location.lat, location.lon], 15);
  }
};
```

## Important Notes

- **Do NOT use react-leaflet**: It has React 18 compatibility issues. This vanilla Leaflet approach is more reliable.
- **Always import the CSS**: `import 'leaflet/dist/leaflet.css'` is required for the map to render correctly.
- **Set explicit height**: The map container needs a defined height (CSS or inline style).
- **Marker icons**: The icon fix is mandatory for bundled React apps.

Ready to implement this template
