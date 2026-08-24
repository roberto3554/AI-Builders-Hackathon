/**
 * @fileoverview Popup UI logic for the Page Adapter extension.
 */
import { PRESETS, createUserRequest } from '../shared/messages.js';

const presetsContainer = document.querySelector('#presets');
const requestInput = document.querySelector('#request');
const adaptButton = document.querySelector('#adapt');
const status = document.querySelector('#status');
const counter = document.querySelector('#counter');

renderPresets();
updateCounter();

requestInput.addEventListener('input', updateCounter);
adaptButton.addEventListener('click', submitNaturalLanguage);

async function submitNaturalLanguage() {
  const request = requestInput.value.trim();

  if (!request) {
    setStatus('Type a need or select a quick action.', 'error');
    requestInput.focus();
    return;
  }

  await sendRequest(
    createUserRequest({
      mode: 'natural_language',
      request
    })
  );
}

function renderPresets() {
  for (const preset of PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset';
    const iconUrl = chrome.runtime.getURL(preset.icon || '');
    button.innerHTML = `
      <span class="preset-icon"><img src="${iconUrl}" alt="" /></span>
      <span>${escapeHtml(preset.label)}</span>
    `;

    button.addEventListener('click', () => {
      sendRequest(
        createUserRequest({
          mode: 'preset',
          request: preset.request,
          presetId: preset.id
        })
      );
    });

    presetsContainer.appendChild(button);
  }
}

async function sendRequest(message) {
  setLoading(true);
  setStatus('Sending request...');

  try {
    const response = await chrome.runtime.sendMessage(message);

    if (!response?.ok) {
      throw new Error(response?.error || 'Failed to send request.');
    }

    setStatus('Request sent to the page.', 'success');

    // Small delay so user can see the status briefly
    setTimeout(() => window.close(), 350);
  } catch (error) {
    setStatus(error.message || 'An error occurred.', 'error');
    setLoading(false);
  }
}

function setLoading(value) {
  adaptButton.disabled = value;
  document.querySelectorAll('.preset').forEach((button) => {
    button.disabled = value;
  });
}

function setStatus(message, type = '') {
  status.textContent = message;
  status.className = `status ${type}`.trim();
}

function updateCounter() {
  counter.textContent = `${requestInput.value.length} / 2000`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
