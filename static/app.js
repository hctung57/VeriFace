const referenceFormElement = document.querySelector('#reference-form');
const referenceListElement = document.querySelector('#reference-list');
const referenceCardTemplateElement = document.querySelector('#reference-card-template');
const browserStartButtonElement = document.querySelector('#browser-start-btn');
const browserStopButtonElement = document.querySelector('#browser-stop-btn');
const browserVideoElement = document.querySelector('#browser-video');
const browserStatusElement = document.querySelector('#browser-status');
const samplingIntervalRangeElement = document.querySelector('#sampling-interval');
const samplingIntervalValueElement = document.querySelector('#sampling-interval-value');
const referenceLabelInputElement = document.querySelector('#reference-label');
const referenceImageInputElement = document.querySelector('#reference-image');
const referenceUploadWrapElement = document.querySelector('.file-upload-wrap');
const referenceUploadPreviewElement = document.querySelector('#reference-image-preview');
const referenceUploadSubmitButtonElement = document.querySelector('#reference-upload-submit');
const resultsFilterElement = document.querySelector('#results-filter');
const resultsFilterButtonElements = document.querySelectorAll('.results-filter-btn');
const resultsListElement = document.querySelector('#results-list');
const resultItemTemplateElement = document.querySelector('#result-item-template');

const MIN_SAMPLING_INTERVAL_MS = 100;
const MAX_SAMPLING_INTERVAL_MS = 5000;
const DEFAULT_SAMPLING_INTERVAL_MS = 1000;

const state = {
  references: [],
  browser: {
    mediaStream: null,
    isRunning: false,
    timerId: null,
    requestInFlight: false,
    lastFrameCanvas: document.createElement('canvas'),
    captureScale: 0.65,
    frameIntervalMs: DEFAULT_SAMPLING_INTERVAL_MS,
    jpegQuality: 0.62,
  },
  results: [],
  resultsFilter: 'matched-only',
  uploadPreviewObjectUrl: null,
};

function validateRequiredElements() {
  const requiredElements = {
    referenceForm: referenceFormElement,
    referenceList: referenceListElement,
    referenceCardTemplate: referenceCardTemplateElement,
    browserStartBtn: browserStartButtonElement,
    browserStopBtn: browserStopButtonElement,
    browserVideo: browserVideoElement,
    samplingIntervalRange: samplingIntervalRangeElement,
    samplingIntervalValue: samplingIntervalValueElement,
    referenceLabelInput: referenceLabelInputElement,
    referenceImageInput: referenceImageInputElement,
    referenceUploadWrap: referenceUploadWrapElement,
    referenceUploadPreview: referenceUploadPreviewElement,
    referenceUploadSubmitBtn: referenceUploadSubmitButtonElement,
    resultsFilter: resultsFilterElement,
    resultsFilterButtons: resultsFilterButtonElements.length > 0 ? resultsFilterButtonElements : null,
    resultsList: resultsListElement,
    resultItemTemplate: resultItemTemplateElement,
  };

  const missingElements = Object.entries(requiredElements)
    .filter(([, element]) => !element)
    .map(([name]) => name);

  if (missingElements.length > 0) {
    throw new Error(`Missing required DOM elements: ${missingElements.join(', ')}`);
  }
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let detailText = 'Request failed';
    try {
      const responseJson = await response.json();
      detailText = responseJson.detail || JSON.stringify(responseJson);
    } catch {
      detailText = response.statusText;
    }
    throw new Error(detailText);
  }

  const hasBody = response.status !== 204;
  return hasBody ? response.json() : null;
}

function showToast(messageText, isError = false) {
  let toastStackElement = document.querySelector('#app-toast-stack');
  if (!toastStackElement) {
    toastStackElement = document.createElement('div');
    toastStackElement.id = 'app-toast-stack';
    toastStackElement.className = 'app-toast-stack';
    document.body.append(toastStackElement);
  }

  const toastElement = document.createElement('div');
  toastElement.textContent = messageText;
  toastElement.className = isError ? 'app-toast app-toast-error' : 'app-toast';
  toastStackElement.append(toastElement);
  window.setTimeout(() => {
    toastElement.remove();
    if (toastStackElement && toastStackElement.children.length === 0) {
      toastStackElement.remove();
    }
  }, 2600);
}

