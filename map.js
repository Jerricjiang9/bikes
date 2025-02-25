// Import D3 as an ES module
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiamlhbmdqZXIwMDAiLCJhIjoiY203ZWZ3YjBvMGV1NzJqcHFjdzRqYzQydSJ9.gtE7nysKuBItsNhd3WSDlw';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18 // Maximum allowed zoom
});


map.on('load', async () => {
  // Add Boston Bike Routes
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
  });

  map.addLayer({
    id: 'boston-bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': 'green',
      'line-width': 3,
      'line-opacity': 0.4
    }
  });

  // Add Cambridge Bike Routes
  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
  });

  map.addLayer({
    id: 'cambridge-bike-lanes',
    type: 'line',
    source: 'cambridge_route',
    paint: {
      'line-color': 'green',
      'line-width': 3,
      'line-opacity': 0.4
    }
  });

  // Load Station Data using D3
  let jsonData;
  try {
    const jsonurl = './data/bluebikes-stations.json';
    jsonData = await d3.json(jsonurl);
    console.log('Loaded JSON Data:', jsonData);

    let stations = jsonData.data.stations;
    console.log('Stations Array:', stations);

    // Create a map from alphanumeric station IDs to numeric station IDs
    const stationIdMap = new Map();
    stations.forEach(station => {
      if (station.short_name) {
        stationIdMap.set(station.short_name, station.station_id);
      }
    });

    // Select SVG element for station markers
    const svg = d3.select('#map').select('svg');

    // Helper function to project station coordinates
    function project(d) {
      const lat = parseFloat(d.lat);
      const lon = parseFloat(d.lon);
      if (isNaN(lat) || isNaN(lon)) {
        console.error('Invalid coordinates for station:', d);
        return { x: 0, y: 0 };
      }
      return map.project([lon, lat]);
    }

    // Draw initial circles for each station
    const circles = svg.selectAll('circle')
      .data(stations)
      .enter()
      .append('circle')
      .attr('r', 5)
      .attr('fill', 'steelblue')
      .attr('stroke', 'white')
      .attr('stroke-width', 0.5)
      .attr('opacity', 0.6);

    // Update circle positions on the map
    function updatePositions() {
      circles
        .attr('cx', d => project(d).x)
        .attr('cy', d => project(d).y);
    }

    map.on('viewreset', updatePositions);
    map.on('move', updatePositions);
    map.on('moveend', updatePositions);
    updatePositions();

    // Load traffic data
    let trips;
    try {
      const trafficDataUrl = './data/bluebikes-traffic-2024-03.csv';
      trips = await d3.csv(trafficDataUrl);
      console.log('Loaded Traffic Data:', trips);
    } catch (error) {
      console.error('Failed to fetch traffic data:', error);
      return;
    }

    // Count departures and arrivals using mapped station IDs
    const departures = new Map();
    const arrivals = new Map();

    trips.forEach(trip => {
      const rawStartStationId = String(trip.start_station_id).trim();
      const rawEndStationId = String(trip.end_station_id).trim();

      const startStationId = stationIdMap.get(rawStartStationId);
      const endStationId = stationIdMap.get(rawEndStationId);

      if (!startStationId || !endStationId) {
        console.error('Invalid Trip Data:', trip);
        return;
      }

      departures.set(startStationId, (departures.get(startStationId) || 0) + 1);
      arrivals.set(endStationId, (arrivals.get(endStationId) || 0) + 1);
    });

    console.log('Fixed Departures Count:', Array.from(departures.entries()));
    console.log('Fixed Arrivals Count:', Array.from(arrivals.entries()));

    // Add arrivals, departures, and total traffic to stations
    stations = stations.map(station => {
      let id = String(station.station_id);
      station.departures = departures.get(id) ?? 0;
      station.arrivals = arrivals.get(id) ?? 0;
      station.totalTraffic = station.departures + station.arrivals;
      return station;
    });

    console.log('Updated Station Traffic:', stations.map(s => ({
      id: s.station_id,
      departures: s.departures,
      arrivals: s.arrivals,
      totalTraffic: s.totalTraffic
    })));

    // Calculate the maximum traffic value for scaling
    const maxTraffic = d3.max(stations, d => d.totalTraffic || 1);
    console.log('Max Traffic:', maxTraffic);

    // Define a square root scale for marker size
    const radiusScale = d3.scaleSqrt()
      .domain([0, maxTraffic])
      .range([3, 15]);

    // Resize circles based on traffic and add tooltips
    circles
      .attr('r', d => {
        const traffic = d.totalTraffic || 0;
        const radius = radiusScale(traffic);
        console.log(`Station ID: ${d.station_id}, Traffic: ${traffic}, Radius: ${radius}`);
        return radius;
      })
      .attr('fill', 'steelblue')
      .attr('stroke', 'white')
      .attr('stroke-width', 0.5)
      .attr('fill-opacity', 0.6)
      .each(function (d) {
        // Add tooltip with exact traffic data
        d3.select(this)
          .append('title')
          .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
      });

    console.log('Traffic data applied and circle sizes updated with tooltips.');

  } catch (error) {
    console.error('Error loading JSON:', error);
  }
});

// Select the slider and display elements
const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');

// Global variable for time filter
let timeFilter = -1; // Initial state means no filter applied

// Helper function to format time in HH:MM AM/PM format
function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes); // Set hours and minutes
  return date.toLocaleTimeString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
}

// Function to update time display when the slider moves
function updateTimeDisplay() {
  timeFilter = Number(timeSlider.value); // Get slider value

  if (timeFilter === -1) {
    selectedTime.textContent = 'Any Time'; // Clear time display
  } else {
    selectedTime.textContent = formatTime(timeFilter); // Display formatted time
  }

  // Trigger filtering logic (to be implemented later)
}

// Bind slider input event to update the display in real-time
timeSlider.addEventListener('input', updateTimeDisplay);

// Initialize the display when the page loads
updateTimeDisplay();






