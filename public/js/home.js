// Proposal objective: make the public destination cards engaging without blocking access to their content.
(() => {
  document.querySelectorAll('.destination-image-trigger[data-dialog-target]').forEach(imageTrigger => {
    const imageDialog = document.querySelector(imageTrigger.dataset.dialogTarget);
    const dialogImage = imageDialog?.querySelector('.shoal-dialog-image');
    const closeDialogButton = imageDialog?.querySelector('.shoal-dialog-close');
    if (!imageDialog || !dialogImage || !closeDialogButton) return;

    imageTrigger.addEventListener('click', () => {
      const sourceImage = imageTrigger.querySelector('img');
      if (sourceImage) {
        dialogImage.src = imageTrigger.dataset.fullImage || sourceImage.currentSrc || sourceImage.src;
        dialogImage.alt = sourceImage.alt;
      }
      imageDialog.showModal();
      closeDialogButton.focus();
    });

    closeDialogButton.addEventListener('click', () => imageDialog.close());
    imageDialog.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      imageDialog.close();
    });
    imageDialog.addEventListener('cancel', event => {
      event.preventDefault();
      imageDialog.close();
    });
    imageDialog.addEventListener('click', event => {
      if (event.target === imageDialog) imageDialog.close();
    });
    imageDialog.addEventListener('close', () => imageTrigger.focus());
    imageDialog.querySelectorAll('.shoal-dialog-copy a').forEach(link => {
      link.addEventListener('click', () => imageDialog.close());
    });
  });

  const overviewMapElement = document.querySelector('#shoal-overview-map');
  const overviewMapStatus = document.querySelector('.shoal-overview-map-status');
  const overviewMapFrame = overviewMapElement?.closest('.shoal-map-frame');
  const overviewMapExpand = overviewMapFrame?.querySelector('.shoal-map-expand');
  let overviewMap;
  function setOverviewMapExpanded(expanded) {
    if (!overviewMapFrame || !overviewMapExpand) return;
    overviewMapFrame.classList.toggle('is-map-expanded', expanded);
    document.body.classList.toggle('has-expanded-map', expanded);
    overviewMapExpand.setAttribute('aria-pressed', String(expanded));
    overviewMapExpand.setAttribute('aria-label', expanded ? 'Exit full-screen map' : 'Expand map to fill the screen');
    overviewMapExpand.querySelector('span').textContent = expanded ? 'Close map' : 'Full screen';
    window.requestAnimationFrame(() => {
      if (overviewMap) overviewMap.resize();
    });
  }
  overviewMapExpand?.addEventListener('click', () => {
    setOverviewMapExpanded(overviewMapExpand.getAttribute('aria-pressed') !== 'true');
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && overviewMapFrame?.classList.contains('is-map-expanded')) {
      event.preventDefault();
      event.stopPropagation();
      setOverviewMapExpanded(false);
      overviewMapExpand?.focus();
    }
  }, true);
  if (overviewMapElement) {
    if (!window.L) {
      if (overviewMapStatus) {
        overviewMapStatus.hidden = false;
        overviewMapStatus.textContent = 'The map could not load. Check your internet connection.';
      }
    } else {
      const tabango = [11.3077, 124.3730];
      const shoal = [11.2800, 124.2532];
      overviewMap = window.L.map(overviewMapElement, { scrollWheelZoom: false, attributionControl: false });
      const overviewTiles = window.L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
        maxZoom: 18
      }).addTo(overviewMap);
      overviewMap.fitBounds(window.L.latLngBounds([tabango, shoal]).pad(0.35));
      window.L.marker(tabango).addTo(overviewMap).bindPopup('<strong>Tabango, Leyte</strong><br>Road destination and boat departure area');
      window.L.marker(shoal).addTo(overviewMap).bindPopup('<strong>Kimud Shoal</strong><br>Approximate offshore reference pin');
      window.L.polyline([tabango, shoal], { color: '#c8892b', weight: 3, dashArray: '2 8' }).addTo(overviewMap);
      overviewTiles.on('tileload', () => {
        if (overviewMapStatus) overviewMapStatus.hidden = true;
      });
      overviewTiles.on('tileerror', () => {
        if (!overviewMapStatus) return;
        overviewMapStatus.hidden = false;
        overviewMapStatus.textContent = 'Map tiles are blocked or unavailable on this network. The reference coordinates and directions remain available.';
      });
    }
  }

  const directionsButton = document.querySelector('.shoal-map-directions');
  const directionsDialog = document.querySelector('#shoal-directions-dialog');
  const directionsClose = directionsDialog?.querySelector('.shoal-directions-close');
  const directionsMapElement = directionsDialog?.querySelector('#shoal-directions-map');
  const directionsMapFrame = directionsMapElement?.closest('.shoal-directions-map');
  const directionsMapExpand = directionsMapFrame?.querySelector('.shoal-directions-map-expand');
  const routeButton = directionsDialog?.querySelector('.shoal-directions-route');
  const originSelect = directionsDialog?.querySelector('#directions-origin');
  const directionsStatus = directionsDialog?.querySelector('.shoal-directions-status');
  const turnDirections = directionsDialog?.querySelector('.shoal-turn-directions');
  if (directionsButton && directionsDialog && directionsClose && directionsMapElement && routeButton && originSelect && directionsStatus && turnDirections) {
    const points = {
      tacloban: { label: 'Tacloban Airport', coordinates: [11.2276, 125.0278] },
      ormoc: { label: 'Ormoc City', coordinates: [11.0064, 124.6075] },
      tabango: { label: 'Tabango', coordinates: [11.3077, 124.3730] },
      shoal: { label: 'Kimud Shoal (approximate)', coordinates: [11.2800, 124.2532] }
    };
    let directionsMap = null;
    let routeLayers = null;
    let locationMarkers = null;
    let routeOriginMarker = null;
    let mapSelectedOrigin = null;

    const setDirectionsMapExpanded = expanded => {
      if (!directionsMapFrame || !directionsMapExpand) return;
      directionsMapFrame.classList.toggle('is-map-expanded', expanded);
      directionsMapExpand.setAttribute('aria-pressed', String(expanded));
      directionsMapExpand.setAttribute('aria-label', expanded
        ? 'Exit full-screen directions map'
        : 'Expand directions map to fill the screen');
      directionsMapExpand.querySelector('span').textContent = expanded ? 'Close map' : 'Full screen';
      window.requestAnimationFrame(() => directionsMap?.invalidateSize());
    };

    directionsMapExpand?.addEventListener('click', () => {
      setDirectionsMapExpanded(!directionsMapFrame.classList.contains('is-map-expanded'));
    });

    const setDirectionsStatus = (message, isError = false) => {
      directionsStatus.textContent = message;
      directionsStatus.classList.toggle('is-error', isError);
    };

    const initializeDirectionsMap = () => {
      if (directionsMap) {
        window.setTimeout(() => directionsMap.invalidateSize(), 100);
        return true;
      }
      if (!window.L) {
        setDirectionsStatus('The interactive map library did not load. Check your internet connection and try again.', true);
        return false;
      }

      directionsMap = window.L.map(directionsMapElement, { scrollWheelZoom: false, attributionControl: false });
      const baseTiles = window.L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
        maxZoom: 18
      }).addTo(directionsMap);
      let tileErrorShown = false;
      baseTiles.on('tileerror', () => {
        if (tileErrorShown) return;
        tileErrorShown = true;
        setDirectionsStatus('Map tiles could not be loaded. Check your internet connection or network restrictions. You can still choose a listed starting point for directions.', true);
      });
      routeLayers = window.L.layerGroup().addTo(directionsMap);
      locationMarkers = window.L.layerGroup().addTo(directionsMap);
      new window.L.marker(points.tabango.coordinates).addTo(locationMarkers)
        .bindPopup('<strong>Tabango, Leyte</strong><br>Road destination and boat departure area');
      new window.L.marker(points.shoal.coordinates).addTo(locationMarkers)
        .bindPopup('<strong>Kimud Shoal</strong><br>Approximate offshore reference pin');
      directionsMap.fitBounds(window.L.latLngBounds([points.tabango.coordinates, points.shoal.coordinates]).pad(0.35));
      directionsMap.on('click', event => {
        mapSelectedOrigin = {
          label: 'Selected map point',
          coordinates: [event.latlng.lat, event.latlng.lng]
        };
        const mapOption = originSelect.querySelector('option[value="map"]');
        mapOption.hidden = false;
        mapOption.disabled = false;
        originSelect.value = 'map';
        setDirectionsStatus('Map starting point selected. Choose “Get directions” to route from this point on land.');
      });
      window.setTimeout(() => directionsMap.invalidateSize(), 100);
      return true;
    };

    const formatDistance = meters => meters >= 1000
      ? `${(meters / 1000).toFixed(1)} km`
      : `${Math.round(meters)} m`;

    const formatDuration = seconds => {
      const minutes = Math.round(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return hours ? `${hours} hr ${remainingMinutes} min` : `${minutes} min`;
    };

    const describeManeuver = step => {
      const type = step.maneuver?.type || 'Continue';
      const modifier = step.maneuver?.modifier ? ` ${step.maneuver.modifier}` : '';
      const roadName = step.name ? ` onto ${step.name}` : '';
      if (type === 'depart') return `Start${roadName}`;
      if (type === 'arrive') return 'Arrive in Tabango';
      return `${type.replaceAll('_', ' ')}${modifier}${roadName}`;
    };

    const getCurrentLocation = () => new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('This browser does not support location access. Choose a listed starting point or tap the map.'));
        return;
      }

      let watchId;
      let refinementTimer;
      let bestPosition = null;
      let completed = false;
      const finish = (error = null) => {
        if (completed) return;
        completed = true;
        window.clearTimeout(refinementTimer);
        if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
        if (bestPosition) {
          resolve({
            label: 'Your current location',
            coordinates: [bestPosition.coords.latitude, bestPosition.coords.longitude],
            accuracy: bestPosition.coords.accuracy
          });
          return;
        }
        const messages = {
          1: 'Location permission is blocked. On Android, close floating bubbles or overlays, then enable Location for this site in browser settings. You can also choose Tacloban or Ormoc.',
          2: 'Your location is currently unavailable. Try again or choose another starting point.',
          3: 'Finding your location timed out. Try again or choose another starting point.'
        };
        reject(new Error(messages[error?.code] || 'Unable to get your location. Choose another starting point.'));
      };
      try {
        refinementTimer = window.setTimeout(() => finish({ code: 3 }), 12000);
        watchId = navigator.geolocation.watchPosition(position => {
          if (!Number.isFinite(position.coords.accuracy) ||
              !Number.isFinite(position.coords.latitude) ||
              !Number.isFinite(position.coords.longitude)) return;
          if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) {
            bestPosition = position;
            setDirectionsStatus(`Improving GPS fix… current reported accuracy is ±${formatDistance(position.coords.accuracy)}.`);
          }
          if (position.coords.accuracy <= 15) finish();
        }, error => {
          if (error.code === 1 || !bestPosition) finish(error);
          else finish();
        }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
      } catch (error) {
        finish(error);
      }
    });

    const showRoadRoute = async () => {
      if (!initializeDirectionsMap()) return;
      routeButton.disabled = true;
      turnDirections.replaceChildren();
      routeLayers.clearLayers();
      if (routeOriginMarker) {
        routeOriginMarker.remove();
        routeOriginMarker = null;
      }
      let origin = mapSelectedOrigin || points[originSelect.value];

      try {
        if (originSelect.value === 'current') {
          setDirectionsStatus('Finding your most accurate current location. Keep location services enabled; your browser may ask for permission…');
          origin = await getCurrentLocation();
        }
        if (!origin) throw new Error('Choose a starting point or tap the map.');
        const accuracyProgress = Number.isFinite(origin.accuracy)
          ? ` (GPS accuracy ±${formatDistance(origin.accuracy)})`
          : '';
        setDirectionsStatus(`Finding the road route from ${origin.label}${accuracyProgress} to Tabango…`);
        const [originLat, originLon] = origin.coordinates;
        const [destinationLat, destinationLon] = points.tabango.coordinates;
        const routeUrl = `https://router.project-osrm.org/route/v1/driving/${originLon},${originLat};${destinationLon},${destinationLat}?overview=full&steps=true&geometries=geojson`;
        const response = await fetch(routeUrl);
        if (!response.ok) throw new Error(`Routing service returned HTTP ${response.status}.`);
        const result = await response.json();
        const route = result.routes?.[0];
        if (result.code !== 'Ok' || !route) throw new Error('No driving route was returned for this starting point.');

        const roadCoordinates = route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]);
        window.L.polyline(roadCoordinates, { color: '#088395', weight: 5, opacity: .9 }).addTo(routeLayers);
        window.L.polyline([points.tabango.coordinates, points.shoal.coordinates], {
          color: '#f3a91c',
          weight: 4,
          opacity: .95,
          dashArray: '7 9'
        }).addTo(routeLayers);
        if (Number.isFinite(origin.accuracy)) {
          window.L.circle(origin.coordinates, {
            radius: origin.accuracy,
            color: '#006477',
            weight: 2,
            opacity: .8,
            fillColor: '#088395',
            fillOpacity: .16
          }).addTo(routeLayers);
        }
        routeOriginMarker = window.L.marker(origin.coordinates).addTo(directionsMap)
          .bindPopup(`<strong>${origin.label}</strong><br>Route starts here`);
        directionsMap.fitBounds(window.L.latLngBounds([...roadCoordinates, points.shoal.coordinates]).pad(0.12));

        const routeSummary = document.createElement('li');
        const accuracyNote = Number.isFinite(origin.accuracy)
          ? ` GPS accuracy ±${formatDistance(origin.accuracy)}.`
          : '';
        routeSummary.textContent = `Road route: ${formatDistance(route.distance)} · about ${formatDuration(route.duration)} from ${origin.label} to Tabango.${accuracyNote}`;
        turnDirections.append(routeSummary);
        route.legs?.flatMap(leg => leg.steps || []).forEach(step => {
          const item = document.createElement('li');
          item.textContent = `${describeManeuver(step)} (${formatDistance(step.distance)})`;
          turnDirections.append(item);
        });
        const boatLeg = document.createElement('li');
        boatLeg.className = 'boat-leg';
        boatLeg.textContent = 'Boat leg: continue from Tabango toward the shoal with your licensed operator. The dashed line is an approximate offshore guide, not a navigable marine route.';
        turnDirections.append(boatLeg);
        setDirectionsStatus(`Road route shown from ${origin.label} to Tabango. The final boat leg is approximate; confirm departure details with your operator.`);
      } catch (error) {
        setDirectionsStatus(`${error.message}${error.message.includes('permission') || error.message.includes('location') || error.message.includes('Location') ? '' : ' Check your internet connection and try again.'}`, true);
      } finally {
        routeButton.disabled = false;
      }
    };

    directionsButton.addEventListener('click', () => {
      directionsDialog.showModal();
      directionsClose.focus();
      if (initializeDirectionsMap()) setDirectionsStatus('Allow location access to route from where you are, or choose a starting point. You can also tap the map.');
    });
    routeButton.addEventListener('click', showRoadRoute);
    originSelect.addEventListener('change', () => {
      mapSelectedOrigin = null;
      if (directionsMap && initializeDirectionsMap()) {
        const origin = points[originSelect.value];
        setDirectionsStatus(origin
          ? `Ready to show the road route from ${origin.label}.`
          : 'Your current location will be requested when you choose “Get directions.”');
      }
    });
    directionsClose.addEventListener('click', () => directionsDialog.close());
    directionsDialog.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (directionsMapFrame?.classList.contains('is-map-expanded')) {
        setDirectionsMapExpanded(false);
        directionsMapExpand?.focus();
        return;
      }
      directionsDialog.close();
    });
    directionsDialog.addEventListener('cancel', event => {
      event.preventDefault();
      if (directionsMapFrame?.classList.contains('is-map-expanded')) {
        setDirectionsMapExpanded(false);
        directionsMapExpand?.focus();
        return;
      }
      directionsDialog.close();
    });
    directionsDialog.addEventListener('click', event => {
      if (event.target === directionsDialog) directionsDialog.close();
    });
    directionsDialog.addEventListener('close', () => {
      setDirectionsMapExpanded(false);
      directionsButton.focus();
    });
  }

  const rail = document.querySelector('.shoal-gallery-rail');
  if (rail) {
    const initialOrder = Array.from(rail.children);
    const heroBackgrounds = Array.from(document.querySelectorAll('.shoal-hero-backdrop-image'));
    let activeBackgroundIndex = -1;
    let galleryLayerTimeout;

    const showImage = selectedTab => {
      Array.from(rail.children).forEach(tab => {
        tab.setAttribute('aria-pressed', String(tab === selectedTab));
      });
      document.querySelector('.travel-hero')?.classList.add('has-selected-background');
      const background = selectedTab.dataset.background;
      const nextBackgroundIndex = activeBackgroundIndex === 0 ? 1 : 0;
      const nextBackground = heroBackgrounds[nextBackgroundIndex];
      if (background && nextBackground) {
        nextBackground.style.backgroundImage = `url(${JSON.stringify(background)})`;
        nextBackground.classList.add('is-active');
        if (activeBackgroundIndex >= 0) heroBackgrounds[activeBackgroundIndex].classList.remove('is-active');
        activeBackgroundIndex = nextBackgroundIndex;
      }
    };

    const updateOrder = (currentOrder, nextOrder, foregroundTab) => {
      const positions = new Map(currentOrder.map(tab => [tab, tab.getBoundingClientRect().left]));
      rail.replaceChildren(...nextOrder);
      window.clearTimeout(galleryLayerTimeout);
      nextOrder.forEach(tab => {
        tab.classList.toggle('is-gallery-foreground', tab === foregroundTab);
        tab.classList.toggle('is-gallery-transitioning', tab !== foregroundTab);
      });

      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduceMotion) {
        nextOrder.forEach(tab => {
          const distance = positions.get(tab) - tab.getBoundingClientRect().left;
          if (distance === 0) return;
          tab.animate(
            [{ transform: `translateX(${distance}px)` }, { transform: 'translateX(0)' }],
            { duration: 1300, easing: 'cubic-bezier(.22,1,.36,1)' }
          );
        });
        galleryLayerTimeout = window.setTimeout(() => {
          nextOrder.forEach(tab => tab.classList.remove('is-gallery-foreground', 'is-gallery-transitioning'));
        }, 1300);
      } else {
        nextOrder.forEach(tab => tab.classList.remove('is-gallery-foreground', 'is-gallery-transitioning'));
      }

      const nextActiveTab = nextOrder[0];
      showImage(nextActiveTab);
      return nextActiveTab;
    };

    const moveImageToFront = selectedTab => {
      const currentOrder = Array.from(rail.children);
      if (currentOrder.length < 2 || currentOrder[0] === selectedTab) return currentOrder[0];
      const selectedIndex = currentOrder.indexOf(selectedTab);
      const nextOrder = currentOrder.slice(selectedIndex).concat(currentOrder.slice(0, selectedIndex));
      return updateOrder(currentOrder, nextOrder);
    };

    const moveImageToBack = selectedTab => {
      const currentOrder = Array.from(rail.children);
      if (currentOrder.length < 2 || !currentOrder.includes(selectedTab)) return currentOrder[0];
      const nextOrder = currentOrder.filter(tab => tab !== selectedTab).concat(selectedTab);
      return updateOrder(currentOrder, nextOrder, selectedTab);
    };

    Array.from(rail.children).forEach(tab => {
      tab.addEventListener('click', () => {
        moveImageToBack(tab)?.focus();
      });
      tab.addEventListener('keydown', event => {
        const order = Array.from(rail.children);
        let nextTab;
        if (event.key === 'ArrowRight') nextTab = order[1];
        else if (event.key === 'ArrowLeft') nextTab = order[order.length - 1];
        else if (event.key === 'Home') nextTab = initialOrder[0];
        else if (event.key === 'End') nextTab = initialOrder[initialOrder.length - 1];
        else return;
        event.preventDefault();
        moveImageToFront(nextTab)?.focus();
      });
    });

    const selectedTab = rail.querySelector('[aria-pressed="true"]') || rail.firstElementChild;
    if (selectedTab) showImage(selectedTab);
  }

  const cards = document.querySelectorAll('.travel-home .destination-card');
  if (!cards.length) return;

  cards.forEach((card, cardIndex) => {
    card.querySelectorAll('svg.ico path').forEach(path => {
      const length = Math.ceil(path.getTotalLength());
      path.style.setProperty('--path-length', length);
      path.style.animationDelay = `${cardIndex * 90}ms`;
    });
  });

  if (!('IntersectionObserver' in window)) {
    cards.forEach(card => card.classList.add('is-in-view'));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in-view');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.4 });

  cards.forEach(card => observer.observe(card));
})();