function updateUploadSubmitState() {
  const hasName = referenceLabelInputElement.value.trim().length > 0;
  const hasImage = Boolean(referenceImageInputElement.files && referenceImageInputElement.files.length > 0);
  referenceUploadSubmitButtonElement.disabled = !(hasName && hasImage);
}

function updateSelectedFileName() {
  const hasImage = Boolean(referenceImageInputElement.files && referenceImageInputElement.files.length > 0);

  if (state.uploadPreviewObjectUrl) {
    URL.revokeObjectURL(state.uploadPreviewObjectUrl);
    state.uploadPreviewObjectUrl = null;
  }

  if (!hasImage) {
    referenceUploadWrapElement.classList.remove('has-file');
    referenceUploadPreviewElement.removeAttribute('src');
    return;
  }

  const selectedFile = referenceImageInputElement.files[0];
  referenceUploadWrapElement.classList.add('has-file');
  state.uploadPreviewObjectUrl = URL.createObjectURL(selectedFile);
  referenceUploadPreviewElement.src = state.uploadPreviewObjectUrl;
}

function setBrowserStatus(statusText, isError = false) {
  if (!browserStatusElement) {
    return;
  }

  browserStatusElement.textContent = `Status: ${statusText}`;
  browserStatusElement.className = isError ? 'stream-stats err' : 'stream-stats';
}

function formatSamplingIntervalText(intervalMs) {
  if (intervalMs < 1000) {
    return `${intervalMs} ms`;
  }
  if (intervalMs < 60000) {
    return `${(intervalMs / 1000).toFixed(1)} s`;
  }

  const minutes = Math.floor(intervalMs / 60000);
  const seconds = Math.floor((intervalMs % 60000) / 1000);
  return seconds > 0 ? `${minutes} min ${seconds}s` : `${minutes} min`;
}

function applySamplingInterval(nextIntervalMs) {
  const safeIntervalMs = Math.min(MAX_SAMPLING_INTERVAL_MS, Math.max(MIN_SAMPLING_INTERVAL_MS, nextIntervalMs));
  state.browser.frameIntervalMs = safeIntervalMs;

  if (samplingIntervalRangeElement) {
    samplingIntervalRangeElement.value = String(safeIntervalMs);
  }
  if (samplingIntervalValueElement) {
    samplingIntervalValueElement.textContent = formatSamplingIntervalText(safeIntervalMs);
  }

  // Neu webcam dang chay, cap nhat timer de tan so moi co hieu luc ngay.
  if (state.browser.isRunning && state.browser.timerId !== null) {
    window.clearTimeout(state.browser.timerId);
    state.browser.timerId = window.setTimeout(processRecognitionFrame, state.browser.frameIntervalMs);
  }
}

function syncResultsFilterUi() {
  resultsFilterButtonElements.forEach((filterButtonElement) => {
    const filterMode = filterButtonElement.dataset.filterMode || 'all';
    filterButtonElement.classList.toggle('is-active', filterMode === state.resultsFilter);
  });
}

function getSelectedReferenceIds() {
  return [];
}

function getEffectiveReferenceIds() {
  // Khong con checkbox chon rieng, mac dinh so khop voi toan bo reference da upload.
  return state.references.map((referenceItem) => referenceItem.reference_id);
}

function renderReferenceList() {
  referenceListElement.innerHTML = '';
  if (state.references.length === 0) {
    return;
  }

  state.references.forEach((referenceItem) => {
    const cardFragment = referenceCardTemplateElement.content.cloneNode(true);
    const imageElement = cardFragment.querySelector('.reference-photo');
    const nameElement = cardFragment.querySelector('.reference-name');
    const idElement = cardFragment.querySelector('.reference-id');
    const deleteButtonElement = cardFragment.querySelector('.reference-delete');

    imageElement.src = `/api/references/${referenceItem.reference_id}/image`;
    imageElement.alt = `Reference: ${referenceItem.label}`;
    nameElement.textContent = referenceItem.label;
    idElement.textContent = `ID: ${referenceItem.reference_id.slice(0, 12)}...`;

    deleteButtonElement.addEventListener('click', async () => {
      try {
        await apiRequest(`/api/references/${referenceItem.reference_id}`, { method: 'DELETE' });
        await refreshReferences();
        showToast('Reference removed');
      } catch (error) {
        showToast(error.message, true);
      }
    });

    referenceListElement.append(cardFragment);
  });
}

