const giftList = (() => {
  const view = document.querySelector('#gifts');
  const grid = document.querySelector('#gift-grid');
  const template = document.querySelector('#gift-card-template');
  const summary = document.querySelector('#gift-summary');
  const syncStatus = document.querySelector('#gift-sync');
  const refreshButton = document.querySelector('#gift-refresh');
  const loadError = document.querySelector('#gift-load-error');
  const empty = document.querySelector('#gift-empty');
  const selectionNotice = document.querySelector('#gift-selection-notice');
  const form = document.querySelector('#gift-claim-form');
  const fields = document.querySelector('#gift-claim-fields');
  const firstName = document.querySelector('#gift-first-name');
  const submit = document.querySelector('#gift-claim-submit');
  const count = document.querySelector('#gift-selection-count');
  const selectedList = document.querySelector('#gift-selected-list');
  const claimError = document.querySelector('#gift-claim-error');
  const confirmation = document.querySelector('#gift-confirmation');
  const progress = document.querySelector('#gift-claim-progress');
  const selected = new Set();
  const cards = new Map();
  const pollInterval = 15000;
  const sdkUrl = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js';
  const sdkIntegrity = 'sha384-uteMfOloLDGt042uDz+xHGF3ym63/WQ6rFq7murQRG8Ih7QrXGEGNtWd8688sb4O';
  let items = new Map();
  let active = false;
  let available = false;
  let submitting = false;
  let refreshPromise = null;
  let refreshQueued = false;
  let revision = 0;
  let pollTimer = 0;
  let client = null;
  let connecting = false;
  let realtimeReady = false;

  class GiftRequestError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  }

  async function request(path, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${giftConfig.url}/rest/v1/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          apikey: giftConfig.publishableKey,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: 'no-store'
      });
      if (!response.ok) {
        const detail = response.headers.get('content-type')?.includes('application/json')
          ? await response.json() : null;
        throw new GiftRequestError(`Gift request failed (HTTP ${response.status}).`, detail?.code);
      }
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  function validateRows(rows) {
    if (!Array.isArray(rows)) throw new Error('The gift service returned an invalid list.');
    const ids = new Set();
    for (const item of rows) {
      if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)
        || typeof item.title !== 'string' || !item.title.trim()
        || typeof item.description !== 'string'
        || !Number.isInteger(item.sort_order) || !Array.isArray(item.product_links)) {
        throw new Error('The gift service returned an invalid gift.');
      }
      ids.add(item.id);
      const unclaimed = item.claimed_first_name === null && item.claimed_at === null;
      const claimed = typeof item.claimed_first_name === 'string'
        && item.claimed_first_name.trim().length > 0
        && [...item.claimed_first_name].length <= 40
        && typeof item.claimed_at === 'string' && Number.isFinite(Date.parse(item.claimed_at));
      if (!unclaimed && !claimed) throw new Error('A gift has an invalid claim status.');
      for (const link of item.product_links) {
        if (!link || typeof link.label !== 'string' || !link.label.trim() || typeof link.url !== 'string') {
          throw new Error('A gift has an invalid shop link.');
        }
        const url = new URL(link.url);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Gift shop links must use HTTPS.');
      }
    }
    return rows;
  }

  function updateSyncStatus() {
    syncStatus.textContent = !navigator.onLine ? 'Offline'
      : !available ? 'Availability not confirmed'
      : realtimeReady ? 'Live availability'
      : 'Availability refreshes every 15 seconds';
  }

  function updateSelection() {
    const selection = [...selected].map(id => items.get(id)).filter(Boolean);
    count.textContent = selection.length
      ? `${selection.length} ${selection.length === 1 ? 'gift' : 'gifts'} selected.`
      : 'Choose a gift above to get started.';
    selectedList.replaceChildren(...selection.map(item => {
      const entry = document.createElement('li');
      entry.textContent = item.title;
      return entry;
    }));
    fields.disabled = submitting || !available;
    submit.disabled = submitting || !available || selection.length === 0;
    submit.firstChild.textContent = submitting ? 'Saving your gifts...' : 'Confirm my gifts ';
    refreshButton.disabled = submitting || !!refreshPromise;
    for (const [id, card] of cards) {
      const claimed = items.get(id)?.claimed_first_name !== null;
      const checkbox = card.querySelector('input');
      checkbox.checked = selected.has(id);
      checkbox.disabled = claimed || submitting || !available;
      card.classList.toggle('is-selected', selected.has(id));
    }
  }

  function renderPhotos(card, item) {
    const container = card.querySelector('.gift-images');
    const signature = JSON.stringify(item.product_links);
    if (container.dataset.links === signature) return;
    container.dataset.links = signature;
    container.classList.toggle('is-bundle', item.product_links.length > 1);
    const photos = item.product_links.map(link => {
      const figure = document.createElement('figure');
      const photo = giftConfig.productPhotos[link.url];
      const error = document.createElement('p');
      error.className = 'gift-photo-error';
      error.textContent = 'Photo unavailable. Use the shop link below to see this item.';
      error.hidden = true;
      if (photo) {
        const image = document.createElement('img');
        image.className = 'gift-product-photo';
        image.alt = photo.alt;
        image.width = 800;
        image.height = 800;
        image.loading = 'lazy';
        image.decoding = 'async';
        image.addEventListener('error', () => {
          image.hidden = true;
          error.hidden = false;
          console.error('Gift product photo could not load:', item.id, photo.src);
        });
        image.src = photo.src;
        figure.append(image);
      } else {
        error.hidden = false;
        console.warn('A product photo has not been configured for:', item.id, link.url);
      }
      figure.append(error);
      if (item.product_links.length > 1) {
        const caption = document.createElement('figcaption');
        caption.textContent = link.label;
        figure.append(caption);
      }
      return figure;
    });
    if (!photos.length) {
      const message = document.createElement('p');
      message.className = 'gift-photo-error';
      message.textContent = 'Photo not yet added.';
      photos.push(message);
      console.warn('A gift has no product links or product photos:', item.id);
    }
    container.replaceChildren(...photos);
  }

  function render(rows) {
    items = new Map(rows.map(item => [item.id, item]));
    const removed = [...selected].filter(id => !items.has(id) || items.get(id).claimed_first_name !== null);
    removed.forEach(id => selected.delete(id));
    if (removed.length) {
      selectionNotice.textContent = 'A selected gift is no longer available and was removed from your selection. Please review the remaining gifts.';
    }
    for (const [id, card] of cards) {
      if (!items.has(id)) { card.remove(); cards.delete(id); }
    }
    rows.forEach((item, index) => {
      let card = cards.get(item.id);
      if (!card) {
        card = template.content.firstElementChild.cloneNode(true);
        card.dataset.giftId = item.id;
        const checkbox = card.querySelector('input');
        checkbox.setAttribute('aria-label', `Choose ${item.title}`);
        checkbox.addEventListener('change', () => {
          if (!available || submitting || items.get(item.id)?.claimed_first_name !== null) {
            checkbox.checked = false;
            selectionNotice.textContent = 'This gift is not available to select. Refresh the list to check its status.';
            return;
          }
          if (checkbox.checked) selected.add(item.id);
          else selected.delete(item.id);
          selectionNotice.textContent = '';
          updateSelection();
        });
        cards.set(item.id, card);
      }
      renderPhotos(card, item);
      card.querySelector('.gift-title').textContent = item.title;
      card.querySelector('.gift-description').textContent = item.description;
      card.querySelector('input').setAttribute('aria-label', `Choose ${item.title}`);
      const links = card.querySelector('.gift-shop-links');
      if (links.dataset.links !== JSON.stringify(item.product_links)) {
        links.replaceChildren(...item.product_links.map(link => {
          const anchor = document.createElement('a');
          anchor.href = link.url;
          anchor.textContent = `${link.label} ↗`;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          anchor.setAttribute('aria-label', `${link.label} for ${item.title} (opens in a new tab)`);
          return anchor;
        }));
        links.dataset.links = JSON.stringify(item.product_links);
      }
      const claimed = item.claimed_first_name !== null;
      card.classList.toggle('is-claimed', claimed);
      card.querySelector('.gift-claimed-stamp').hidden = !claimed;
      card.querySelector('.gift-availability').textContent = claimed ? `Claimed by ${item.claimed_first_name}` : 'Available';
      card.querySelector('.gift-select-label').textContent = claimed ? 'Already claimed' : "I'd like to bring this";
      if (grid.children[index] !== card) grid.insertBefore(card, grid.children[index] || null);
    });
    const remaining = rows.filter(item => item.claimed_first_name === null).length;
    summary.textContent = `${remaining} of ${rows.length} gifts available`;
    empty.hidden = rows.length > 0;
    updateSelection();
  }

  async function refresh() {
    if (refreshPromise) {
      refreshQueued = true;
      return refreshPromise;
    }
    const version = revision;
    grid.setAttribute('aria-busy', 'true');
    refreshPromise = (async () => {
      try {
        const rows = validateRows(await request('gift_items?select=id,title,description,product_links,sort_order,claimed_first_name,claimed_at&order=sort_order.asc,id.asc'));
        if (version !== revision) { refreshQueued = true; return; }
        available = true;
        loadError.hidden = true;
        render(rows);
      } catch (error) {
        available = false;
        loadError.textContent = error.code === 'PGRST205'
          ? 'The shared gift list has not been set up yet. Please contact the host.'
          : 'We could not refresh gift availability. Your choices are still here, but claiming is paused. Check your connection and use Refresh availability.';
        loadError.hidden = false;
        console.error('Gift availability could not be refreshed:', error);
      } finally {
        grid.setAttribute('aria-busy', 'false');
        updateSyncStatus();
      }
    })();
    updateSelection();
    await refreshPromise;
    refreshPromise = null;
    updateSelection();
    if (refreshQueued) {
      refreshQueued = false;
      if (active && !document.hidden) return refresh();
    }
  }

  function loadSdk() {
    if (window.supabase?.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => {
        script.remove();
        reject(new Error('The live-update library took too long to load.'));
      }, 12000);
      script.src = sdkUrl;
      script.integrity = sdkIntegrity;
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        clearTimeout(timeout);
        if (window.supabase?.createClient) resolve();
        else reject(new Error('The live-update library is unavailable.'));
      };
      script.onerror = () => {
        clearTimeout(timeout);
        script.remove();
        reject(new Error('The live-update library could not load.'));
      };
      document.head.append(script);
    });
  }

  async function connectRealtime() {
    if (client || connecting) return;
    connecting = true;
    try {
      await loadSdk();
      client = window.supabase.createClient(giftConfig.url, giftConfig.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
      client.channel('gift-availability')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'gift_items' }, () => {
          if (active && !document.hidden) refresh();
        })
        .subscribe((state, error) => {
          realtimeReady = state === 'SUBSCRIBED';
          updateSyncStatus();
          if (realtimeReady && active && !document.hidden) refresh();
          if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
            console.error('Gift live updates are unavailable; timed refresh remains active:', error || state);
          }
        });
    } catch (error) {
      realtimeReady = false;
      console.error('Gift live updates are unavailable; timed refresh remains active:', error);
      updateSyncStatus();
    } finally {
      connecting = false;
    }
  }

  function validateName() {
    const name = firstName.value.replace(/\s+/gu, ' ').trim();
    const valid = name.length > 0 && [...name].length <= 40 && !/[\u0000-\u001f\u007f]/u.test(name);
    firstName.setCustomValidity(valid ? '' : 'Please enter a first name between 1 and 40 characters.');
    return name;
  }

  firstName.addEventListener('input', validateName);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;
    const name = validateName();
    if (!form.reportValidity()) return;
    if (!available || !selected.size) {
      claimError.textContent = !available ? 'Refresh availability before confirming your gifts.' : 'Select at least one available gift.';
      claimError.hidden = false;
      claimError.focus();
      return;
    }
    const ids = [...selected].sort();
    submitting = true;
    claimError.hidden = true;
    confirmation.hidden = true;
    form.setAttribute('aria-busy', 'true');
    progress.textContent = 'Saving your gift selection. Please wait.';
    updateSelection();
    try {
      const claimed = validateRows(await request('rpc/claim_gift_items', { requested_ids: ids, guest_first_name: name }));
      if (claimed.length !== ids.length || !claimed.every(item => ids.includes(item.id) && item.claimed_first_name === name)) {
        throw new Error('The gift service did not confirm the entire selection.');
      }
      revision++;
      claimed.forEach(item => { items.set(item.id, item); selected.delete(item.id); });
      render([...items.values()].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)));
      selectionNotice.textContent = '';
      confirmation.textContent = `Thank you, ${name}. ${claimed.length === 1 ? 'Your gift is' : 'Your gifts are'} claimed: ${claimed.map(item => item.title).join(', ')}. Everyone can now see your first name beside ${claimed.length === 1 ? 'it' : 'them'}.`;
      confirmation.hidden = false;
      if (active) confirmation.focus();
    } catch (error) {
      available = false;
      claimError.textContent = error.code === '23505'
        ? 'One or more selected gifts were just claimed by someone else. None of the gifts in this request were reserved. Review the refreshed list and choose from what remains.'
        : error.code === '22023'
          ? 'Your selection could not be saved. Check your first name and choose available gifts from the refreshed list.'
          : 'We could not confirm your claim. It may have reached the server. Your entries are still here; check the refreshed availability before trying again.';
      claimError.hidden = false;
      if (active) claimError.focus();
      console.error('Gift claim could not be confirmed:', error);
    } finally {
      submitting = false;
      form.removeAttribute('aria-busy');
      progress.textContent = '';
      updateSelection();
      await refresh();
    }
  });

  refreshButton.addEventListener('click', () => {
    refresh();
    connectRealtime();
  });
  document.addEventListener('visibilitychange', () => {
    if (active && !document.hidden) refresh();
  });
  window.addEventListener('online', () => {
    if (active) { refresh(); connectRealtime(); }
  });
  window.addEventListener('offline', () => {
    if (!active) return;
    available = false;
    loadError.textContent = 'You are offline. Gift claiming is paused until availability can be refreshed.';
    loadError.hidden = false;
    updateSyncStatus();
    updateSelection();
  });

  return Object.freeze({
    activate() {
      active = true;
      refresh();
      connectRealtime();
      clearInterval(pollTimer);
      pollTimer = setInterval(() => {
        if (active && !document.hidden) refresh();
      }, pollInterval);
    },
    deactivate() {
      active = false;
      clearInterval(pollTimer);
      pollTimer = 0;
    }
  });
})();