async function refreshReferences() {
  const referenceItems = await apiRequest('/api/references');
  // Hien thi item moi nhat o dau strip.
  state.references = referenceItems.slice().reverse();
  renderReferenceList();
}

function syncCaptureCanvasSize() {
  const videoWidth = browserVideoElement.videoWidth;
  const videoHeight = browserVideoElement.videoHeight;
  if (videoWidth <= 0 || videoHeight <= 0) {
    return;
  }

  state.browser.lastFrameCanvas.width = Math.max(1, Math.floor(videoWidth * state.browser.captureScale));
  state.browser.lastFrameCanvas.height = Math.max(1, Math.floor(videoHeight * state.browser.captureScale));
}

function buildFaceCropDataUrl(frameCanvas, detection) {
  const frameWidth = frameCanvas.width;
  const frameHeight = frameCanvas.height;
  const boxWidth = Math.max(1, detection.right - detection.left);
  const boxHeight = Math.max(1, detection.bottom - detection.top);
  const paddingX = Math.floor(boxWidth * 0.15);
  const paddingY = Math.floor(boxHeight * 0.15);

  // Mo rong crop 15% moi chieu de nhin ro khuon mat hon.
  const left = Math.max(0, Math.min(frameWidth - 1, detection.left - paddingX));
  const top = Math.max(0, Math.min(frameHeight - 1, detection.top - paddingY));
  const right = Math.max(left + 1, Math.min(frameWidth, detection.right + paddingX));
  const bottom = Math.max(top + 1, Math.min(frameHeight, detection.bottom + paddingY));

  const cropWidth = right - left;
  const cropHeight = bottom - top;
  const cropCanvas = document.createElement('canvas');
  const cropContext = cropCanvas.getContext('2d');
  cropCanvas.width = cropWidth;
  cropCanvas.height = cropHeight;

  cropContext.drawImage(frameCanvas, left, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return cropCanvas.toDataURL('image/jpeg', 0.86);
}

function addDetectionsToHistory(detections, frameCanvas) {
  if (!detections || detections.length === 0) {
    return;
  }

  const timestampText = new Date().toLocaleTimeString();
  const batchResults = detections.map((detection) => {
    const distanceValue = Number(detection.distance ?? 1);
    const identityText = detection.label || 'Unknown';

    return {
      timestamp: timestampText,
      identity: identityText,
      isMatch: Boolean(detection.is_match),
      confidenceText: `${Math.max(0, (1 - distanceValue) * 100).toFixed(1)}%`,
      cropBase64: buildFaceCropDataUrl(frameCanvas, detection),
    };
  });

  // Dua item moi len dau danh sach theo thu tu xuat hien moi nhat.
  const resultsToPrepend = [...batchResults].reverse();
  state.results = resultsToPrepend.concat(state.results).slice(0, 50);

  prependResultsIncrementally(resultsToPrepend);
}

function createResultItemFragment(result) {
  const itemFragment = resultItemTemplateElement.content.cloneNode(true);
  const nameElement = itemFragment.querySelector('.result-name');
  const timestampElement = itemFragment.querySelector('.result-timestamp');
  const cropElement = itemFragment.querySelector('.result-crop');
  const identityElement = itemFragment.querySelector('.result-identity');
  const confidenceElement = itemFragment.querySelector('.result-confidence');

  nameElement.textContent = result.identity;
  timestampElement.textContent = result.timestamp;
  cropElement.src = result.cropBase64;
  identityElement.textContent = result.isMatch ? 'Matched uploaded face' : 'Unknown face';
  confidenceElement.textContent = result.confidenceText;

  identityElement.classList.remove('result-positive', 'result-negative');
  confidenceElement.classList.remove('result-positive', 'result-negative');
  if (result.isMatch) {
    identityElement.classList.add('result-positive');
    confidenceElement.classList.add('result-positive');
  } else {
    identityElement.classList.add('result-negative');
    confidenceElement.classList.add('result-negative');
  }

  return itemFragment;
}

function prependResultsIncrementally(newResults) {
  const emptyElement = resultsListElement.querySelector('.empty-results');
  if (emptyElement) {
    emptyElement.remove();
  }

  const prependFragment = document.createDocumentFragment();
  newResults.forEach((result) => {
    prependFragment.append(createResultItemFragment(result));
  });
  resultsListElement.prepend(prependFragment);

  trimHistoryDomToLimit(50);
}

function trimHistoryDomToLimit(limit) {
  const resultCards = resultsListElement.querySelectorAll('.result-item');
  for (let index = limit; index < resultCards.length; index += 1) {
    resultCards[index].remove();
  }

  if (resultsListElement.children.length === 0) {
    renderResultsList();
  }
}

function renderResultsList() {
  resultsListElement.innerHTML = '';

  if (state.results.length === 0) {
    const emptyElement = document.createElement('p');
    emptyElement.className = 'empty-results';
    emptyElement.textContent = 'No detection results yet. Start webcam to begin automatic recognition.';
    resultsListElement.append(emptyElement);
    return;
  }

  const fullFragment = document.createDocumentFragment();
  state.results.forEach((result) => {
    fullFragment.append(createResultItemFragment(result));
  });
  resultsListElement.append(fullFragment);
}

async function processRecognitionFrame() {
  if (!state.browser.isRunning || state.browser.requestInFlight) {
    return;
  }

  const captureContext = state.browser.lastFrameCanvas.getContext('2d');
  if (!captureContext) {
    setBrowserStatus('cannot capture frame context', true);
    return;
  }

  state.browser.requestInFlight = true;

  try {
    captureContext.drawImage(
      browserVideoElement,
      0,
      0,
      state.browser.lastFrameCanvas.width,
      state.browser.lastFrameCanvas.height,
    );

    const frameBase64 = state.browser.lastFrameCanvas.toDataURL('image/jpeg', state.browser.jpegQuality);
    const response = await apiRequest('/api/browser-recognition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: frameBase64,
        reference_ids: getEffectiveReferenceIds(),
        result_mode: state.resultsFilter,
      }),
    });

    const detections = response.detections || [];
    addDetectionsToHistory(detections, state.browser.lastFrameCanvas);

    if (detections.length > 0) {
      const matchedCount = detections.filter((detection) => Boolean(detection.is_match)).length;
      setBrowserStatus(`processed frame: ${detections.length} face(s), ${matchedCount} matched`);
    } else {
      setBrowserStatus('processed frame: no faces detected');
    }
  } catch (error) {
    setBrowserStatus(`recognition error: ${error.message}`, true);
  } finally {
    state.browser.requestInFlight = false;

    if (state.browser.isRunning) {
      state.browser.timerId = window.setTimeout(processRecognitionFrame, state.browser.frameIntervalMs);
    }
  }
}

async function startBrowserWebcam() {
  if (state.browser.isRunning) {
    return;
  }

  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (!window.isSecureContext && !isLocalhost) {
    showToast('Warning: browser may block webcam access over HTTP on non-localhost hosts', true);
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setBrowserStatus('this browser does not support getUserMedia', true);
    return;
  }

  let mediaStream;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false,
    });
  } catch (error) {
    console.error('getUserMedia error:', error);

    // Loi cap quyen camera that bai (thiet bi/permission/security).
    if (error.name === 'NotAllowedError') {
      setBrowserStatus('camera permission denied by browser', true);
      showToast('Camera permission denied. Please allow camera access in browser settings.', true);
      return;
    }
    if (error.name === 'NotFoundError') {
      setBrowserStatus('no webcam device found', true);
      showToast('No webcam device found on this machine.', true);
      return;
    }
    if (error.name === 'NotReadableError') {
      setBrowserStatus('webcam is busy (used by another app)', true);
      showToast('Webcam is being used by another app/tab.', true);
      return;
    }

    setBrowserStatus(`cannot open webcam: ${error.message}`, true);
    showToast(error.message || 'Webcam access error', true);
    return;
  }

  try {
    state.browser.mediaStream = mediaStream;
    browserVideoElement.srcObject = mediaStream;
    await browserVideoElement.play();
    syncCaptureCanvasSize();

    state.browser.isRunning = true;
    setBrowserStatus(`webcam running - auto recognition every ${formatSamplingIntervalText(state.browser.frameIntervalMs)}`);
    state.browser.timerId = window.setTimeout(processRecognitionFrame, state.browser.frameIntervalMs);
  } catch (error) {
    console.error('video.play error:', error);

    // Neu play() fail sau khi da co stream, thu cleanup stream de tranh leak.
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
    }
    state.browser.mediaStream = null;
    browserVideoElement.srcObject = null;

    setBrowserStatus(`webcam stream created but video playback failed: ${error.message}`, true);
    showToast('Webcam opened but browser could not start video playback. Please reload and try again.', true);
  }
}

function stopBrowserWebcam() {
  state.browser.isRunning = false;

  if (state.browser.timerId !== null) {
    window.clearTimeout(state.browser.timerId);
    state.browser.timerId = null;
  }

  if (state.browser.mediaStream) {
    state.browser.mediaStream.getTracks().forEach((track) => track.stop());
    state.browser.mediaStream = null;
  }

  browserVideoElement.srcObject = null;
  setBrowserStatus('stopped');
}

referenceFormElement.addEventListener('submit', async (event) => {
  event.preventDefault();

  const hasName = referenceLabelInputElement.value.trim().length > 0;
  if (!hasName) {
    showToast('Please enter display name', true);
    return;
  }

  if (!referenceImageInputElement.files || referenceImageInputElement.files.length === 0) {
    showToast('Please choose a face image', true);
    return;
  }

  const formData = new FormData();
  formData.append('label', referenceLabelInputElement.value.trim());
  formData.append('image', referenceImageInputElement.files[0]);

  try {
    const createdReference = await apiRequest('/api/references', { method: 'POST', body: formData });
    state.references = [
      createdReference,
      ...state.references.filter((item) => item.reference_id !== createdReference.reference_id),
    ];
    renderReferenceList();

    referenceFormElement.reset();
    updateSelectedFileName();
    updateUploadSubmitState();
    showToast('Reference uploaded successfully');
  } catch (error) {
    showToast(error.message, true);
  }
});

referenceLabelInputElement.addEventListener('input', () => {
  updateUploadSubmitState();
});

referenceImageInputElement.addEventListener('change', () => {
  updateSelectedFileName();
  updateUploadSubmitState();
});

browserVideoElement.addEventListener('loadedmetadata', () => {
  syncCaptureCanvasSize();
});

window.addEventListener('resize', () => {
  syncCaptureCanvasSize();
});

browserStartButtonElement.addEventListener('click', () => {
  startBrowserWebcam().catch((error) => showToast(error.message, true));
});

browserStopButtonElement.addEventListener('click', () => {
  stopBrowserWebcam();
});

samplingIntervalRangeElement.addEventListener('input', (event) => {
  const intervalMs = Number(event.target.value);
  applySamplingInterval(intervalMs);
});

window.addEventListener('beforeunload', () => {
  if (state.uploadPreviewObjectUrl) {
    URL.revokeObjectURL(state.uploadPreviewObjectUrl);
  }
  stopBrowserWebcam();
});

resultsFilterButtonElements.forEach((filterButtonElement) => {
  filterButtonElement.addEventListener('click', () => {
    const nextFilterMode = filterButtonElement.dataset.filterMode || 'all';
    if (nextFilterMode === state.resultsFilter) {
      return;
    }

    state.resultsFilter = nextFilterMode;
    syncResultsFilterUi();
    // Clear log de dong bo voi che do backend moi.
    state.results = [];
    renderResultsList();
  });
});

try {
  validateRequiredElements();
  updateSelectedFileName();
  updateUploadSubmitState();
  applySamplingInterval(DEFAULT_SAMPLING_INTERVAL_MS);
  syncResultsFilterUi();
  renderResultsList();
  refreshReferences().catch((error) => showToast(error.message, true));
} catch (error) {
  console.error(error.message);
  document.body.innerHTML = `<div style="padding: 2rem; color: red;"><h2>Error: Missing UI elements</h2><p>${error.message}</p></div>`;
}
